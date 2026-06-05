// Socket.io handlers: connection, message, typing, read, calls
const usersRepo = require("../db/repos/users");
const chatsRepo = require("../db/repos/chats");
const messagesRepo = require("../db/repos/messages");
const notifRepo = require("../db/repos/notifications");
const storiesRepo = require("../db/repos/stories");
const { sendToUser, broadcastToChat } = require("./helpers");
const logger = require("../utils/logger");

function getIO(app) { return app.get("io"); }
function getOnline(app) { return app.get("onlineUsers"); }

async function onConnect(io, socket, online) {
  logger.info(`[WS] ${socket.username} connected (${socket.id})`);
  online.set(socket.username, { id: socket.id, lastSeen: Date.now() });

  // Присоединяемся к своим чатам
  const chats = await chatsRepo.getUserChats(socket.username, { tab: "all", limit: 200 });
  for (const c of chats) {
    socket.join(`chat:${c.chatId}`);
  }

  // Онлайн-статус
  await usersRepo.setOnline(socket.username);
  io.emit("user:online", { username: socket.username });

  // Отправляем начальный стейт
  await emitInitialState(io, socket, online);

  // Регистрируем обработчики
  registerHandlers(io, socket, online);
}

async function emitInitialState(io, socket, online) {
  try {
    const [me, chats, onlineUsers, notifications, stories, totalUnread] = await Promise.all([
      usersRepo.findById(socket.userId),
      chatsRepo.getUserChats(socket.username, { tab: "all", limit: 200 }),
      usersRepo.getOnlineUsernames(),
      notifRepo.getForUser(socket.username, { limit: 50 }),
      storiesRepo.getFeed(socket.userId),
      chatsRepo.getTotalUnread(socket.username)
    ]);
    socket.emit("init", {
      me: usersRepo.rowToUser(me),
      chats,
      onlineUsers: onlineUsers.map(u => ({ username: u.username, lastSeen: u.last_seen })),
      notifications,
      stories,
      totalUnread
    });
  } catch (err) {
    logger.error("init failed for " + socket.username + ": " + err.message);
    socket.emit("error_event", { error: "init_failed" });
  }
}

function registerHandlers(io, socket, online) {

  // === Сообщения ===
  socket.on("send_message", async (data, ack) => {
    try {
      const { chatId, text, type = "text", attachments = [], replyToId = null, replySnapshot = null,
              mentions = [], pollData = null, locationData = null, contactData = null,
              forwardedFromId = null, forwardedFromChatId = null, forwardedFromName = null } = data || {};
      if (!chatId) {
        return ack && ack({ ok: false, error: "chatId обязателен" });
      }
      const chatIdNum = parseInt(chatId);
      const isMember = await chatsRepo.isMember(chatIdNum, socket.userId);
      if (!isMember) {
        return ack && ack({ ok: false, error: "Нет доступа к чату" });
      }
      // Преобразуем mentions из username в id
      const mentionIds = [];
      for (const m of mentions || []) {
        if (typeof m === "string") {
          const u = await usersRepo.findByUsername(m);
          if (u) mentionIds.push(u.id);
        } else if (typeof m === "number") {
          mentionIds.push(m);
        }
      }
      const replyIdNum = replyToId ? parseInt(replyToId) : null;
      const message = await messagesRepo.create({
        chatId: chatIdNum, fromId: socket.userId, text, type,
        attachments, replyToId: replyIdNum, replySnapshot,
        mentions: mentionIds, pollData, locationData, contactData,
        forwardedFromId, forwardedFromChatId, forwardedFromName
      });
      // Инвалидируем кеш списка чатов для всех участников
      try {
        const cache = require("../utils/cache");
        const memberUsernames = await chatsRepo.getMemberUsernames(chatIdNum);
        for (const uname of memberUsernames) await cache.delPattern(`chats:${uname}:*`);
      } catch {}
      // Broadcast
      io.to(`chat:${chatIdNum}`).emit("new_message", message);
      // Уведомления для участников (кроме автора и онлайн-юзеров в чате)
      const memberIds = await chatsRepo.getMemberIds(chatIdNum);
      for (const uid of memberIds) {
        if (uid === socket.userId) continue;
        const u = await usersRepo.findById(uid);
        if (!u) continue;
        // Не уведомляем если юзер сейчас в этом чате
        const sid = online.get(u.username)?.id;
        if (sid) {
          const inRoom = io.sockets.sockets.get(sid)?.rooms.has(`chat:${chatIdNum}`);
          if (inRoom) continue;
        }
        await notifRepo.create({
          userId: uid, type: mentionIds.includes(uid) ? "mention" : "message",
          chatId: chatIdNum, fromId: socket.userId,
          payload: { text: message.text, type: message.type, messageId: message.id }
        });
      }
      ack && ack({ ok: true, messageId: message.id, createdAt: message.createdAt });
    } catch (err) {
      logger.error("send_message: " + err.message);
      ack && ack({ ok: false, error: err.message });
    }
  });

  // === Редактирование ===
  socket.on("edit_message", async (data, ack) => {
    try {
      const { messageId, text } = data || {};
      if (!messageId || !text) return ack && ack({ ok: false, error: "Не указан text/messageId" });
      const id = parseInt(messageId);
      const msg = await messagesRepo.edit(id, socket.userId, text);
      if (!msg) return ack && ack({ ok: false, error: "Не найдено или нет прав" });
      io.to(`chat:${msg.chatId}`).emit("message_edited", msg);
      ack && ack({ ok: true, message: msg });
    } catch (err) {
      ack && ack({ ok: false, error: err.message });
    }
  });

  // === Удаление ===
  socket.on("delete_message", async (data, ack) => {
    try {
      const { messageId } = data || {};
      if (!messageId) return ack && ack({ ok: false });
      const id = parseInt(messageId);
      const before = await messagesRepo.findById(id);
      if (!before) return ack && ack({ ok: false, error: "Не найдено" });
      await messagesRepo.softDelete(id, socket.userId);
      io.to(`chat:${before.chatId}`).emit("message_deleted", { messageId: id, chatId: before.chatId });
      ack && ack({ ok: true });
    } catch (err) {
      ack && ack({ ok: false, error: err.message });
    }
  });

  // === Реакции ===
  socket.on("add_reaction", async (data, ack) => {
    try {
      const { messageId, emoji } = data || {};
      if (!messageId || !emoji) return ack && ack({ ok: false });
      const id = parseInt(messageId);
      const msg = await messagesRepo.findById(id);
      if (!msg) return ack && ack({ ok: false });
      const isMember = await chatsRepo.isMember(msg.chatId, socket.userId);
      if (!isMember) return ack && ack({ ok: false, error: "Нет доступа" });
      await messagesRepo.addReaction(id, socket.userId, emoji);
      const reactions = await messagesRepo.getReactions([id]);
      const payload = { messageId: id, chatId: msg.chatId, reactions: reactions.get(id) || {} };
      io.to(`chat:${msg.chatId}`).emit("reaction_added", payload);
      ack && ack({ ok: true });
    } catch (err) {
      ack && ack({ ok: false, error: err.message });
    }
  });

  socket.on("remove_reaction", async (data, ack) => {
    try {
      const { messageId, emoji } = data || {};
      if (!messageId || !emoji) return ack && ack({ ok: false });
      const id = parseInt(messageId);
      const msg = await messagesRepo.findById(id);
      if (!msg) return ack && ack({ ok: false });
      await messagesRepo.removeReaction(id, socket.userId, emoji);
      const reactions = await messagesRepo.getReactions([id]);
      io.to(`chat:${msg.chatId}`).emit("reaction_removed", {
        messageId: id, chatId: msg.chatId, reactions: reactions.get(id) || {}
      });
      ack && ack({ ok: true });
    } catch (err) {
      ack && ack({ ok: false, error: err.message });
    }
  });

  // === Чтение ===
  socket.on("mark_as_read", async (data, ack) => {
    try {
      const { chatId } = data || {};
      if (!chatId) return ack && ack({ ok: false });
      const id = parseInt(chatId);
      await chatsRepo.resetUnread(socket.username, id);
      const lastMsg = await messagesRepo.getLastMessage(id);
      if (lastMsg && lastMsg.fromUsername !== socket.username) {
        sendToUser(io, online, lastMsg.fromUsername, "message_read", {
          chatId: id, byUsername: socket.username, messageId: lastMsg.id
        });
      }
      ack && ack({ ok: true });
    } catch (err) {
      ack && ack({ ok: false, error: err.message });
    }
  });

  // === Набор текста ===
  socket.on("typing", (data) => {
    const { chatId } = data || {};
    if (!chatId) return;
    socket.to(`chat:${chatId}`).emit("typing", {
      chatId, username: socket.username
    });
  });
  socket.on("stop_typing", (data) => {
    const { chatId } = data || {};
    if (!chatId) return;
    socket.to(`chat:${chatId}`).emit("stop_typing", {
      chatId, username: socket.username
    });
  });

  // === Загрузка истории (sync) ===
  socket.on("get_history", async (data, ack) => {
    try {
      const { chatId, beforeId = null, limit = 30 } = data || {};
      if (!chatId) return ack && ack({ ok: false, error: "chatId обязателен" });
      const id = parseInt(chatId);
      const isMember = await chatsRepo.isMember(id, socket.userId);
      if (!isMember) return ack && ack({ ok: false, error: "Нет доступа" });
      const messages = await messagesRepo.getHistory(id, { beforeId: beforeId ? parseInt(beforeId) : null, limit: Math.min(limit, 100) });
      ack && ack({ ok: true, messages, hasMore: messages.length === limit });
    } catch (err) {
      ack && ack({ ok: false, error: err.message });
    }
  });

  // === Звонки (WebRTC) ===
  socket.on("call_user", async (data, ack) => {
    const { to, type, offer } = data || {};
    if (!to || !offer) return ack && ack({ ok: false });
    const ok = sendToUser(io, online, to, "incoming_call", {
      from: socket.username, type: type || "voice", offer
    });
    ack && ack({ ok });
  });

  socket.on("call_answer", (data) => {
    const { to, answer } = data || {};
    if (!to || !answer) return;
    sendToUser(io, online, to, "call_signal", { from: socket.username, answer });
  });

  socket.on("call_ice_candidate", (data) => {
    const { to, candidate } = data || {};
    if (!to || !candidate) return;
    sendToUser(io, online, to, "call_ice_candidate", { from: socket.username, candidate });
  });

  socket.on("call_end", (data) => {
    const { to } = data || {};
    if (!to) return;
    sendToUser(io, online, to, "call_end", { from: socket.username });
  });

  socket.on("call_reject", (data) => {
    const { to } = data || {};
    if (!to) return;
    sendToUser(io, online, to, "call_end", { from: socket.username, reason: "rejected" });
  });

  // === Disconnect ===
  socket.on("disconnect", async () => {
    logger.info(`[WS] ${socket.username} disconnected`);
    online.delete(socket.username);
    await usersRepo.setOffline(socket.username);
    io.emit("user:offline", { username: socket.username, lastSeen: new Date().toISOString() });
  });
}

module.exports = { setupSocketHandlers: onConnect };
