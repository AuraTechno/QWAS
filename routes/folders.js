// Папки чатов
const express = require("express");
const router = express.Router();
const foldersRepo = require("../db/repos/folders");
const { authRequired } = require("../middleware/auth");

router.get("/", authRequired, async (req, res) => {
  const folders = await foldersRepo.list(req.user.username);
  res.json({ ok: true, folders });
});

router.post("/", authRequired, async (req, res) => {
  const { name, emoji, color } = req.body || {};
  if (!name || !name.trim()) return res.status(400).json({ ok: false, error: "Укажите имя" });
  const folder = await foldersRepo.create({ username: req.user.username, name: name.trim(), emoji, color });
  res.json({ ok: true, folder });
});

router.patch("/:id", authRequired, async (req, res) => {
  const id = parseInt(req.params.id);
  const folder = await foldersRepo.update(id, req.user.username, req.body || {});
  res.json({ ok: true, folder });
});

router.delete("/:id", authRequired, async (req, res) => {
  const id = parseInt(req.params.id);
  await foldersRepo.remove(id, req.user.username);
  res.json({ ok: true });
});

router.post("/:id/chats/:chatId", authRequired, async (req, res) => {
  const id = parseInt(req.params.id);
  const chatId = parseInt(req.params.chatId);
  await foldersRepo.addChatToFolder(req.user.username, chatId, id);
  res.json({ ok: true });
});

module.exports = router;
