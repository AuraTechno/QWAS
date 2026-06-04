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
  "video/mp4": "file",
  "audio/mpeg": "audio",
  "audio/ogg": "audio",
  "audio/webm": "audio",
  "application/pdf": "file",
  "text/plain": "file",
  "application/zip": "file",
  "application/x-rar-compressed": "file"
};

const MAX_SIZE = 20 * 1024 * 1024;

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
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
        return res.json({ ok: false, error: "Файл слишком большой (макс 20MB)" });
      }
      return res.json({ ok: false, error: err.message || "Ошибка загрузки" });
    }
    if (!req.file) {
      return res.json({ ok: false, error: "Файл не выбран" });
    }

    const type = ALLOWED_TYPES[req.file.mimetype] || "file";
    const url = `/uploads/${req.file.filename}`;

    res.json({
      ok: true,
      file: {
        type,
        url,
        name: req.file.originalname,
        size: req.file.size
      }
    });
  });
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
