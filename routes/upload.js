// Чанковая загрузка файлов (init / chunk / complete / abort / delete)
const express = require("express");
const router = express.Router();
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const crypto = require("crypto");
const multer = require("multer");
const config = require("../config");
const { authRequired } = require("../middleware/auth");
const audit = require("../db/repos/audit");
const db = require("../db/pg");

// === Хранилище активных загрузок (в памяти процесса) ===
// uploadId -> { owner, name, size, mime, type, chunks: [size...], received: int, finished: bool }
const activeUploads = new Map();

const CHUNK_DIR = path.resolve(config.CHUNK_DIR);
const UPLOAD_DIR = path.resolve(config.UPLOAD_DIR);

// Убедимся что директории существуют
for (const dir of [CHUNK_DIR, UPLOAD_DIR]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

const ALLOWED_MIME_PREFIXES = ["image/", "video/", "audio/"];
const ALLOWED_MIME_EXACT = [
  "application/pdf",
  "application/zip",
  "application/x-rar-compressed",
  "application/x-7z-compressed",
  "application/json",
  "application/octet-stream",
  "text/plain",
  "text/csv"
];

function isAllowedMime(mime) {
  if (!mime) return true;
  if (ALLOWED_MIME_EXACT.includes(mime)) return true;
  return ALLOWED_MIME_PREFIXES.some(p => mime.startsWith(p));
}

// multer с записью чанка в файл на диск
const chunkStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const id = req.params.id;
    if (!id) return cb(new Error("NO_ID"));
    const dir = path.join(CHUNK_DIR, id);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const idx = parseInt(req.body.index || req.headers["x-chunk-index"] || "0");
    cb(null, `chunk_${String(idx).padStart(6, "0")}`);
  }
});
const chunkUpload = multer({
  storage: chunkStorage,
  limits: { fileSize: config.MAX_CHUNK_SIZE + 1024 }
});

// === INIT ===
router.post("/chunk/init", authRequired, async (req, res) => {
  const { name, size, mime, type, forceType } = req.body || {};
  if (!name || !size) {
    return res.status(400).json({ ok: false, error: "name и size обязательны" });
  }
  if (size > config.MAX_FILE_SIZE) {
    return res.status(413).json({ ok: false, error: "Файл слишком большой" });
  }
  if (mime && !isAllowedMime(mime)) {
    return res.status(415).json({ ok: false, error: "Тип файла не разрешён" });
  }
  const id = crypto.randomBytes(16).toString("hex");
  activeUploads.set(id, {
    owner: req.user.username,
    ownerId: req.user.id,
    name,
    size,
    mime: mime || "application/octet-stream",
    type: type || forceType || "file",
    chunks: [],
    received: 0,
    finished: false
  });
  // Удалим через 1 час если не завершено
  setTimeout(() => {
    const meta = activeUploads.get(id);
    if (meta && !meta.finished) {
      activeUploads.delete(id);
      fsp.rm(path.join(CHUNK_DIR, id), { recursive: true, force: true }).catch(() => {});
    }
  }, 60 * 60 * 1000);

  res.json({ ok: true, uploadId: id, chunkSize: config.MAX_CHUNK_SIZE });
});

// === CHUNK ===
router.post("/chunk/:id", authRequired, chunkUpload.single("chunk"), async (req, res) => {
  const meta = activeUploads.get(req.params.id);
  if (!meta) {
    // cleanup orphan chunk
    if (req.file) fs.unlink(req.file.path, () => {});
    return res.status(404).json({ ok: false, error: "Загрузка не найдена" });
  }
  if (meta.owner !== req.user.username) {
    if (req.file) fs.unlink(req.file.path, () => {});
    return res.status(403).json({ ok: false, error: "Нет доступа" });
  }
  if (meta.finished) {
    if (req.file) fs.unlink(req.file.path, () => {});
    return res.status(409).json({ ok: false, error: "Загрузка уже завершена" });
  }
  if (!req.file) {
    return res.status(400).json({ ok: false, error: "Чанк не получен" });
  }
  const idx = parseInt(req.body.index || req.headers["x-chunk-index"] || "0");
  meta.chunks[idx] = req.file.size;
  meta.received++;
  res.json({ ok: true, index: idx, size: req.file.size });
});

// === COMPLETE ===
router.post("/chunk/:id/complete", authRequired, async (req, res) => {
  const meta = activeUploads.get(req.params.id);
  if (!meta) return res.status(404).json({ ok: false, error: "Загрузка не найдена" });
  if (meta.owner !== req.user.username) return res.status(403).json({ ok: false, error: "Нет доступа" });
  if (meta.finished) return res.status(409).json({ ok: false, error: "Уже завершено" });

  const dir = path.join(CHUNK_DIR, req.params.id);
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).sort() : [];
  const totalSize = files.reduce((s, f) => s + fs.statSync(path.join(dir, f)).size, 0);
  if (totalSize !== meta.size) {
    fsp.rm(dir, { recursive: true, force: true }).catch(() => {});
    activeUploads.delete(req.params.id);
    return res.status(400).json({ ok: false, error: `Размер не совпадает: ${totalSize} != ${meta.size}` });
  }

  // Финальное имя файла
  const ext = path.extname(meta.name) || "";
  const base = path.basename(meta.name, ext).replace(/[^\w\-. ]/g, "_").slice(0, 80);
  const finalName = `${Date.now().toString(36)}_${crypto.randomBytes(6).toString("hex")}_${base}${ext}`;
  const finalPath = path.join(UPLOAD_DIR, finalName);
  const writeStream = fs.createWriteStream(finalPath);
  try {
    for (const f of files) {
      const data = await fsp.readFile(path.join(dir, f));
      await new Promise((resolve, reject) => {
        if (writeStream.write(data)) resolve();
        else writeStream.once("drain", resolve);
        writeStream.once("error", reject);
      });
    }
    await new Promise((resolve, reject) => {
      writeStream.end(() => resolve());
      writeStream.once("error", reject);
    });
  } catch (err) {
    writeStream.destroy();
    fsp.rm(dir, { recursive: true, force: true }).catch(() => {});
    activeUploads.delete(req.params.id);
    return res.status(500).json({ ok: false, error: "Ошибка сборки файла" });
  }
  // cleanup чанки
  fsp.rm(dir, { recursive: true, force: true }).catch(() => {});
  meta.finished = true;
  activeUploads.delete(req.params.id);

  // Audit
  audit.log({
    actorId: req.user.id, action: "file.upload",
    targetType: "file", targetId: finalName,
    newValue: { name: meta.name, size: meta.size, mime: meta.mime },
    ipAddress: req.ip
  });

  const url = `/uploads/${finalName}`;
  res.json({
    ok: true,
    file: {
      url,
      name: meta.name,
      size: meta.size,
      mime: meta.mime,
      type: meta.type
    }
  });
});

// === ABORT ===
router.delete("/chunk/:id", authRequired, async (req, res) => {
  const meta = activeUploads.get(req.params.id);
  if (meta && meta.owner !== req.user.username) return res.status(403).json({ ok: false });
  activeUploads.delete(req.params.id);
  await fsp.rm(path.join(CHUNK_DIR, req.params.id), { recursive: true, force: true }).catch(() => {});
  res.json({ ok: true });
});

// === DELETE uploaded ===
router.delete("/file", authRequired, async (req, res) => {
  const { url } = req.body || {};
  if (!url || !url.startsWith("/uploads/")) return res.status(400).json({ ok: false });
  const filename = path.basename(url);
  const filePath = path.join(UPLOAD_DIR, filename);
  // Разрешаем удалять только если владелец (опционально — добавить мета в БД)
  if (fs.existsSync(filePath)) {
    await fsp.unlink(filePath).catch(() => {});
  }
  res.json({ ok: true });
});

// === Простая загрузка одним POST (для маленьких файлов) ===
const simpleStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || "";
    const base = path.basename(file.originalname, ext).replace(/[^\w\-. ]/g, "_").slice(0, 80);
    cb(null, `${Date.now().toString(36)}_${crypto.randomBytes(6).toString("hex")}_${base}${ext}`);
  }
});
const simpleUpload = multer({
  storage: simpleStorage,
  limits: { fileSize: 2 * 1024 * 1024 }
});
router.post("/", authRequired, simpleUpload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ ok: false, error: "Файл не получен" });
  audit.log({
    actorId: req.user.id, action: "file.upload_simple",
    targetType: "file", targetId: req.file.filename,
    newValue: { name: req.file.originalname, size: req.file.size },
    ipAddress: req.ip
  });
  res.json({
    ok: true,
    file: {
      url: `/uploads/${req.file.filename}`,
      name: req.file.originalname,
      size: req.file.size,
      mime: req.file.mimetype,
      type: (req.body && req.body.type) || "file"
    }
  });
});

module.exports = router;
