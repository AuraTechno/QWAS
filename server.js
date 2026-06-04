const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");

const config = require("./config");

let User, Message;

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

app.use(express.json({ limit: '10mb' }));
app.use(express.static("public"));

const online = new Map();
const MESSAGES_PER_PAGE = config.MESSAGES_PER_PAGE || 30;
const paginationState = new Map();

app.get("/health", (req, res) => {
  const mongoStatus = mongoose.connection.readyState;
  const statusMap = { 0: "disconnected", 1: "connected", 2: "connecting", 3: "disconnecting" };
  res.json({ status: "ok", mongodb: statusMap[mongoStatus] || "unknown", online_users: online.size });
});

console.log("🔄 Подключение к MongoDB...");
mongoose.set('strictQuery', false);
mongoose.connect(config.MONGO_URL)
  .then(() => {
    console.log("✅ MongoDB подключена!");
    User = require("./models/User");
    Message = require("./models/Message");
    console.log("✅ Модели загружены");
  })
  .catch(err => {
    console.error("❌ Ошибка подключения к MongoDB:", err.message);
  });

function generateSessionToken() {
  return crypto.randomBytes(32).toString('hex');
}

/* РЕГИСТРАЦИЯ */
app.post("/register", async (req, res) => {
  try {
    if (!User) return res.status(503).json({ ok: false, error: "База данных не готова" });
    
    let { username, password } = req.body;
    if (!username || !password) return res.json({ ok: false, error: "Введите логин и пароль" });

    username = username.replace(/^@/, '');
    
    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      return res.json({ ok: false, error: "Логин может содержать только буквы, цифры и _" });
    }

    const exists = await User.findOne({ username });
    if (exists) return res.json({ ok: false, error: "Пользователь уже существует" });

    const hash = await bcrypt.hash(password, 10);
    
    const colors = ["#6366f1", "#8b5cf6", "#ec4899", "#f43f5e", "#f97316", "#eab308", "#22c55e", "#06b6d4", "#3b82f6"];
    const randomColor = colors[Math.floor(Math.random() * colors.length)];
    
    await User.create({ 
      username, 
      password: hash, 
      avatar: "", 
      avatarColor: randomColor 
    });

    res.json({ ok: true, message: "Регистрация успешна!" });
  } catch (err) {
    console.error("Ошибка регистрации:", err);
    res.json({ ok: false, error: "Ошибка сервера" });
  }
});

/* ВХОД */
app.post("/login", async (req, res) => {
  try {
    if (!User) return res.status(503).json({ ok: false, error: "База данных не готова" });
    
    let { username, password } = req.body;
    username = username.replace(/^@/, '');
    
    const user = await User.findOne({ username });
    if (!user) return res.json({ ok: false, error: "Пользователь не найден" });

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.json({ ok: false, error: "Неверный пароль" });

    const sessionToken = generateSessionToken();
    const token = jwt.sign({ username, sessionToken }, config.JWT_SECRET);
    
    await User.updateOne({ username }, { $set: { sessionToken } });

    res.json({ 
      ok: true, 
      token, 
      user: { 
        username: user.username, 
        avatar: user.avatar || "", 
        avatarColor: user.avatarColor || "#6366f1" 
      },
      message: "Вход выполнен успешно!"
    });
  } catch (err) {
    console.error("Ошибка входа:", err);
    res.json({ ok: false, error: "Ошибка сервера" });
  }
});

/* АВТО-ВХОД */
app.post("/auto-login", async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.json({ ok: false });
    
    const data = jwt.verify(token, config.JWT_SECRET);
    const user = await User.findOne({ 
      username: data.username,
      sessionToken: data.sessionToken 
    });
    
    if (!user) return res.json({ ok: false });
    
    res.json({ 
      ok: true, 
      user: { 
        username: user.username, 
        avatar: user.avatar || "", 
        avatarColor: user.avatarColor || "#6366f1" 
      } 
    });
  } catch (err) {
    res.json({ ok: false });
  }
});

/* ВЫХОД */
app.post("/logout", async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (token) {
      const data = jwt.verify(token, config.JWT_SECRET);
      await User.updateOne({ username: data.username }, { $set: { sessionToken: null } });
    }
    res.json({ ok: true });
  } catch (err) {
    res.json({ ok: true });
  }
});

/* ВСЕ ПОЛЬЗОВАТЕЛИ */
app.get("/users/all", async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ ok: false });
    
    const data = jwt.verify(token, config.JWT_SECRET);
    
    const users = await User.find({
      username: { $ne: data.username }
    }).select('username avatar avatarColor').lean();
    
    res.json({ ok: true, users });
  } catch (err) {
    res.json({ ok: false, users: [] });
  }
});

/* СПИСОК ЧАТОВ - с сортировкой по последнему сообщению */
app.get("/chats", async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ ok: false });
    
    const data = jwt.verify(token, config.JWT_SECRET);
    
    // Получаем все чаты с последним сообщением
    const chatInfo = await Message.aggregate([
      { 
        $match: { 
          $or: [{ from: data.username }, { to: data.username }],
          to: { $ne: "favorites" }
        } 
      },
      { 
        $sort: { createdAt: -1 } 
      },
      {
        $group: {
          _id: {
            $cond: [
              { $eq: ["$from", data.username] },
              "$to",
              "$from"
            ]
          },
          lastMessage: { $first: "$$ROOT" },
          unreadCount: {
            $sum: {
              $cond: [
                { 
                  $and: [
                    { $eq: ["$to", data.username] },
                    { $ne: ["$status", "read"] }
                  ]
                },
                1,
                0
              ]
            }
          }
        }
      },
      {
        $sort: { "lastMessage.createdAt": -1 }
      }
    ]);
    
    // Получаем информацию о пользователях
    const contacts = await User.find({
      username: { $in: chatInfo.map(c => c._id) }
    }).select('username avatar avatarColor').lean();
    
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
    
    res.json({ ok: true, chats: chatList });
  } catch (err) {
    console.error("Get chats error:", err);
    res.json({ ok: false, chats: [] });
  }
});

/* ПРОФИЛЬ */
app.get("/profile", async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ ok: false });
    
    const data = jwt.verify(token, config.JWT_SECRET);
    const user = await User.findOne({ username: data.username }).select('-password').lean();
    
    if (!user) return res.status(404).json({ ok: false });
    
    res.json({ ok: true, user });
  } catch (err) {
    res.status(401).json({ ok: false });
  }
});

/* ОБНОВЛЕНИЕ ПРОФИЛЯ */
app.post("/profile/update", async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ ok: false });
    
    const data = jwt.verify(token, config.JWT_SECRET);
    const { avatar, avatarColor } = req.body;
    
    const update = {};
    if (avatar !== undefined) update.avatar = avatar;
    if (avatarColor !== undefined) update.avatarColor = avatarColor;
    
    await User.updateOne({ username: data.username }, { $set: update });
    
    emitChatList();
    
    res.json({ ok: true, message: "Профиль обновлён" });
  } catch (err) {
    res.status(500).json({ ok: false });
  }
});

/* SOCKET AUTH */
io.use((socket, next) => {
  try {
    const token = socket.handshake.auth.token;
    if (!token) return next(new Error("No token"));
    const data = jwt.verify(token, config.JWT_SECRET);
    socket.username = data.username;
    next();
  } catch (err) {
    next(new Error("auth"));
  }
});

io.on("connection", async (socket) => {
  console.log(`✅ ${socket.username} подключился`);

  online.set(socket.username, socket.id);
  
  paginationState.set(socket.id, {
    currentChat: null,
    page: 1,
    hasMore: true,
    isLoading: false
  });
  
  if (mongoose.connection.readyState === 1 && User) {
    emitChatList();
    
    try {
      const allUsers = await User.find({ username: { $ne: socket.username } })
        .select('username avatar avatarColor').lean();
      socket.emit("all_users", allUsers);
    } catch (err) {}
  }

  /* ОТПРАВКА СООБЩЕНИЯ */
  socket.on("send_message", async (data) => {
    try {
      if (!Message) return;
      
      const msg = await Message.create({
        from: socket.username,
        to: data.to,
        message: data.message,
        isForwarded: data.isForwarded || false,
        forwardedFrom: data.forwardedFrom || null,
        status: "sent"
      });

      const full = msg.toObject();
      
      if (data.to === "favorites") {
        socket.emit("new_message", full);
      } else {
        send(data.to, "new_message", full);
        socket.emit("new_message", full);
      }
      
      // Обновляем список чатов у обоих (сортировка по последнему сообщению)
      emitChatListForUser(socket.username);
      if (data.to !== "favorites") {
        emitChatListForUser(data.to);
      }
    } catch (err) {
      console.error("Ошибка отправки:", err);
    }
  });

  /* РЕДАКТИРОВАНИЕ */
  socket.on("edit_message", async (data) => {
    try {
      const msg = await Message.findById(data.messageId);
      if (!msg || msg.from !== socket.username) return;
      
      msg.message = data.newText;
      msg.edited = true;
      await msg.save();
      
      const updated = msg.toObject();
      if (msg.to !== "favorites") send(msg.to, "message_updated", updated);
      socket.emit("message_updated", updated);
    } catch (err) {}
  });

  /* УДАЛЕНИЕ */
  socket.on("delete_message", async (data) => {
    try {
      const msg = await Message.findById(data.messageId);
      if (!msg || msg.from !== socket.username) return;
      
      await Message.deleteOne({ _id: data.messageId });
      
      if (msg.to !== "favorites") {
        send(msg.to, "message_deleted", { messageId: data.messageId });
      }
      socket.emit("message_deleted", { messageId: data.messageId });
    } catch (err) {}
  });

  /* ОТМЕТКА О ПРОЧТЕНИИ */
  socket.on("mark_as_read", async (data) => {
    try {
      if (!Message) return;
      
      const result = await Message.updateMany(
        { from: data.from, to: socket.username, status: { $ne: "read" } },
        { $set: { status: "read" } }
      );
      
      if (result.modifiedCount > 0) {
        send(data.from, "messages_read", { 
          by: socket.username,
          chatWith: data.from 
        });
        // Обновляем список чатов чтобы сбросить счётчик непрочитанных
        emitChatListForUser(socket.username);
      }
    } catch (err) {
      console.error("Ошибка отметки прочитано:", err);
    }
  });

  /* ЗАГРУЗКА ИСТОРИИ */
  socket.on("get_history", async (user, page = 1) => {
    try {
      if (!Message) { socket.emit("chat_history", { messages: [], hasMore: false, page }); return; }
      
      const state = paginationState.get(socket.id);
      if (state) {
        state.currentChat = user;
        state.page = page;
        state.isLoading = true;
      }
      
      const skip = (page - 1) * MESSAGES_PER_PAGE;
      
      let query;
      if (user === "favorites") {
        query = { to: "favorites", from: socket.username };
      } else {
        query = {
          $or: [
            { from: socket.username, to: user },
            { from: user, to: socket.username }
          ]
        };
      }
      
      const totalMessages = await Message.countDocuments(query);
      
      const msgs = await Message.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(MESSAGES_PER_PAGE)
        .lean();
      
      const hasMore = skip + msgs.length < totalMessages;
      const messages = msgs.reverse();
      
      if (state) {
        state.hasMore = hasMore;
        state.isLoading = false;
      }
      
      socket.emit("chat_history", { messages, hasMore, page, total: totalMessages });
      
      if (page === 1 && user !== "favorites") {
        await Message.updateMany(
          { from: user, to: socket.username, status: { $ne: "read" } },
          { $set: { status: "read" } }
        );
        
        send(user, "messages_read", { by: socket.username, chatWith: user });
        emitChatListForUser(socket.username);
      }
    } catch (err) {
      console.error("❌ Ошибка получения истории:", err);
      const state = paginationState.get(socket.id);
      if (state) state.isLoading = false;
      socket.emit("chat_history", { messages: [], hasMore: false, page });
    }
  });

  /* ЗАГРУЗКА СЛЕДУЮЩЕЙ СТРАНИЦЫ */
  socket.on("load_more", async () => {
    const state = paginationState.get(socket.id);
    
    if (state && state.currentChat && state.hasMore && !state.isLoading) {
      const nextPage = (state.page || 1) + 1;
      const user = state.currentChat;
      
      try {
        if (!Message) {
          socket.emit("chat_history", { messages: [], hasMore: false, page: nextPage });
          return;
        }
        
        state.isLoading = true;
        
        const skip = (nextPage - 1) * MESSAGES_PER_PAGE;
        
        let query;
        if (user === "favorites") {
          query = { to: "favorites", from: socket.username };
        } else {
          query = {
            $or: [
              { from: socket.username, to: user },
              { from: user, to: socket.username }
            ]
          };
        }
        
        const totalMessages = await Message.countDocuments(query);
        
        const msgs = await Message.find(query)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(MESSAGES_PER_PAGE)
          .lean();
        
        const hasMore = skip + msgs.length < totalMessages;
        const messages = msgs.reverse();
        
        state.hasMore = hasMore;
        state.page = nextPage;
        state.isLoading = false;
        
        socket.emit("chat_history", { messages, hasMore, page: nextPage, total: totalMessages });
      } catch (err) {
        console.error("❌ Ошибка в load_more:", err);
        state.isLoading = false;
        socket.emit("chat_history", { messages: [], hasMore: false, page: nextPage });
      }
    }
  });

  /* СБРОС ПАГИНАЦИИ */
  socket.on("reset_pagination", () => {
    const state = paginationState.get(socket.id);
    if (state) {
      state.currentChat = null;
      state.page = 1;
      state.hasMore = true;
      state.isLoading = false;
    }
  });

  socket.on("typing", (to) => {
    if (to !== "favorites") send(to, "typing", { from: socket.username });
  });
  
  socket.on("stop_typing", (to) => {
    if (to !== "favorites") send(to, "stop_typing", { from: socket.username });
  });
  
  socket.on("profile_updated", () => emitChatList());

  socket.on("disconnect", () => {
    console.log(`❌ ${socket.username} отключился`);
    online.delete(socket.username);
    paginationState.delete(socket.id);
    if (mongoose.connection.readyState === 1 && User) emitChatList();
  });
});

async function emitChatList() {
  try {
    if (!User) return;
    const sockets = await io.fetchSockets();
    for (const socket of sockets) {
      await emitChatListForUser(socket.username);
    }
  } catch (err) {}
}

async function emitChatListForUser(username) {
  try {
    const socketId = online.get(username);
    if (!socketId) return;
    
    const chatInfo = await Message.aggregate([
      { 
        $match: { 
          $or: [{ from: username }, { to: username }],
          to: { $ne: "favorites" }
        } 
      },
      { 
        $sort: { createdAt: -1 } 
      },
      {
        $group: {
          _id: {
            $cond: [
              { $eq: ["$from", username] },
              "$to",
              "$from"
            ]
          },
          lastMessage: { $first: "$$ROOT" },
          unreadCount: {
            $sum: {
              $cond: [
                { 
                  $and: [
                    { $eq: ["$to", username] },
                    { $ne: ["$status", "read"] }
                  ]
                },
                1,
                0
              ]
            }
          }
        }
      },
      {
        $sort: { "lastMessage.createdAt": -1 }
      }
    ]);
    
    const contacts = await User.find({
      username: { $in: chatInfo.map(c => c._id) }
    }).select('username avatar avatarColor').lean();
    
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

function send(user, event, data) {
  const id = online.get(user);
  if (id) io.to(id).emit(event, data);
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Сервер запущен на http://127.0.0.1:${PORT}`);
});