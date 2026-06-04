// Создание групп и каналов, инфо, добавление/удаление участников
const express = require("express");
const router = express.Router();
const chatsRepo = require("../db/repos/chats");
const usersRepo = require("../db/repos/users");
const { authRequired } = require("../middleware/auth");
const audit = require("../db/repos/audit");

router.post("/", authRequired, async (req, res) => {
  const { type = "group", title, username, description, isPublic = false, members = [] } = req.body || {};
  if (!title || !title.trim()) {
    return res.status(400).json({ ok: false, error: "Укажите название" });
  }
  if (type === "group" && (title.length < 3 || title.length > 128)) {
    return res.status(400).json({ ok: false, error: "Название 3-128 символов" });
  }
  if (username) {
    if (!/^[a-z0-9_]{3,32}$/.test(username)) {
      return res.status(400).json({ ok: false, error: "Username: 3-32, a-z, 0-9, _" });
    }
  }
  const memberIds = [];
  for (const m of members) {
    if (typeof m === "string") {
      const u = await usersRepo.findByUsername(m);
      if (u) memberIds.push(u.id);
    } else if (typeof m === "number") {
      memberIds.push(m);
    }
  }
  const chat = await chatsRepo.createGroup({
    ownerId: req.user.id,
    type,
    title: title.trim(),
    username: username || null,
    description: description || null,
    isPublic: !!isPublic,
    members: memberIds
  });
  await audit.log({
    actorId: req.user.id, action: "group.create",
    targetType: "chat", targetId: chat.id, newValue: { type, title, username },
    ipAddress: req.ip
  });
  res.json({ ok: true, chat });
});

router.get("/:chatId", authRequired, async (req, res) => {
  const chatId = parseInt(req.params.chatId);
  const chat = await chatsRepo.findById(chatId);
  if (!chat) return res.status(404).json({ ok: false, error: "Не найден" });
  const isMember = await chatsRepo.isMember(chatId, req.user.id);
  if (!isMember && !chat.isPublic) return res.status(403).json({ ok: false, error: "Нет доступа" });
  const members = await chatsRepo.getMembers(chatId);
  res.json({ ok: true, chat, members });
});

router.post("/:chatId/members", authRequired, async (req, res) => {
  const chatId = parseInt(req.params.chatId);
  const { usernames = [] } = req.body || {};
  const chat = await chatsRepo.findById(chatId);
  if (!chat) return res.status(404).json({ ok: false, error: "Не найден" });
  const isMember = await chatsRepo.isMember(chatId, req.user.id);
  if (!isMember) return res.status(403).json({ ok: false, error: "Нет доступа" });
  for (const uname of usernames) {
    const u = await usersRepo.findByUsername(uname);
    if (u) await chatsRepo.addMember(chatId, u.id);
  }
  res.json({ ok: true });
});

router.delete("/:chatId/members/:username", authRequired, async (req, res) => {
  const chatId = parseInt(req.params.chatId);
  const target = await usersRepo.findByUsername(req.params.username);
  if (!target) return res.status(404).json({ ok: false, error: "Не найден" });
  const me = await usersRepo.findById(req.user.id);
  const isOwner = (await chatsRepo.findById(chatId))?.ownerId === me.id;
  const isSelf = target.id === me.id;
  if (!isOwner && !isSelf) return res.status(403).json({ ok: false, error: "Нет прав" });
  await chatsRepo.removeMember(chatId, target.id);
  res.json({ ok: true });
});

module.exports = router;
