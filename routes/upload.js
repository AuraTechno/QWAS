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
  "image/svg+xml": "image",
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
    const uploadId = crypto.randomBytes(12).toString("hex");
    const dir = path.join(UPLOAD_DIR, "chunks", uploadId);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "meta.json"), JSON.stringify({ name, size, mime, owner: req.user.username }));
    res.json({ ok: true, uploadId });
  } catch (err) {
    res.json({ ok: false, error: "init_failed" });
  }
});

router.post("/chunk/:uploadId", authMiddleware, (req, res) => {
  upload.single("chunk")(req, res, (err) => {
    try {
      if (err) return res.json({ ok: false, error: err.message });
      const dir = path.join(UPLOAD_DIR, "chunks", req.params.uploadId);
      if (!fs.existsSync(dir)) return res.json({ ok: false, error: "no_init" });
      const idx = req.body.index || "0";
      const tmp = req.file.path;
      const target = path.join(dir, `chunk_${idx}`);
      fs.renameSync(tmp, target);
      res.json({ ok: true, index: parseInt(idx) });
    } catch (e) {
      res.json({ ok: false, error: "chunk_failed" });
    }
  });
});

router.post("/chunk/:uploadId/complete", authMiddleware, (req, res) => {
  try {
    const dir = path.join(UPLOAD_DIR, "chunks", req.params.uploadId);
    const meta = JSON.parse(fs.readFileSync(path.join(dir, "meta.json"), "utf8"));
    if (meta.size > MAX_SIZE) {
      fs.rmSync(dir, { recursive: true, force: true });
      return res.json({ ok: false, error: "Файл слишком большой (макс 50MB)" });
    }
    const ext = path.extname(meta.name) || "";
    const fname = crypto.randomBytes(16).toString("hex") + ext;
    const target = path.join(UPLOAD_DIR, fname);

    const chunks = fs.readdirSync(dir).filter(f => f.startsWith("chunk_")).sort((a, b) => {
      return parseInt(a.split("_")[1]) - parseInt(b.split("_")[1]);
    });
    const out = fs.createWriteStream(target);
    for (const c of chunks) {
      const data = fs.readFileSync(path.join(dir, c));
      out.write(data);
    }
    out.end();
    fs.rmSync(dir, { recursive: true, force: true });

    const type = ALLOWED_TYPES[meta.mime] || "file";
    const forceType = req.body.forceType;
    const finalType = ["voice", "round"].includes(forceType) ? forceType : type;
    res.json({
      ok: true,
      file: { type: finalType, url: `/uploads/${fname}`, name: meta.name, size: meta.size, mime: meta.mime }
    });
  } catch (e) {
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
