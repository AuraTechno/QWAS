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

// Health check
app.get("/health", (req, res) => {
  const mongoStatus = mongoose.connection.readyState;
  const statusMap = { 0: "disconnected", 1: "connected", 2: "connecting", 3: "disconnecting" };
  res.json({ status: "ok", mongodb: statusMap[mongoStatus] || "unknown", online_users: online.size });
});

console.log("🔄 Connecting to MongoDB...");
mongoose.set('strictQuery', false);
mongoose.connect(config.MONGO_URL)
  .then(() => {
    console.log("✅ MongoDB connected successfully!");
    User = require("./models/User");
    Message = require("./models/Message");
    console.log("✅ Models loaded");
  })
  .catch(err => {
    console.error("❌ MongoDB connection error:", err.message);
  });

function generateSessionToken() {
  return crypto.randomBytes(32).toString('hex');
}

/* REGISTER */
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
    
    await User.create({ 
      username, 
      password: hash, 
      avatar: "", 
      avatarColor: "#ffffff" 
    });

    res.json({ ok: true, message: "Регистрация успешна! Теперь войдите." });
  } catch (err) {
    console.error("Register error:", err);
    res.json({ ok: false, error: "Ошибка сервера" });
  }
});

/* LOGIN */
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
        avatarColor: user.avatarColor || "#ffffff" 
      },
      message: "Вход выполнен успешно!"
    });
  } catch (err) {
    console.error("Login error:", err);
    res.json({ ok: false, error: "Ошибка сервера" });
  }
});

/* AUTO LOGIN */
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
        avatarColor: user.avatarColor || "#ffffff" 
      } 
    });
  } catch (err) {
    res.json({ ok: false });
  }
});

/* LOGOUT */
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

/* GET ALL USERS */
app.get("/users/all", async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ ok: false, error: "Нет токена" });
    
    const data = jwt.verify(token, config.JWT_SECRET);
    
    const users = await User.find({
      username: { $ne: data.username }
    }).select('username avatar avatarColor');
    
    res.json({ ok: true, users });
  } catch (err) {
    console.error("Get all users error:", err);
    res.json({ ok: false, users: [] });
  }
});

/* SEARCH USERS */
app.get("/users/search", async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ ok: false });
    
    const data = jwt.verify(token, config.JWT_SECRET);
    let { q } = req.query;
    
    if (!q) {
      const allUsers = await User.find({
        username: { $ne: data.username }
      }).select('username avatar avatarColor').limit(20);
      return res.json({ ok: true, users: allUsers });
    }
    
    q = q.replace(/^@/, '');
    
    const users = await User.find({
      username: { $regex: '^' + q, $options: 'i' },
      username: { $ne: data.username }
    }).select('username avatar avatarColor').limit(10);
    
    res.json({ ok: true, users });
  } catch (err) {
    console.error("Search error:", err);
    res.json({ ok: false, users: [] });
  }
});

/* GET CHAT LIST */
app.get("/chats", async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ ok: false });
    
    const data = jwt.verify(token, config.JWT_SECRET);
    
    const messages = await Message.aggregate([
      {
        $match: {
          $or: [{ from: data.username }, { to: data.username }]
        }
      },
      {
        $group: {
          _id: null,
          contacts: { 
            $addToSet: {
              $cond: [
                { $eq: ["$from", data.username] },
                "$to",
                "$from"
              ]
            }
          }
        }
      }
    ]);
    
    const contactUsernames = messages.length > 0 ? messages[0].contacts : [];
    
    const contacts = await User.find({
      username: { $in: contactUsernames }
    }).select('username avatar avatarColor');
    
    const contactsWithStatus = contacts.map(c => ({
      username: c.username,
      avatar: c.avatar,
      avatarColor: c.avatarColor,
      online: online.has(c.username)
    }));
    
    res.json({ ok: true, chats: contactsWithStatus });
  } catch (err) {
    console.error("Get chats error:", err);
    res.json({ ok: false, chats: [] });
  }
});

/* GET PROFILE */
app.get("/profile", async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ ok: false });
    
    const data = jwt.verify(token, config.JWT_SECRET);
    const user = await User.findOne({ username: data.username }).select('-password');
    
    if (!user) return res.status(404).json({ ok: false, error: "Пользователь не найден" });
    
    res.json({ 
      ok: true, 
      user: { 
        username: user.username, 
        avatar: user.avatar || "", 
        avatarColor: user.avatarColor || "#ffffff" 
      } 
    });
  } catch (err) {
    res.status(401).json({ ok: false, error: "Неверный токен" });
  }
});

/* UPDATE PROFILE */
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
    res.status(500).json({ ok: false, error: "Ошибка сервера" });
  }
});

/* DELETE MESSAGE (REST) */
app.delete("/messages/:id", async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ ok: false });
    
    const data = jwt.verify(token, config.JWT_SECRET);
    const msg = await Message.findById(req.params.id);
    
    if (!msg) return res.status(404).json({ ok: false });
    if (msg.from !== data.username) return res.status(403).json({ ok: false });
    
    await Message.deleteOne({ _id: req.params.id });
    
    send(msg.to, "message_deleted", { messageId: req.params.id });
    
    res.json({ ok: true });
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
  console.log(`✅ User connected: ${socket.username}`);

  online.set(socket.username, socket.id);
  
  if (mongoose.connection.readyState === 1 && User) {
    emitChatList();
    
    try {
      const allUsers = await User.find({
        username: { $ne: socket.username }
      }).select('username avatar avatarColor');
      socket.emit("all_users", allUsers);
    } catch (err) {
      console.error("Send all users error:", err);
    }
  }

  /* SEND MESSAGE */
  socket.on("send_message", async (data) => {
    try {
      if (!Message) return;
      
      const msg = await Message.create({
        from: socket.username,
        to: data.to,
        message: data.message,
        status: "sent"
      });

      const full = await Message.findById(msg._id);
      send(data.to, "new_message", full);
      socket.emit("new_message", full);
      
      emitChatListForUser(socket.username);
      emitChatListForUser(data.to);
    } catch (err) {
      console.error("Send message error:", err);
    }
  });

  /* EDIT MESSAGE */
  socket.on("edit_message", async (data) => {
    try {
      const msg = await Message.findById(data.messageId);
      if (!msg || msg.from !== socket.username) return;
      
      msg.message = data.newText;
      msg.edited = true;
      await msg.save();
      
      send(msg.to, "message_updated", msg);
      socket.emit("message_updated", msg);
    } catch (err) {
      console.error("Edit message error:", err);
    }
  });

  /* DELETE MESSAGE */
  socket.on("delete_message", async (data) => {
    try {
      const msg = await Message.findById(data.messageId);
      if (!msg || msg.from !== socket.username) return;
      
      await Message.deleteOne({ _id: data.messageId });
      
      send(msg.to, "message_deleted", { messageId: data.messageId });
      socket.emit("message_deleted", { messageId: data.messageId });
    } catch (err) {
      console.error("Delete message error:", err);
    }
  });

  /* GET HISTORY */
  socket.on("get_history", async (user) => {
    try {
      if (!Message) { socket.emit("chat_history", []); return; }
      
      const msgs = await Message.find({
        $or: [
          { from: socket.username, to: user },
          { from: user, to: socket.username }
        ]
      }).sort({ createdAt: 1 });

      socket.emit("chat_history", msgs);
    } catch (err) {
      socket.emit("chat_history", []);
    }
  });

  /* READ MESSAGES */
  socket.on("read", async (data) => {
    try {
      if (!Message) return;
      
      const msgs = await Message.find({
        from: data.from,
        to: data.to,
        status: { $ne: "read" }
      });

      if (msgs.length > 0) {
        await Message.updateMany(
          { from: data.from, to: data.to, status: { $ne: "read" } },
          { $set: { status: "read" } }
        );

        send(data.from, "read_update", { messages: msgs.map(m => m._id.toString()) });
      }
    } catch (err) {
      console.error("Read error:", err);
    }
  });

  /* TYPING */
  socket.on("typing", (to) => send(to, "typing", { from: socket.username }));
  socket.on("stop_typing", (to) => send(to, "stop_typing", { from: socket.username }));
  
  /* PROFILE UPDATED */
  socket.on("profile_updated", () => emitChatList());

  /* DISCONNECT */
  socket.on("disconnect", () => {
    console.log(`❌ User disconnected: ${socket.username}`);
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
  } catch (err) {
    console.error("Emit chat list error:", err);
  }
}

async function emitChatListForUser(username) {
  try {
    const socketId = online.get(username);
    if (!socketId) return;
    
    const messages = await Message.aggregate([
      {
        $match: {
          $or: [{ from: username }, { to: username }]
        }
      },
      {
        $group: {
          _id: null,
          contacts: { 
            $addToSet: {
              $cond: [
                { $eq: ["$from", username] },
                "$to",
                "$from"
              ]
            }
          }
        }
      }
    ]);
    
    const contactUsernames = messages.length > 0 ? messages[0].contacts : [];
    
    const contacts = await User.find({
      username: { $in: contactUsernames }
    }).select('username avatar avatarColor');
    
    const chatList = contacts.map(c => ({
      username: c.username,
      avatar: c.avatar,
      avatarColor: c.avatarColor,
      online: online.has(c.username)
    }));
    
    io.to(socketId).emit("chat_list", chatList);
  } catch (err) {
    console.error("Emit chat list for user error:", err);
  }
}

function send(user, event, data) {
  const id = online.get(user);
  if (id) io.to(id).emit(event, data);
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, '127.0.0.1', () => {
  console.log(`🚀 Server running on http://127.0.0.1:${PORT}`);
});