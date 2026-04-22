const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

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

/* REGISTER */
app.post("/register", async (req, res) => {
  try {
    if (!User) return res.status(503).json({ ok: false, error: "Database not ready" });
    
    let { username, password } = req.body;
    if (!username || !password) return res.json({ ok: false, error: "Username and password required" });

    // Убираем @ если пользователь его ввел
    username = username.replace(/^@/, '');
    
    // Проверяем что username содержит только допустимые символы
    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      return res.json({ ok: false, error: "Username can only contain letters, numbers and underscores" });
    }

    const exists = await User.findOne({ username });
    if (exists) return res.json({ ok: false, error: "User exists" });

    const hash = await bcrypt.hash(password, 10);
    
    const colors = ["#667eea", "#764ba2", "#e74c3c", "#3498db", "#2ecc71", "#f39c12", "#1abc9c", "#e67e22"];
    const randomColor = colors[Math.floor(Math.random() * colors.length)];
    
    await User.create({ username, password: hash, avatarColor: randomColor });

    res.json({ ok: true });
  } catch (err) {
    console.error("Register error:", err);
    res.json({ ok: false, error: "Server error" });
  }
});

/* LOGIN */
app.post("/login", async (req, res) => {
  try {
    if (!User) return res.status(503).json({ ok: false, error: "Database not ready" });
    
    let { username, password } = req.body;
    username = username.replace(/^@/, '');
    
    const user = await User.findOne({ username });
    if (!user) return res.json({ ok: false, error: "User not found" });

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.json({ ok: false, error: "Wrong password" });

    const token = jwt.sign({ username }, config.JWT_SECRET);
    res.json({ 
      ok: true, 
      token, 
      user: { 
        username: user.username, 
        avatar: user.avatar || "", 
        avatarColor: user.avatarColor || "#667eea" 
      } 
    });
  } catch (err) {
    console.error("Login error:", err);
    res.json({ ok: false, error: "Server error" });
  }
});

/* GET ALL USERS (для поиска) */
app.get("/users/all", async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      console.log("❌ No token in /users/all");
      return res.status(401).json({ ok: false, error: "No token" });
    }
    
    const data = jwt.verify(token, config.JWT_SECRET);
    console.log("📋 Fetching all users for:", data.username);
    
    const users = await User.find({
      username: { $ne: data.username }
    }).select('username avatar avatarColor');
    
    console.log(`✅ Found ${users.length} users for search`);
    
    res.json({ ok: true, users });
  } catch (err) {
    console.error("❌ Get all users error:", err.message);
    res.json({ ok: false, users: [] });
  }
});
/* SEARCH USERS */
app.get("/users/search", async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ ok: false, error: "No token" });
    
    const data = jwt.verify(token, config.JWT_SECRET);
    let { q } = req.query;
    
    if (!q) {
      // Если запрос пустой, возвращаем всех пользователей кроме себя
      const allUsers = await User.find({
        username: { $ne: data.username }
      }).select('username avatar avatarColor').limit(20);
      return res.json({ ok: true, users: allUsers });
    }
    
    // Убираем @ если есть
    q = q.replace(/^@/, '');
    
    // Ищем пользователей (исключая себя)
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

/* GET CHAT LIST (только те с кем есть сообщения) */
app.get("/chats", async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ ok: false, error: "No token" });
    
    const data = jwt.verify(token, config.JWT_SECRET);
    
    // Находим всех с кем были сообщения
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
    
    // Получаем информацию о контактах
    const contacts = await User.find({
      username: { $in: contactUsernames }
    }).select('username avatar avatarColor');
    
    // Добавляем онлайн статус
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
    if (!token) return res.status(401).json({ ok: false, error: "No token" });
    
    const data = jwt.verify(token, config.JWT_SECRET);
    const user = await User.findOne({ username: data.username }).select('-password');
    
    if (!user) return res.status(404).json({ ok: false, error: "User not found" });
    
    res.json({ 
      ok: true, 
      user: { 
        username: user.username, 
        avatar: user.avatar || "", 
        avatarColor: user.avatarColor || "#667eea" 
      } 
    });
  } catch (err) {
    res.status(401).json({ ok: false, error: "Invalid token" });
  }
});

/* UPDATE PROFILE */
app.post("/profile/update", async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ ok: false, error: "No token" });
    
    const data = jwt.verify(token, config.JWT_SECRET);
    const { avatar, avatarColor } = req.body;
    
    const update = {};
    if (avatar !== undefined) update.avatar = avatar;
    if (avatarColor !== undefined) update.avatarColor = avatarColor;
    
    await User.updateOne({ username: data.username }, { $set: update });
    
    // Оповещаем всех об обновлении
    emitChatList();
    
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: "Server error" });
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
    
    // Отправляем список всех пользователей для поиска
    try {
      const allUsers = await User.find({
        username: { $ne: socket.username }
      }).select('username avatar avatarColor');
      socket.emit("all_users", allUsers);
    } catch (err) {
      console.error("Send all users error:", err);
    }
  }

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
      
      // Обновляем список чатов у обоих пользователей
      emitChatListForUser(socket.username);
      emitChatListForUser(data.to);
    } catch (err) {
      console.error("Send message error:", err);
    }
  });

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

  socket.on("typing", (to) => send(to, "typing", { from: socket.username }));
  socket.on("stop_typing", (to) => send(to, "stop_typing", { from: socket.username }));
  
  socket.on("profile_updated", () => emitChatList());

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
    
    // Находим все чаты пользователя
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