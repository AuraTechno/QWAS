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

app.get("/health", (req, res) => {
  const mongoStatus = mongoose.connection.readyState;
  const statusMap = { 0: "disconnected", 1: "connected", 2: "connecting", 3: "disconnecting" };
  res.json({ status: "ok", mongodb: statusMap[mongoStatus] || "unknown", online_users: online.size });
});

console.log("🔄 Подключение к MongoDB...");
console.log("📝 URL:", config.MONGO_URL.replace(/:[^:@]+@/, ':****@'));

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

/* СПИСОК ЧАТОВ */
app.get("/chats", async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ ok: false });
    
    const data = jwt.verify(token, config.JWT_SECRET);
    
    const messages = await Message.aggregate([
      { $match: { $or: [{ from: data.username }, { to: data.username }] } },
      { $group: { _id: null, contacts: { $addToSet: { $cond: [{ $eq: ["$from", data.username] }, "$to", "$from"] } } } }
    ]);
    
    const contactUsernames = messages.length > 0 ? messages[0].contacts.filter(u => u !== "favorites") : [];
    
    const contacts = await User.find({ username: { $in: contactUsernames } })
      .select('username avatar avatarColor').lean();
    
    const contactsWithStatus = contacts.map(c => ({
      username: c.username,
      avatar: c.avatar,
      avatarColor: c.avatarColor,
      online: online.has(c.username)
    }));
    
    res.json({ ok: true, chats: contactsWithStatus });
  } catch (err) {
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
      if (!Message) {
        console.error("❌ Message модель не загружена");
        return;
      }
      
      console.log(`📨 Сообщение от ${socket.username} для ${data.to}: ${data.message.substring(0, 30)}...`);
      
      const msg = await Message.create({
        from: socket.username,
        to: data.to,
        message: data.message,
        isForwarded: data.isForwarded || false,
        forwardedFrom: data.forwardedFrom || null,
        status: "sent"
      });

      console.log(`✅ Сообщение сохранено в БД, ID: ${msg._id}`);

      const full = msg.toObject();
      
      if (data.to === "favorites") {
        socket.emit("new_message", full);
      } else {
        send(data.to, "new_message", full);
        socket.emit("new_message", full);
      }
      
      emitChatListForUser(socket.username);
      if (data.to !== "favorites") {
        emitChatListForUser(data.to);
      }
    } catch (err) {
      console.error("❌ Ошибка отправки:", err);
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
      }
    } catch (err) {
      console.error("Ошибка отметки прочитано:", err);
    }
  });

  /* ИСТОРИЯ */
  socket.on("get_history", async (user) => {
    try {
      if (!Message) { socket.emit("chat_history", []); return; }
      
      console.log(`📜 Запрос истории: ${socket.username} <-> ${user}`);
      
      let msgs;
      if (user === "favorites") {
        msgs = await Message.find({ to: "favorites", from: socket.username })
          .sort({ createdAt: 1 }).limit(50).lean();
      } else {
        msgs = await Message.find({
          $or: [
            { from: socket.username, to: user },
            { from: user, to: socket.username }
          ]
        }).sort({ createdAt: 1 }).limit(50).lean();
        
        await Message.updateMany(
          { from: user, to: socket.username, status: { $ne: "read" } },
          { $set: { status: "read" } }
        );
        
        send(user, "messages_read", { 
          by: socket.username,
          chatWith: user 
        });
      }

      console.log(`📜 Найдено ${msgs.length} сообщений`);
      socket.emit("chat_history", msgs);
    } catch (err) {
      console.error("❌ Ошибка получения истории:", err);
      socket.emit("chat_history", []);
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
    
    const messages = await Message.aggregate([
      { $match: { $or: [{ from: username }, { to: username }] } },
      { $group: { _id: null, contacts: { $addToSet: { $cond: [{ $eq: ["$from", username] }, "$to", "$from"] } } } }
    ]);
    
    const contactUsernames = messages.length > 0 ? messages[0].contacts.filter(u => u !== "favorites") : [];
    
    const contacts = await User.find({ username: { $in: contactUsernames } })
      .select('username avatar avatarColor').lean();
    
    const chatList = contacts.map(c => ({
      username: c.username,
      avatar: c.avatar,
      avatarColor: c.avatarColor,
      online: online.has(c.username)
    }));
    
    io.to(socketId).emit("chat_list", chatList);
  } catch (err) {}
}

function send(user, event, data) {
  const id = online.get(user);
  if (id) io.to(id).emit(event, data);
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, '127.0.0.1', () => {
  console.log(`🚀 Сервер запущен на http://127.0.0.1:${PORT}`);
});