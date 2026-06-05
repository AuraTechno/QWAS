// Список чатов, медиа, инфо, закрепить/архив/мут, прочитать
const express = require("express");
const router = express.Router();
const chatsRepo = require("../db/repos/chats");
const messagesRepo = require("../db/repos/messages");
const usersRepo = require("../db/repos/users");
const cache = require("../utils/cache");
const { authRequired } = require("../middleware/auth");

router.get("/", authRequired, async (req, res) => {
  const tab = req.query.tab || "all";
  const cacheKey = `chats:${req.user.username}:${tab}`;
  const cached = await cache.get(cacheKey);
  if (cached) return res.json({ ...cached, cached: true });
  const chats = await chatsRepo.getUserChats(req.user.username, { tab });
  const totalUnread = await chatsRepo.getTotalUnread(req.user.username);
  const payload = { ok: true, chats, totalUnread };
  cache.set(cacheKey, payload, 30);
  res.json(payload);
});

router.get("/archived", authRequired, async (req, res) => {
  const all = await chatsRepo.getUserChats(req.user.username, { tab: "all" });
  res.json({ ok: true, chats: all.filter(c => c.isArchived) });
});

router.get("/pinned", authRequired, async (req, res) => {
  const pinned = await chatsRepo.getPinnedChats(req.user.username);
  res.json({ ok: true, chats: pinned });
});

router.get("/:chatId", authRequired, async (req, res) => {
  const chatId = parseInt(req.params.chatId);
  if (!chatId) return res.status(400).json({ ok: false, error: "Неверный ID" });
  const userChat = await chatsRepo.getUserChat(req.user.username, chatId);
  if (!userChat) return res.status(404).json({ ok: false, error: "Чат не найден" });
  res.json({ ok: true, chat: userChat });
});

router.get("/:chatId/info", authRequired, async (req, res) => {
  const chatId = parseInt(req.params.chatId);
  const userChat = await chatsRepo.getUserChat(req.user.username, chatId);
  if (!userChat) return res.status(404).json({ ok: false, error: "Чат не найден" });
  const members = await chatsRepo.getMembers(chatId);
  const pinned = await chatsRepo.getPinnedMessage(chatId);
  res.json({ ok: true, chat: userChat, members, pinnedMessage: pinned });
});

router.get("/:chatId/pinned", authRequired, async (req, res) => {
  const chatId = parseInt(req.params.chatId);
  const isMember = await chatsRepo.isMember(chatId, req.user.id);
  if (!isMember) return res.status(403).json({ ok: false, error: "Нет доступа" });
  const pinned = await chatsRepo.getPinnedMessage(chatId);
  res.json({ ok: true, pinnedMessage: pinned });
});

router.get("/:chatId/messages", authRequired, async (req, res) => {
  const chatId = parseInt(req.params.chatId);
  const isMember = await chatsRepo.isMember(chatId, req.user.id);
  if (!isMember) return res.status(403).json({ ok: false, error: "Нет доступа" });

  const beforeId = req.query.beforeId ? parseInt(req.query.beforeId) : null;
  const limit = Math.min(parseInt(req.query.limit) || 30, 100);
  const messages = await messagesRepo.getHistory(chatId, { beforeId, limit });
  res.json({
    ok: true,
    messages,
    hasMore: messages.length === limit
  });
});

router.get("/:chatId/media", authRequired, async (req, res) => {
  const chatId = parseInt(req.params.chatId);
  const isMember = await chatsRepo.isMember(chatId, req.user.id);
  if (!isMember) return res.status(403).json({ ok: false, error: "Нет доступа" });

  const type = req.query.type || null;
  const limit = Math.min(parseInt(req.query.limit) || 60, 200);
  const beforeId = req.query.beforeId ? parseInt(req.query.beforeId) : null;
  const media = await messagesRepo.getMedia(chatId, { type, limit, beforeId });
  res.json({ ok: true, media });
});

router.get("/:chatId/search", authRequired, async (req, res) => {
  const chatId = parseInt(req.params.chatId);
  const q = String(req.query.q || "").trim();
  if (!q) return res.json({ ok: true, messages: [] });
  const isMember = await chatsRepo.isMember(chatId, req.user.id);
  if (!isMember) return res.status(403).json({ ok: false, error: "Нет доступа" });
  const messages = await messagesRepo.search(chatId, q, { limit: 50 });
  res.json({ ok: true, messages });
});

router.post("/:chatId/read", authRequired, async (req, res) => {
  const chatId = parseInt(req.params.chatId);
  const isMember = await chatsRepo.isMember(chatId, req.user.id);
  if (!isMember) return res.status(403).json({ ok: false, error: "Нет доступа" });
  await chatsRepo.resetUnread(req.user.username, chatId);
  cache.delPattern(`chats:${req.user.username}:*`);
  res.json({ ok: true });
});

router.post("/:chatId/pin", authRequired, async (req, res) => {
  const chatId = parseInt(req.params.chatId);
  const pinned = !!(req.body && req.body.pinned);
  await chatsRepo.setPinned(req.user.username, chatId, pinned);
  cache.delPattern(`chats:${req.user.username}:*`);
  res.json({ ok: true });
});

router.post("/:chatId/archive", authRequired, async (req, res) => {
  const chatId = parseInt(req.params.chatId);
  const archived = !!(req.body && req.body.archived);
  await chatsRepo.setArchived(req.user.username, chatId, archived);
  cache.delPattern(`chats:${req.user.username}:*`);
  res.json({ ok: true });
});

router.post("/:chatId/mute", authRequired, async (req, res) => {
  const chatId = parseInt(req.params.chatId);
  const muted = !!(req.body && req.body.muted);
  await chatsRepo.setMuted(req.user.username, chatId, muted);
  cache.delPattern(`chats:${req.user.username}:*`);
  res.json({ ok: true });
});

router.post("/:chatId/pin-message", authRequired, async (req, res) => {
  const chatId = parseInt(req.params.chatId);
  const messageId = parseInt(req.body?.messageId);
  if (!chatId || !messageId) return res.status(400).json({ ok: false, error: "Неверные параметры" });
  const isMember = await chatsRepo.isMember(chatId, req.user.id);
  if (!isMember) return res.status(403).json({ ok: false, error: "Нет доступа" });
  await chatsRepo.setPinnedMessage(chatId, messageId);
  const msg = await messagesRepo.getById(messageId);
  res.json({ ok: true, message: msg });
});

router.delete("/:chatId/pin-message", authRequired, async (req, res) => {
  const chatId = parseInt(req.params.chatId);
  const isMember = await chatsRepo.isMember(chatId, req.user.id);
  if (!isMember) return res.status(403).json({ ok: false, error: "Нет доступа" });
  await chatsRepo.setPinnedMessage(chatId, null);
  res.json({ ok: true });
});

module.exports = router;
