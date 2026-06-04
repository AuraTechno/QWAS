const mongoose = require("mongoose");

function getModels() {
  try {
    return {
      User: require("../models/User"),
      Message: require("../models/Message"),
      Group: require("../models/Group")
    };
  } catch {
    return { User: null, Message: null, Group: null };
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
    const { User } = getModels();
    if (User) {
      emitChatList(io, online);
      emitGroupChatListForUser(io, socket, socket.username);
      User.find({ username: { $ne: socket.username } })
        .select("username avatar avatarColor").lean()
        .then(users => socket.emit("all_users", users))
        .catch(() => {});
    }
  } catch {}

  socket.on("send_message", async (data) => {
    try {
      const { Message } = getModels();
      if (!Message) return;

      let to = data.to;
      if (isGroupChat(to)) {
        const { Group } = getModels();
        if (Group) {
          const group = await Group.findById(getGroupId(to)).lean();
          if (!group || !group.members.some(m => m.username === socket.username)) return;
        }
      }

      const msg = await Message.create({
        from: socket.username,
        to,
        message: data.message || "",
        attachments: data.attachments || [],
        isForwarded: data.isForwarded || false,
        forwardedFrom: data.forwardedFrom || null,
        status: "sent"
      });

      const full = msg.toObject();

      if (to === "favorites") {
        socket.emit("new_message", full);
      } else if (isGroupChat(to)) {
        io.to(to).emit("new_message", full);
        socket.emit("new_message", full);
      } else {
        sendToUser(io, online, to, "new_message", full);
        socket.emit("new_message", full);
      }

      emitChatListForUser(io, online, socket.username);
      if (to === "favorites") return;
      if (isGroupChat(to)) {
        for (const [uname, sid] of online) {
          const { Group } = getModels();
          if (Group) {
            const g = await Group.findById(getGroupId(to)).lean();
            if (g && g.members.some(m => m.username === uname) && uname !== socket.username) {
              emitChatListForUser(io, online, uname);
            }
          }
        }
      } else {
        emitChatListForUser(io, online, to);
      }
    } catch (err) {
      console.error("Ошибка отправки:", err);
    }
  });

  socket.on("edit_message", async (data) => {
    try {
      const { Message } = getModels();
      if (!Message) return;
      const msg = await Message.findById(data.messageId);
      if (!msg || msg.from !== socket.username) return;

      msg.message = data.newText;
      msg.edited = true;
      await msg.save();

      const updated = msg.toObject();
      if (msg.to === "favorites") {
        socket.emit("message_updated", updated);
      } else if (isGroupChat(msg.to)) {
        io.to(msg.to).emit("message_updated", updated);
        socket.emit("message_updated", updated);
      } else {
        sendToUser(io, online, msg.to, "message_updated", updated);
        socket.emit("message_updated", updated);
      }
    } catch (err) {}
  });

  socket.on("delete_message", async (data) => {
    try {
      const { Message } = getModels();
      if (!Message) return;
      const msg = await Message.findById(data.messageId);
      if (!msg || msg.from !== socket.username) return;

      await Message.deleteOne({ _id: data.messageId });

      if (msg.to === "favorites") {
        socket.emit("message_deleted", { messageId: data.messageId });
      } else if (isGroupChat(msg.to)) {
        io.to(msg.to).emit("message_deleted", { messageId: data.messageId });
        socket.emit("message_deleted", { messageId: data.messageId });
      } else {
        sendToUser(io, online, msg.to, "message_deleted", { messageId: data.messageId });
        socket.emit("message_deleted", { messageId: data.messageId });
      }
    } catch (err) {}
  });

  socket.on("mark_as_read", async (data) => {
    try {
      const { Message } = getModels();
      if (!Message) return;

      let query;
      if (isGroupChat(data.chatId)) {
        query = { to: data.chatId, status: { $ne: "read" }, from: { $ne: socket.username } };
      } else {
        query = { from: data.from, to: socket.username, status: { $ne: "read" } };
      }

      const result = await Message.updateMany(query, { $set: { status: "read" } });

      if (result.modifiedCount > 0) {
        if (!isGroupChat(data.chatId)) {
          sendToUser(io, online, data.from, "messages_read", { by: socket.username, chatWith: data.from });
        }
        emitChatListForUser(io, online, socket.username);
      }
    } catch (err) {
      console.error("Ошибка отметки прочитано:", err);
    }
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

  function handleHistoryMarkRead(query, user, username) {
    if (user === "favorites" || isGroupChat(user)) return;
    return Message.updateMany(
      { from: user, to: username, status: { $ne: "read" } },
      { $set: { status: "read" } }
    ).then(() => {
      sendToUser(io, online, user, "messages_read", { by: username, chatWith: user });
      emitChatListForUser(io, online, username);
    }).catch(() => {});
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

      if (page === 1) {
        handleHistoryMarkRead(null, user, socket.username);
      }
    } catch (err) {
      console.error("Ошибка получения истории:", err);
      socket.emit("chat_history", { messages: [], hasMore: false, page });
    }
  });

  socket.on("load_more", async () => {
    try {
      const { Message } = getModels();
      if (!Message) {
        socket.emit("chat_history", { messages: [], hasMore: false, page: 2 });
        return;
      }

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
      console.error("Ошибка в load_more:", err);
      if (socket.paginationState) socket.paginationState.isLoading = false;
      socket.emit("chat_history", { messages: [], hasMore: false, page: (socket.paginationState?.page || 1) + 1 });
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
      socket.to(to).emit("typing", { from: socket.username });
    } else {
      sendToUser(io, online, to, "typing", { from: socket.username });
    }
  });

  socket.on("stop_typing", (to) => {
    if (to === "favorites") return;
    if (isGroupChat(to)) {
      socket.to(to).emit("stop_typing", { from: socket.username });
    } else {
      sendToUser(io, online, to, "stop_typing", { from: socket.username });
    }
  });

  socket.on("profile_updated", () => {
    emitChatList(io, online);
    emitGroupChatList(io, online);
  });

  socket.on("disconnect", () => {
    console.log(`❌ ${socket.username} отключился`);
    online.delete(socket.username);
    if (mongoose.connection.readyState === 1) {
      emitChatList(io, online);
      emitGroupChatList(io, online);
    }
  });
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

    const { User, Message } = getModels();
    if (!User || !Message) return;

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
          _id: {
            $cond: [{ $eq: ["$from", username] }, "$to", "$from"]
          },
          lastMessage: { $first: "$$ROOT" },
          unreadCount: {
            $sum: {
              $cond: [
                { $and: [{ $eq: ["$to", username] }, { $ne: ["$status", "read"] }] },
                1,
                0
              ]
            }
          }
        }
      },
      { $sort: { "lastMessage.createdAt": -1 } }
    ]);

    const contacts = await User.find({ username: { $in: chatInfo.map(c => c._id) } })
      .select("username avatar avatarColor").lean();

    const chatList = chatInfo.map(chat => {
      const user = contacts.find(c => c.username === chat._id);
      return {
        username: chat._id,
        avatar: user?.avatar || "",
        avatarColor: user?.avatarColor || "#6366f1",
        online: online.has(chat._id),
        lastMessage: chat.lastMessage.message,
        lastMessageTime: chat.lastMessage.createdAt,
        unreadCount: chat.unreadCount || 0
      };
    });

    io.to(socketId).emit("chat_list", chatList);
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
        to: `group:${g._id}`,
        status: { $ne: "read" },
        from: { $ne: username }
      });
      return {
        _id: g._id,
        name: g.name,
        avatar: g.avatar,
        avatarColor: g.avatarColor,
        description: g.description,
        type: g.type,
        memberCount: g.members.length,
        myRole: g.members.find(m => m.username === username)?.role,
        lastMessage: lastMsg?.message || "",
        lastMessageTime: lastMsg?.createdAt || g.createdAt,
        unreadCount: unread
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

module.exports = { setupSocketHandlers, emitChatList, emitGroupChatList, emitGroupChatListForUser };
