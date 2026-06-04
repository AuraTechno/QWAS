const mongoose = require("mongoose");

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

const MESSAGES_PER_PAGE = parseInt(process.env.MESSAGES_PER_PAGE) || 30;

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
    const groups = await Group.find({ "members.username": socket.username }).lean();
    for (const g of groups) {
      socket.join(`group:${g._id}`);
    }
  } catch (err) {
    console.error("Join groups error:", err);
  }
}

function setupSocketHandlers(io, socket, online) {
  joinUserGroups(socket);

  try {
    const { User, Group, Notification } = getModels();
    if (User) {
      User.updateOne({ username: socket.username }, { $set: { presence: "online", lastSeen: new Date() } }).catch(() => {});
      emitChatList(io, online);
      emitGroupChatList(io, online);
      User.find({ username: { $ne: socket.username } })
        .select("username firstName lastName bio avatar avatarColor presence lastSeen").lean()
        .then(users => socket.emit("all_users", users))
        .catch(() => {});

      if (Notification) {
        Notification.find({ user: socket.username, read: false })
          .sort({ createdAt: -1 }).limit(50).lean()
          .then(notifs => socket.emit("notifications", notifs))
          .catch(() => {});
      }
    }
    if (Group) {
      const { Story } = getModels();
      const me = socket.username;
      User.findOne({ username: me }).select("contacts").lean().then(u => {
        if (!u) return;
        const authors = [...(u.contacts || []), me];
        if (Story) {
          Story.find({ author: { $in: authors } }).sort({ createdAt: -1 }).lean()
            .then(stories => socket.emit("stories_feed", stories))
            .catch(() => {});
        }
      }).catch(() => {});
    }
  } catch {}

  socket.on("send_message", async (data, ack) => {
    try {
      const { Message, Group, User } = getModels();
      if (!Message) { if (typeof ack === "function") ack({ ok: false }); return; }

      const to = data.to;
      if (isGroupChat(to)) {
        if (Group) {
          const group = await Group.findById(getGroupId(to)).lean();
          if (!group || !group.members.some(m => m.username === socket.username)) {
            if (typeof ack === "function") ack({ ok: false, error: "not_member" });
            return;
          }
        }
      } else if (to !== "favorites" && User) {
        const target = await User.findOne({ username: to }).select("blocked").lean();
        if (target?.blocked?.includes(socket.username)) {
          if (typeof ack === "function") ack({ ok: false, error: "blocked" });
          return;
        }
      }

      const baseMsg = {
        from: socket.username,
        to,
        message: data.message || "",
        attachments: data.attachments || [],
        replyTo: data.replyTo || null,
        isForwarded: data.isForwarded || false,
        forwardedFrom: data.forwardedFrom || null,
        forwardChain: data.forwardChain || [],
        status: "sent"
      };

      if (data.mentions) baseMsg.mentions = data.mentions;

      const msg = await Message.create(baseMsg);
      const full = msg.toObject();

      if (to === "favorites") {
        socket.emit("new_message", full);
      } else if (isGroupChat(to)) {
        io.to(to).emit("new_message", full);
        socket.emit("new_message", full);
        const { Group } = getModels();
        const g = await Group.findById(getGroupId(to)).lean();
        if (g) {
          const { Notification } = getModels();
          for (const m of g.members) {
            if (m.username === socket.username) continue;
            if (full.mentions && full.mentions.length && !full.mentions.includes(m.username)) continue;
            if (Notification) {
              await Notification.create({
                user: m.username, type: "message", from: socket.username,
                chatId: to, messageId: full._id, preview: full.message?.slice(0, 100) || "📎"
              });
            }
          }
        }
      } else {
        sendToUser(io, online, to, "new_message", full);
        socket.emit("new_message", full);
        const { Notification } = getModels();
        if (Notification) {
          await Notification.create({
            user: to, type: "message", from: socket.username,
            chatId: socket.username, messageId: full._id, preview: full.message?.slice(0, 100) || "📎"
          });
        }
      }

      if (typeof ack === "function") ack({ ok: true, messageId: full._id, createdAt: full.createdAt });
      emitChatListForUser(io, online, socket.username);
      if (to !== "favorites") {
        if (isGroupChat(to)) {
          const { Group } = getModels();
          const g = await Group.findById(getGroupId(to)).lean();
          if (g) {
            for (const m of g.members) {
              if (m.username !== socket.username) emitChatListForUser(io, online, m.username);
            }
          }
        } else {
          emitChatListForUser(io, online, to);
        }
      }
    } catch (err) {
      console.error("Ошибка отправки:", err);
      if (typeof ack === "function") ack({ ok: false, error: "server_error" });
    }
  });

  socket.on("edit_message", async (data) => {
    try {
      const { Message } = getModels();
      if (!Message) return;
      const msg = await Message.findById(data.messageId);
      if (!msg || msg.from !== socket.username) return;

      msg.editHistory.push({ message: msg.message, editedAt: new Date() });
      msg.message = data.newText;
      msg.edited = true;
      await msg.save();
      const updated = msg.toObject();

      broadcastMessageUpdate(io, online, msg.to, socket.username, "message_updated", updated);
    } catch (err) {}
  });

  socket.on("delete_message", async (data) => {
    try {
      const { Message } = getModels();
      if (!Message) return;
      const msg = await Message.findById(data.messageId);
      if (!msg || msg.from !== socket.username) return;
      await Message.deleteOne({ _id: data.messageId });
      broadcastMessageUpdate(io, online, msg.to, socket.username, "message_deleted", { messageId: data.messageId });
    } catch (err) {}
  });

  socket.on("delete_messages_bulk", async (data) => {
    try {
      const { Message } = getModels();
      if (!Message || !data?.ids) return;
      const messages = await Message.find({ _id: { $in: data.ids }, from: socket.username });
      for (const msg of messages) {
        await Message.deleteOne({ _id: msg._id });
        broadcastMessageUpdate(io, online, msg.to, socket.username, "message_deleted", { messageId: msg._id });
      }
    } catch (err) {}
  });

  socket.on("react_message", async (data) => {
    try {
      const { Message } = getModels();
      if (!Message) return;
      const msg = await Message.findById(data.messageId);
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
      const msg = await Message.findById(data.messageId);
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

      let query;
      if (isGroupChat(data.chatId)) {
        query = { to: data.chatId, status: { $ne: "read" }, from: { $ne: socket.username } };
      } else {
        query = { from: data.from, to: socket.username, status: { $ne: "read" } };
      }

      const result = await Message.updateMany(query, { $set: { status: "read" } });

      if (result.modifiedCount > 0) {
        if (isGroupChat(data.chatId)) {
          const g = await Group.findById(getGroupId(data.chatId)).lean();
          if (g) {
            for (const m of g.members) {
              if (m.username !== socket.username) {
                sendToUser(io, online, m.username, "messages_read", {
                  by: socket.username, chatId: data.chatId
                });
              }
            }
          }
        } else {
          sendToUser(io, online, data.from, "messages_read", {
            by: socket.username, chatWith: data.from
          });
        }
        emitChatListForUser(io, online, socket.username);
      }
    } catch (err) {
      console.error("Ошибка отметки прочитано:", err);
    }
  });

  socket.on("read_message", async (data) => {
    try {
      const { Message } = getModels();
      if (!Message) return;
      const msg = await Message.findById(data.messageId);
      if (!msg) return;
      if (isGroupChat(msg.to)) {
        if (msg.from === socket.username) return;
        const { Group } = getModels();
        const g = await Group.findById(getGroupId(msg.to)).lean();
        if (!g || !g.members.some(m => m.username === socket.username)) return;
      } else {
        if (msg.to !== socket.username) return;
      }
      msg.status = "read";
      await msg.save();
      if (!isGroupChat(msg.to)) {
        sendToUser(io, online, msg.from, "message_status", { messageId: msg._id, status: "read" });
      }
    } catch (err) {}
  });

  function buildHistoryQuery(user, username) {
    if (user === "favorites") return { to: "favorites", from: username };
    if (isGroupChat(user)) return { to: user };
    return {
      $or: [
        { from: username, to: user },
        { from: user, to: username }
      ]
    };
  }

  socket.on("get_history", async (user, page = 1) => {
    try {
      const { Message } = getModels();
      if (!Message) {
        socket.emit("chat_history", { messages: [], hasMore: false, page });
        return;
      }
      const skip = (page - 1) * MESSAGES_PER_PAGE;
      const query = buildHistoryQuery(user, socket.username);
      const totalMessages = await Message.countDocuments(query);
      const msgs = await Message.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(MESSAGES_PER_PAGE)
        .lean();
      const hasMore = skip + msgs.length < totalMessages;
      const messages = msgs.reverse();
      socket.emit("chat_history", { messages, hasMore, page, total: totalMessages });
    } catch (err) {
      console.error("Ошибка получения истории:", err);
      socket.emit("chat_history", { messages: [], hasMore: false, page });
    }
  });

  socket.on("load_more", async () => {
    try {
      const { Message } = getModels();
      if (!Message) return;
      const state = socket.paginationState;
      if (!state || !state.currentChat || !state.hasMore || state.isLoading) return;
      const nextPage = (state.page || 1) + 1;
      const user = state.currentChat;
      state.isLoading = true;
      const skip = (nextPage - 1) * MESSAGES_PER_PAGE;
      const query = buildHistoryQuery(user, socket.username);
      const totalMessages = await Message.countDocuments(query);
      const msgs = await Message.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(MESSAGES_PER_PAGE)
        .lean();
      const hasMore = skip + msgs.length < totalMessages;
      state.hasMore = hasMore;
      state.page = nextPage;
      state.isLoading = false;
      socket.emit("chat_history", { messages: msgs.reverse(), hasMore, page: nextPage, total: totalMessages });
    } catch (err) {
      if (socket.paginationState) socket.paginationState.isLoading = false;
    }
  });

  socket.on("reset_pagination", () => {
    if (socket.paginationState) {
      socket.paginationState.currentChat = null;
      socket.paginationState.page = 1;
      socket.paginationState.hasMore = true;
      socket.paginationState.isLoading = false;
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
      emitChatList(io, online);
      emitGroupChatList(io, online);
    } catch (err) {}
  });

  socket.on("profile_updated", () => {
    emitChatList(io, online);
    emitGroupChatList(io, online);
  });

  socket.on("view_story", async (storyId) => {
    try {
      const { Story } = getModels();
      if (!Story) return;
      const s = await Story.findById(storyId);
      if (!s) return;
      if (!s.views.includes(socket.username)) {
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

  socket.on("call_end", (data) => {
    sendToUser(io, online, data.to, "call_end", {
      from: socket.username, callId: data.callId
    });
  });

  socket.on("disconnect", async () => {
    console.log(`❌ ${socket.username} отключился`);
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
      emitChatList(io, online);
      emitGroupChatList(io, online);
    }
  });
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

async function emitChatList(io, online) {
  try {
    const sockets = await io.fetchSockets();
    for (const s of sockets) {
      if (s.username) await emitChatListForUser(io, online, s.username);
    }
  } catch (err) {}
}

async function emitChatListForUser(io, online, username) {
  try {
    const socketId = online.get(username);
    if (!socketId) return;

    const { User, Message, Group } = getModels();
    if (!User || !Message) return;

    const me = await User.findOne({ username }).select("blocked chatSettings").lean();
    if (!me) return;
    const blocked = me.blocked || [];
    const settings = me.chatSettings || {};
    const archived = settings.__archived__ || [];
    const pinned = settings.__pinned__ || [];
    const mutes = settings.__mutes || {};

    const chatInfo = await Message.aggregate([
      {
        $match: {
          $and: [
            { $or: [{ from: username }, { to: username }] },
            { to: { $ne: "favorites" } },
            { to: { $not: /^group:/ } }
          ]
        }
      },
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: { $cond: [{ $eq: ["$from", username] }, "$to", "$from"] },
          lastMessage: { $first: "$$ROOT" },
          unreadCount: {
            $sum: {
              $cond: [
                { $and: [{ $eq: ["$to", username] }, { $ne: ["$status", "read"] }] },
                1, 0
              ]
            }
          }
        }
      },
      { $sort: { "lastMessage.createdAt": -1 } }
    ]);

    const chatIds = chatInfo.map(c => c._id);
    const groups = Group ? await Group.find({ "members.username": username }).lean() : [];
    for (const g of groups) chatIds.push(`group:${g._id}`);

    const contacts = chatIds.length
      ? await User.find({ username: { $in: chatIds } })
          .select("username firstName lastName bio avatar avatarColor presence lastSeen").lean()
      : [];

    const usersByName = Object.fromEntries(contacts.filter(c => !c.username?.startsWith("group:")).map(c => [c.username, c]));

    const chatList = chatInfo
      .filter(chat => !blocked.includes(chat._id))
      .map(chat => {
        const user = usersByName[chat._id] || {};
        return {
          type: "dm",
          username: chat._id,
          name: user.firstName ? `${user.firstName} ${user.lastName || ""}`.trim() : chat._id,
          firstName: user.firstName || "",
          lastName: user.lastName || "",
          avatar: user.avatar || "",
          avatarColor: user.avatarColor || "#5e8ee7",
          online: user.presence === "online",
          lastSeen: user.lastSeen,
          lastMessage: chat.lastMessage.message || (chat.lastMessage.attachments?.length ? "📎 Вложение" : ""),
          lastMessageTime: chat.lastMessage.createdAt,
          lastMessageFrom: chat.lastMessage.from,
          lastMessageStatus: chat.lastMessage.status,
          unreadCount: chat.unreadCount || 0,
          archived: archived.includes(chat._id),
          pinned: pinned.includes(chat._id),
          muted: !!mutes[chat._id],
          pinOrder: pinned.indexOf(chat._id)
        };
      });

    const groupList = await Promise.all(groups.map(async (g) => {
      const lastMsg = await Message.findOne({ to: `group:${g._id}` })
        .sort({ createdAt: -1 }).lean();
      const unread = await Message.countDocuments({
        to: `group:${g._id}`, status: { $ne: "read" }, from: { $ne: username }
      });
      const chatId = `group:${g._id}`;
      return {
        type: "group",
        _id: g._id,
        username: chatId,
        name: g.name,
        avatar: g.avatar,
        avatarColor: g.avatarColor,
        description: g.description,
        groupType: g.type,
        memberCount: g.members.length,
        myRole: g.members.find(m => m.username === username)?.role,
        lastMessage: lastMsg?.message || (lastMsg?.attachments?.length ? "📎 Вложение" : ""),
        lastMessageTime: lastMsg?.createdAt || g.createdAt,
        lastMessageFrom: lastMsg?.from,
        unreadCount: unread,
        archived: archived.includes(chatId),
        pinned: pinned.includes(chatId),
        muted: !!mutes[chatId],
        pinOrder: pinned.indexOf(chatId)
      };
    }));

    const all = [...chatList, ...groupList];
    io.to(socketId).emit("chat_list", all);
  } catch (err) {
    console.error("Emit chat list error:", err);
  }
}

async function emitGroupChatList(io, online) {
  try {
    const sockets = await io.fetchSockets();
    for (const s of sockets) {
      if (s.username) await emitGroupChatListForUser(io, s, s.username);
    }
  } catch (err) {}
}

async function emitGroupChatListForUser(io, socket, username) {
  try {
    const { Group, Message } = getModels();
    if (!Group) return;

    const groups = await Group.find({ "members.username": username }).lean();

    const groupList = await Promise.all(groups.map(async (g) => {
      const lastMsg = await Message.findOne({ to: `group:${g._id}` })
        .sort({ createdAt: -1 }).lean();
      const unread = await Message.countDocuments({
        to: `group:${g._id}`, status: { $ne: "read" }, from: { $ne: username }
      });
      return {
        _id: g._id, name: g.name, avatar: g.avatar, avatarColor: g.avatarColor,
        description: g.description, type: g.type, memberCount: g.members.length,
        myRole: g.members.find(m => m.username === username)?.role,
        lastMessage: lastMsg?.message || (lastMsg?.attachments?.length ? "📎 Вложение" : ""),
        lastMessageTime: lastMsg?.createdAt || g.createdAt, unreadCount: unread
      };
    }));

    groupList.sort((a, b) => new Date(b.lastMessageTime) - new Date(a.lastMessageTime));
    socket.emit("group_list", groupList);
  } catch (err) {
    console.error("Emit group list error:", err);
  }
}

function sendToUser(io, online, username, event, data) {
  const id = online.get(username);
  if (id) io.to(id).emit(event, data);
}

module.exports = {
  setupSocketHandlers, emitChatList, emitGroupChatList, emitGroupChatListForUser
};
