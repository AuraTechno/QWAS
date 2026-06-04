const mongoose = require("mongoose");
const cache = require("../db/cache");
const chatService = require("../db/chatService");

const MESSAGES_PER_PAGE = parseInt(process.env.MESSAGES_PER_PAGE) || 30;

function getModels() {
  try {
    return {
      User: require("../models/User"),
      Message: require("../models/Message"),
      Group: require("../models/Group"),
      Notification: require("../models/Notification"),
      Story: require("../models/Story")
    };
  } catch {
    return { User: null, Message: null, Group: null, Notification: null, Story: null };
  }
}

function isGroupChat(to) {
  return typeof to === "string" && to.startsWith("group:");
}

function getGroupId(to) {
  return to.replace("group:", "");
}

async function joinUserGroups(socket) {
  try {
    const { Group } = getModels();
    if (!Group) return;
    const groups = await Group.find({ "members.username": socket.username })
      .select("_id")
      .lean();
    for (const g of groups) {
      socket.join(`group:${g._id}`);
    }
  } catch (err) {
    console.error("Join groups error:", err);
  }
}

function setupSocketHandlers(io, socket, online) {
  joinUserGroups(socket);

  const { User, Group, Notification, Story } = getModels();
  if (User) {
    User.updateOne(
      { username: socket.username },
      { $set: { presence: "online", lastSeen: new Date() } }
    ).catch(() => {});

    Promise.all([
      chatService.getFastChatList(socket.username).then(list => socket.emit("chat_list", list)).catch(() => {}),
      User.find({ username: { $ne: socket.username } })
        .select("username firstName lastName bio avatar avatarColor presence lastSeen")
        .limit(500)
        .lean()
        .then(users => socket.emit("all_users", users))
        .catch(() => {}),
      Notification
        ? Notification.find({ user: socket.username, read: false })
            .sort({ createdAt: -1 }).limit(50).lean()
            .then(notifs => socket.emit("notifications", notifs))
            .catch(() => {})
        : null,
      Story && Group
        ? User.findOne({ username: socket.username }).select("contacts").lean().then(u => {
            if (!u) return;
            const authors = [...(u.contacts || []), socket.username];
            return Story.find({ author: { $in: authors } })
              .sort({ createdAt: -1 })
              .limit(100)
              .lean()
              .then(stories => socket.emit("stories_feed", stories));
          }).catch(() => {})
        : null
    ]).catch(() => {});
  }

  socket.on("send_message", async (data, ack) => {
    try {
      const { Message, Group, User, Notification } = getModels();
      if (!Message) { if (typeof ack === "function") ack({ ok: false }); return; }

      const to = data.to;
      const from = socket.username;

      if (to === "favorites") {
        const convId = `favorites:${from}`;
        const msg = await Message.create({
          from, to, conversationId: convId, type: "favorites",
          message: data.message || "", attachments: data.attachments || [],
          replyTo: data.replyTo || null, status: "sent"
        });
        const full = msg.toObject();
        socket.emit("new_message", full);
        await chatService.touchChat(from, "favorites", "favorites", full, true);
        if (typeof ack === "function") ack({ ok: true, messageId: full._id, createdAt: full.createdAt });
        return;
      }

      if (isGroupChat(to)) {
        if (Group) {
          const group = await Group.findById(getGroupId(to)).select("_id members").lean();
          if (!group || !group.members.some(m => m.username === from)) {
            if (typeof ack === "function") ack({ ok: false, error: "not_member" });
            return;
          }
        }
        const convId = `g:${getGroupId(to)}`;
        const msg = await Message.create({
          from, to, conversationId: convId, type: "group",
          message: data.message || "", attachments: data.attachments || [],
          replyTo: data.replyTo || null, isForwarded: data.isForwarded || false,
          forwardedFrom: data.forwardedFrom || null, forwardChain: data.forwardChain || [],
          mentions: data.mentions || [], status: "sent"
        });
        const full = msg.toObject();
        io.to(to).emit("new_message", full);
        socket.emit("new_message", full);
        if (Group && Notification) {
          const g = await Group.findById(getGroupId(to)).select("members").lean();
          if (g) {
            const tasks = [];
            for (const m of g.members) {
              if (m.username === from) continue;
              if (full.mentions?.length && !full.mentions.includes(m.username)) continue;
              tasks.push(Notification.create({
                user: m.username, type: "message", from,
                chatId: to, messageId: full._id, preview: full.message?.slice(0, 100) || "📎"
              }));
              tasks.push(chatService.touchChat(m.username, getGroupId(to), "group", full, false));
            }
            await Promise.all(tasks);
          }
        }
        if (typeof ack === "function") ack({ ok: true, messageId: full._id, createdAt: full.createdAt });
        return;
      }

      if (User && to !== "favorites") {
        const target = await User.findOne({ username: to }).select("blocked").lean();
        if (target?.blocked?.includes(from)) {
          if (typeof ack === "function") ack({ ok: false, error: "blocked" });
          return;
        }
      }
      const convId = chatService.convIdDM(from, to);
      const msg = await Message.create({
        from, to, conversationId: convId, type: "dm",
        message: data.message || "", attachments: data.attachments || [],
        replyTo: data.replyTo || null, isForwarded: data.isForwarded || false,
        forwardedFrom: data.forwardedFrom || null, forwardChain: data.forwardChain || [],
        mentions: data.mentions || [], status: "sent"
      });
      const full = msg.toObject();
      sendToUser(io, online, to, "new_message", full);
      socket.emit("new_message", full);
      await Promise.all([
        chatService.touchChat(to, from, "dm", full, false),
        chatService.touchChat(from, to, "dm", full, true),
        Notification
          ? Notification.create({
              user: to, type: "message", from,
              chatId: from, messageId: full._id, preview: full.message?.slice(0, 100) || "📎"
            })
          : null
      ]);
      if (typeof ack === "function") ack({ ok: true, messageId: full._id, createdAt: full.createdAt });
    } catch (err) {
      console.error("Ошибка отправки:", err);
      if (typeof ack === "function") ack({ ok: false, error: "server_error" });
    }
  });

  socket.on("edit_message", async (data) => {
    try {
      const { Message } = getModels();
      if (!Message) return;
      const msg = await Message.findById(data.messageId).select("_id from to message edited editHistory");
      if (!msg || msg.from !== socket.username) return;

      msg.editHistory.push({ message: msg.message, editedAt: new Date() });
      msg.message = data.newText;
      msg.edited = true;
      await msg.save();
      const updated = msg.toObject();
      broadcastMessageUpdate(io, online, msg.to, socket.username, "message_updated", updated);
      cache.delByPrefix(`history:${socket.username}:`);
    } catch (err) {}
  });

  socket.on("delete_message", async (data) => {
    try {
      const { Message } = getModels();
      if (!Message) return;
      const msg = await Message.findById(data.messageId).select("_id from to");
      if (!msg || msg.from !== socket.username) return;
      await Message.deleteOne({ _id: data.messageId });
      broadcastMessageUpdate(io, online, msg.to, socket.username, "message_deleted", { messageId: data.messageId });
      cache.delByPrefix(`history:${socket.username}:`);
    } catch (err) {}
  });

  socket.on("delete_messages_bulk", async (data) => {
    try {
      const { Message } = getModels();
      if (!Message || !data?.ids?.length) return;
      const messages = await Message.find({ _id: { $in: data.ids }, from: socket.username })
        .select("_id to")
        .lean();
      if (messages.length === 0) return;
      await Message.deleteMany({ _id: { $in: messages.map(m => m._id) } });
      const deleted = messages.map(m => m._id);
      for (const msg of messages) {
        broadcastMessageUpdate(io, online, msg.to, socket.username, "message_deleted", { messageId: msg._id });
      }
      cache.delByPrefix(`history:${socket.username}:`);
    } catch (err) {}
  });

  socket.on("react_message", async (data) => {
    try {
      const { Message } = getModels();
      if (!Message) return;
      const msg = await Message.findById(data.messageId).select("_id to reactions");
      if (!msg) return;
      const existing = msg.reactions.find(r => r.emoji === data.emoji);
      if (existing) {
        if (existing.users.includes(socket.username)) {
          existing.users = existing.users.filter(u => u !== socket.username);
          if (existing.users.length === 0) {
            msg.reactions = msg.reactions.filter(r => r.emoji !== data.emoji);
          }
        } else {
          existing.users.push(socket.username);
        }
      } else {
        msg.reactions.push({ emoji: data.emoji, users: [socket.username] });
      }
      await msg.save();
      broadcastMessageUpdate(io, online, msg.to, socket.username, "message_reaction", {
        messageId: msg._id, reactions: msg.reactions
      });
    } catch (err) {}
  });

  socket.on("pin_message", async (data) => {
    try {
      const { Message } = getModels();
      if (!Message) return;
      const msg = await Message.findById(data.messageId).select("_id to");
      if (!msg) return;
      msg.isPinned = !!data.pin;
      msg.pinnedBy = data.pin ? socket.username : null;
      msg.pinnedAt = data.pin ? new Date() : null;
      await msg.save();
      broadcastMessageUpdate(io, online, msg.to, socket.username, "message_pinned", {
        messageId: msg._id, isPinned: msg.isPinned, pinnedBy: msg.pinnedBy
      });
    } catch (err) {}
  });

  socket.on("mark_as_read", async (data) => {
    try {
      const { Message, Group } = getModels();
      if (!Message) return;

      let result;
      if (isGroupChat(data.chatId)) {
        result = await Message.updateMany(
          { to: data.chatId, status: { $ne: "read" }, from: { $ne: socket.username } },
          { $set: { status: "read" } }
        );
        if (result.modifiedCount > 0 && Group) {
          const g = await Group.findById(getGroupId(data.chatId)).select("members").lean();
          if (g) {
            for (const m of g.members) {
              if (m.username !== socket.username) {
                sendToUser(io, online, m.username, "messages_read", {
                  by: socket.username, chatId: data.chatId
                });
              }
            }
          }
        }
      } else {
        result = await Message.updateMany(
          { from: data.from, to: socket.username, status: { $ne: "read" } },
          { $set: { status: "read" } }
        );
        if (result.modifiedCount > 0) {
          sendToUser(io, online, data.from, "messages_read", {
            by: socket.username, chatWith: data.from
          });
          await chatService.markRead(socket.username, data.from);
        }
      }
      socket.emit("chat_list", await chatService.getFastChatList(socket.username));
    } catch (err) {
      console.error("Ошибка отметки прочитано:", err);
    }
  });

  socket.on("read_message", async (data) => {
    try {
      const { Message } = getModels();
      if (!Message) return;
      const msg = await Message.findById(data.messageId).select("_id to from status");
      if (!msg) return;
      if (isGroupChat(msg.to)) {
        if (msg.from === socket.username) return;
      } else {
        if (msg.to !== socket.username) return;
      }
      if (msg.status !== "read") {
        msg.status = "read";
        await msg.save();
      }
      if (!isGroupChat(msg.to)) {
        sendToUser(io, online, msg.from, "message_status", { messageId: msg._id, status: "read" });
      }
    } catch (err) {}
  });

  socket.on("get_history", async (user, pageOrBefore, ack) => {
    try {
      const { Message } = getModels();
      if (!Message) {
        if (typeof ack === "function") ack({ ok: false, messages: [], hasMore: false });
        return;
      }
      if (socket.paginationState) {
        socket.paginationState.currentChat = user;
        socket.paginationState.isLoading = false;
      }

      const before = parseCursor(pageOrBefore);
      const result = await chatService.getHistoryFast(socket.username, user, before, MESSAGES_PER_PAGE);

      if (socket.paginationState) {
        socket.paginationState.hasMore = result.hasMore;
        socket.paginationState.cursor = result.messages.length ? result.messages[0].createdAt : null;
      }
      if (typeof ack === "function") ack({ ok: true, messages: result.messages, hasMore: result.hasMore });
    } catch (err) {
      console.error("Ошибка получения истории:", err);
      if (typeof ack === "function") ack({ ok: false, messages: [], hasMore: false });
    }
  });

  socket.on("load_more", async (ack) => {
    try {
      const state = socket.paginationState;
      if (!state || !state.currentChat || !state.hasMore || state.isLoading) {
        if (typeof ack === "function") ack({ ok: false, messages: [], hasMore: false });
        return;
      }
      state.isLoading = true;
      const result = await chatService.getHistoryFast(socket.username, state.currentChat, state.cursor, MESSAGES_PER_PAGE);
      state.hasMore = result.hasMore;
      state.cursor = result.messages.length ? result.messages[0].createdAt : state.cursor;
      state.isLoading = false;
      if (typeof ack === "function") ack({ ok: true, messages: result.messages, hasMore: result.hasMore });
    } catch (err) {
      if (socket.paginationState) socket.paginationState.isLoading = false;
      if (typeof ack === "function") ack({ ok: false, messages: [] });
    }
  });

  socket.on("reset_pagination", () => {
    if (socket.paginationState) {
      socket.paginationState.currentChat = null;
      socket.paginationState.page = 1;
      socket.paginationState.hasMore = true;
      socket.paginationState.isLoading = false;
      socket.paginationState.cursor = null;
    }
  });

  socket.on("typing", (to) => {
    if (to === "favorites") return;
    if (isGroupChat(to)) {
      socket.to(to).emit("typing", { from: socket.username, chatId: to });
    } else {
      sendToUser(io, online, to, "typing", { from: socket.username, chatId: to });
    }
  });

  socket.on("stop_typing", (to) => {
    if (to === "favorites") return;
    if (isGroupChat(to)) {
      socket.to(to).emit("stop_typing", { from: socket.username, chatId: to });
    } else {
      sendToUser(io, online, to, "stop_typing", { from: socket.username, chatId: to });
    }
  });

  socket.on("set_presence", async (data) => {
    try {
      const { User } = getModels();
      if (!User) return;
      if (!["online", "offline", "away"].includes(data?.presence)) return;
      await User.updateOne(
        { username: socket.username },
        { $set: { presence: data.presence, lastSeen: new Date() } }
      );
      const myId = online.get(socket.username);
      const sockets = await io.fetchSockets();
      await Promise.all(sockets.map(s => {
        if (s.id === myId) return null;
        const list = s.username ? null : null;
        return list;
      }));
      for (const s of sockets) {
        if (s.username) {
          s.emit("chat_list", await chatService.getFastChatList(s.username));
        }
      }
    } catch (err) {}
  });

  socket.on("profile_updated", async () => {
    const sockets = await io.fetchSockets();
    for (const s of sockets) {
      if (s.username) s.emit("chat_list", await chatService.getFastChatList(s.username));
    }
  });

  socket.on("view_story", async (storyId) => {
    try {
      const { Story } = getModels();
      if (!Story) return;
      const s = await Story.findById(storyId).select("views");
      if (s && !s.views.includes(socket.username)) {
        s.views.push(socket.username);
        await s.save();
      }
    } catch {}
  });

  socket.on("call_user", (data) => {
    sendToUser(io, online, data.to, "incoming_call", {
      from: socket.username, type: data.type, callId: data.callId
    });
  });

  socket.on("call_signal", (data) => {
    sendToUser(io, online, data.to, "call_signal", {
      from: socket.username, signal: data.signal, callId: data.callId
    });
  });

  socket.on("call_ice_candidate", (data) => {
    sendToUser(io, online, data.to, "call_ice_candidate", {
      from: socket.username, candidate: data.candidate, callId: data.callId
    });
  });

  socket.on("call_end", (data) => {
    sendToUser(io, online, data.to, "call_end", {
      from: socket.username, callId: data.callId, reason: data.reason || "ended"
    });
  });

  socket.on("disconnect", async () => {
    online.delete(socket.username);
    try {
      const { User } = getModels();
      if (User) {
        await User.updateOne(
          { username: socket.username },
          { $set: { presence: "offline", lastSeen: new Date() } }
        );
      }
    } catch {}
    if (mongoose.connection.readyState === 1) {
      const sockets = await io.fetchSockets();
      for (const s of sockets) {
        if (s.username) s.emit("chat_list", await chatService.getFastChatList(s.username));
      }
    }
  });
}

function parseCursor(c) {
  if (!c) return null;
  if (c instanceof Date) return c;
  if (typeof c === "string") {
    const d = new Date(c);
    if (!isNaN(d.getTime())) return d;
  }
  if (typeof c === "number" && c > 1) {
    const skip = (c - 1) * MESSAGES_PER_PAGE;
    return new Date(Date.now() - skip * 60000);
  }
  return null;
}

function broadcastMessageUpdate(io, online, to, from, event, data) {
  if (to === "favorites") {
    sendToUser(io, online, from, event, data);
  } else if (isGroupChat(to)) {
    io.to(to).emit(event, data);
  } else {
    sendToUser(io, online, to, event, data);
    sendToUser(io, online, from, event, data);
  }
}

function sendToUser(io, online, username, event, data) {
  const id = online.get(username);
  if (id) io.to(id).emit(event, data);
}

module.exports = {
  setupSocketHandlers
};
