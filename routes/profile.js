// Профиль текущего пользователя и других пользователей
const express = require("express");
const router = express.Router();
const usersRepo = require("../db/repos/users");
const messagesRepo = require("../db/repos/messages");
const chatsRepo = require("../db/repos/chats");
const { authRequired } = require("../middleware/auth");

router.get("/", authRequired, async (req, res) => {
  const user = await usersRepo.findById(req.user.id);
  if (!user) return res.status(404).json({ ok: false, error: "Не найден" });
  res.json({ ok: true, user: usersRepo.rowToUser(user) });
});

router.patch("/", authRequired, async (req, res) => {
  const { firstName, lastName, bio, avatarUrl } = req.body || {};
  if (firstName !== undefined && (!firstName || !firstName.trim())) {
    return res.status(400).json({ ok: false, error: "Имя не может быть пустым" });
  }
  const user = await usersRepo.updateProfile(req.user.username, { firstName, lastName, bio, avatarUrl });
  res.json({ ok: true, user: usersRepo.rowToUser(user) });
});

router.get("/contacts", authRequired, async (req, res) => {
  const contacts = await usersRepo.getContacts(req.user.username);
  res.json({ ok: true, contacts });
});

router.post("/contacts/:username", authRequired, async (req, res) => {
  const target = await usersRepo.findByUsername(req.params.username);
  if (!target) return res.status(404).json({ ok: false, error: "Пользователь не найден" });
  await usersRepo.addContact(req.user.username, req.params.username);
  res.json({ ok: true });
});

router.delete("/contacts/:username", authRequired, async (req, res) => {
  await usersRepo.removeContact(req.user.username, req.params.username);
  res.json({ ok: true });
});

// Чат с конкретным пользователем (DM)
router.post("/dm/:username", authRequired, async (req, res) => {
  const target = await usersRepo.findByUsername(req.params.username);
  if (!target) return res.status(404).json({ ok: false, error: "Пользователь не найден" });
  if (target.username === req.user.username) {
    return res.status(400).json({ ok: false, error: "Нельзя создать чат с собой" });
  }
  const me = await usersRepo.findById(req.user.id);
  const chat = await chatsRepo.findOrCreateDM(me.id, target.id);
  res.json({ ok: true, chat });
});

module.exports = router;
