const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const { authMiddleware } = require("../middleware/auth");

const router = express.Router();

const UPLOAD_DIR = path.join(__dirname, "..", "uploads");

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const ALLOWED_TYPES = {
  "image/jpeg": "image",
  "image/png": "image",
  "image/gif": "image",
  "image/webp": "image",
  "video/mp4": "video",
  "video/webm": "video",
  "video/quicktime": "video",
  "audio/mpeg": "audio",
  "audio/ogg": "audio",
  "audio/webm": "audio",
  "audio/wav": "audio",
  "audio/mp4": "audio",
  "audio/aac": "audio",
  "application/pdf": "file",
  "text/plain": "file",
  "application/zip": "file",
  "application/x-rar-compressed": "file",
  "application/x-7z-compressed": "file",
  "application/msword": "file",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "file",
  "application/vnd.ms-excel": "file",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "file"
};

const MAX_SIZE = 50 * 1024 * 1024;
const CHUNK_DIR = path.join(UPLOAD_DIR, "chunks");
if (!fs.existsSync(CHUNK_DIR)) fs.mkdirSync(CHUNK_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || "";
    const name = crypto.randomBytes(16).toString("hex") + ext;
    cb(null, name);
  }
});

const fileFilter = (req, file, cb) => {
  if (ALLOWED_TYPES[file.mimetype]) {
    cb(null, true);
  } else {
    cb(new Error("Неподдерживаемый тип файла"), false);
  }
};

const upload = multer({ storage, fileFilter, limits: { fileSize: MAX_SIZE } });

const chunkStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(CHUNK_DIR, req.params.uploadId);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => cb(null, `chunk_${req.body.index || 0}`)
});

const chunkUpload = multer({
  storage: chunkStorage,
  fileFilter,
  limits: { fileSize: MAX_SIZE }
});

router.post("/", authMiddleware, (req, res) => {
  upload.single("file")(req, res, (err) => {
    if (err) {
      if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
        return res.json({ ok: false, error: "Файл слишком большой (макс 50MB)" });
      }
      return res.json({ ok: false, error: err.message || "Ошибка загрузки" });
    }
    if (!req.file) {
      return res.json({ ok: false, error: "Файл не выбран" });
    }

    const type = ALLOWED_TYPES[req.file.mimetype] || "file";
    const forceType = req.body.forceType;
    const finalType = ["voice", "round"].includes(forceType) ? forceType : type;
    const url = `/uploads/${req.file.filename}`;

    res.json({
      ok: true,
      file: {
        type: finalType,
        url,
        name: req.file.originalname,
        size: req.file.size,
        mime: req.file.mimetype
      }
    });
  });
});

router.post("/chunk/init", authMiddleware, async (req, res) => {
  try {
    const { name, size, mime } = req.body;
    if (size > MAX_SIZE) {
      return res.json({ ok: false, error: "Файл слишком большой (макс 50MB)" });
    }
    if (!ALLOWED_TYPES[mime]) {
      return res.json({ ok: false, error: "Неподдерживаемый тип файла" });
    }
    const uploadId = crypto.randomBytes(12).toString("hex");
    const dir = path.join(CHUNK_DIR, uploadId);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "meta.json"), JSON.stringify({
      name, size, mime, owner: req.user.username, createdAt: Date.now()
    }));
    res.json({ ok: true, uploadId });
  } catch (err) {
    res.json({ ok: false, error: "init_failed" });
  }
});

router.post("/chunk/:uploadId", authMiddleware, (req, res) => {
  const dir = path.join(CHUNK_DIR, req.params.uploadId);
  if (!fs.existsSync(dir)) return res.json({ ok: false, error: "no_init" });
  try {
    const meta = JSON.parse(fs.readFileSync(path.join(dir, "meta.json"), "utf8"));
    if (meta.owner !== req.user.username) {
      return res.json({ ok: false, error: "forbidden" });
    }
  } catch {
    return res.json({ ok: false, error: "no_meta" });
  }
  chunkUpload.single("chunk")(req, res, (err) => {
    try {
      if (err) return res.json({ ok: false, error: err.message });
      res.json({ ok: true, index: parseInt(req.body.index || 0) });
    } catch (e) {
      res.json({ ok: false, error: "chunk_failed" });
    }
  });
});

router.post("/chunk/:uploadId/complete", authMiddleware, async (req, res) => {
  const dir = path.join(CHUNK_DIR, req.params.uploadId);
  if (!fs.existsSync(dir)) return res.json({ ok: false, error: "no_init" });
  let meta;
  try {
    meta = JSON.parse(fs.readFileSync(path.join(dir, "meta.json"), "utf8"));
    if (meta.owner !== req.user.username) {
      return res.json({ ok: false, error: "forbidden" });
    }
  } catch {
    return res.json({ ok: false, error: "no_meta" });
  }

  try {
    const ext = path.extname(meta.name) || "";
    const fname = crypto.randomBytes(16).toString("hex") + ext;
    const target = path.join(UPLOAD_DIR, fname);

    const chunks = fs.readdirSync(dir)
      .filter(f => f.startsWith("chunk_"))
      .sort((a, b) => parseInt(a.split("_")[1]) - parseInt(b.split("_")[1]));

    let totalSize = 0;
    const out = fs.createWriteStream(target);
    for (const c of chunks) {
      const data = fs.readFileSync(path.join(dir, c));
      totalSize += data.length;
      if (totalSize > MAX_SIZE) {
        out.destroy();
        fs.rmSync(dir, { recursive: true, force: true });
        if (fs.existsSync(target)) fs.unlinkSync(target);
        return res.json({ ok: false, error: "Файл слишком большой (макс 50MB)" });
      }
      out.write(data);
    }
    out.end();
    await new Promise((resolve, reject) => {
      out.on("finish", resolve);
      out.on("error", reject);
    });
    fs.rmSync(dir, { recursive: true, force: true });

    const type = ALLOWED_TYPES[meta.mime] || "file";
    const forceType = req.body.forceType;
    const finalType = ["voice", "round"].includes(forceType) ? forceType : type;
    res.json({
      ok: true,
      file: { type: finalType, url: `/uploads/${fname}`, name: meta.name, size: meta.size, mime: meta.mime }
    });
  } catch (e) {
    if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
    res.json({ ok: false, error: "complete_failed" });
  }
});

router.post("/delete", authMiddleware, async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.json({ ok: false });
    const filepath = path.join(UPLOAD_DIR, path.basename(url));
    if (fs.existsSync(filepath)) {
      fs.unlinkSync(filepath);
    }
    res.json({ ok: true });
  } catch (err) {
    res.json({ ok: false });
  }
});

module.exports = router;
