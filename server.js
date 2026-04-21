const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const config = require("./config");

// Модели подключаем после проверки MongoDB
let User, Message;

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.use(express.json());
app.use(express.static("public"));

/* ONLINE USERS */
const online = new Map();

// Health check endpoint - работает даже без MongoDB
app.get("/health", (req, res) => {
  const mongoStatus = mongoose.connection.readyState;
  const statusMap = {
    0: "disconnected",
    1: "connected",
    2: "connecting",
    3: "disconnecting"
  };
  
  res.json({ 
    status: "ok", 
    mongodb: statusMap[mongoStatus] || "unknown",
    online_users: online.size
  });
});

// Статус сервера
app.get("/status", (req, res) => {
  res.json({
    server: "running",
    mongodb_connected: mongoose.connection.readyState === 1,
    online_users: Array.from(online.keys())
  });
});

/* Подключение к MongoDB */
console.log("🔄 Connecting to MongoDB...");
console.log("📝 URL:", config.MONGO_URL.replace(/:[^:@]+@/, ':****@')); // Скрываем пароль

mongoose.set('strictQuery', false);

// Убираем устаревшие опции - в Mongoose 6+ они не нужны
mongoose.connect(config.MONGO_URL)
.then(() => {
  console.log("✅ MongoDB connected successfully!");
  
  // Загружаем модели только после успешного подключения
  User = require("./models/User");
  Message = require("./models/Message");
  
  console.log("✅ Models loaded");
})
.catch(err => {
  console.error("❌ MongoDB connection error:");
  console.error("  Error name:", err.name);
  console.error("  Error message:", err.message);
  
  if (err.message.includes("bad auth")) {
    console.error("  🔐 Authentication failed! Check username/password in MONGO_URL");
  } else if (err.message.includes("ENOTFOUND")) {
    console.error("  🌐 DNS error! Check MongoDB cluster address");
  } else if (err.message.includes("whitelist")) {
    console.error("  🚫 IP not whitelisted! Add your server IP to MongoDB Atlas");
  }
});

// Отслеживаем события подключения
mongoose.connection.on('error', err => {
  console.error('❌ MongoDB connection error:', err.message);
});

mongoose.connection.on('disconnected', () => {
  console.log('⚠️ MongoDB disconnected');
});

mongoose.connection.on('reconnected', () => {
  console.log('✅ MongoDB reconnected');
});

/* REGISTER */
app.post("/register", async (req, res) => {
  try {
    if (!User) {
      return res.status(503).json({ ok: false, error: "Ошибка базы данных" });
    }
    
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.json({ ok: false, error: "Требуется имя пользователя и пароль" });
    }

    const exists = await User.findOne({ username });
    if (exists) return res.json({ ok: false, error: "Пользователь существует" });

    const hash = await bcrypt.hash(password, 10);
    await User.create({ username, password: hash });

    res.json({ ok: true });
  } catch (err) {
    console.error("Ошибка регистрации:", err);
    res.json({ ok: false, error: "Ошибка сервера" });
  }
});

/* LOGIN */
app.post("/login", async (req, res) => {
  try {
    if (!User) {
      return res.status(503).json({ ok: false, error: "Ошибка базы данных" });
    }
    
    const { username, password } = req.body;

    const user = await User.findOne({ username });
    if (!user) return res.json({ ok: false, error: "Пользователя не существует" });

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.json({ ok: false, error: "Неправильный пароль" });

    const token = jwt.sign({ username }, config.JWT_SECRET);
    res.json({ ok: true, token });
  } catch (err) {
    console.error("Login error:", err);
    res.json({ ok: false, error: "Server error" });
  }
});

/* SOCKET AUTH */
io.use((socket, next) => {
  try {
    const token = socket.handshake.auth.token;
    if (!token) {
      return next(new Error("No token"));
    }
    const data = jwt.verify(token, config.JWT_SECRET);
    socket.username = data.username;
    next();
  } catch (err) {
    console.error("Socket auth error:", err);
    next(new Error("auth"));
  }
});

io.on("connection", (socket) => {
  console.log(`✅ User connected: ${socket.username}`);

  online.set(socket.username, socket.id);
  
  if (mongoose.connection.readyState === 1 && User) {
    emitUsers();
  } else {
    // Отправляем базовый список онлайн пользователей
    const onlineUsers = Array.from(online.keys()).map(u => ({
      username: u,
      online: true
    }));
    socket.emit("users", onlineUsers);
    socket.broadcast.emit("users", onlineUsers);
  }

  socket.on("join", () => {
    if (mongoose.connection.readyState === 1 && User) {
      emitUsers();
    }
  });

  /* MESSAGE */
  socket.on("send_message", async (data) => {
    try {
      if (!Message) {
        socket.emit("error", "Database not ready");
        return;
      }
      
      console.log(`📨 Message from ${socket.username} to ${data.to}: ${data.message}`);

      const msg = await Message.create({
        from: socket.username,
        to: data.to,
        message: data.message,
        status: "sent"
      });

      const full = await Message.findById(msg._id);
      console.log(`✅ Message saved: ${full._id}`);

      send(data.to, "new_message", full);
      socket.emit("new_message", full);
    } catch (err) {
      console.error("Send message error:", err);
      socket.emit("error", "Failed to send message");
    }
  });

  /* HISTORY */
  socket.on("get_history", async (user) => {
    try {
      if (!Message) {
        socket.emit("chat_history", []);
        return;
      }
      
      console.log(`📜 Getting history between ${socket.username} and ${user}`);

      const msgs = await Message.find({
        $or: [
          { from: socket.username, to: user },
          { from: user, to: socket.username }
        ]
      }).sort({ createdAt: 1 });

      socket.emit("chat_history", msgs);
    } catch (err) {
      console.error("Get history error:", err);
      socket.emit("chat_history", []);
    }
  });

  /* READ */
  socket.on("read", async (data) => {
    try {
      if (!Message) return;
      
      console.log(`👁️ Marking as read: from ${data.from} to ${data.to}`);

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

        send(data.from, "read_update", {
          messages: msgs.map(m => m._id.toString())
        });
      }
    } catch (err) {
      console.error("Read error:", err);
    }
  });

  /* TYPING */
  socket.on("typing", (to) => {
    send(to, "typing", { from: socket.username });
  });

  socket.on("stop_typing", (to) => {
    send(to, "stop_typing", { from: socket.username });
  });

  socket.on("disconnect", () => {
    console.log(`❌ User disconnected: ${socket.username}`);
    online.delete(socket.username);
    if (mongoose.connection.readyState === 1 && User) {
      emitUsers();
    } else {
      const onlineUsers = Array.from(online.keys()).map(u => ({
        username: u,
        online: true
      }));
      io.emit("users", onlineUsers);
    }
  });
});

/* EMIT USERS */
async function emitUsers() {
  try {
    if (!User) return;
    
    const users = await User.find({}, "username avatar");
    
    io.emit("users", users.map(u => ({
      username: u.username,
      avatar: u.avatar,
      online: online.has(u.username)
    })));
  } catch (err) {
    console.error("Emit users error:", err);
  }
}

/* SEND */
function send(user, event, data) {
  const id = online.get(user);
  if (id) {
    io.to(id).emit(event, data);
    console.log(`📤 Sent ${event} to ${user}`);
  } else {
    console.log(`⚠️ User ${user} is offline`);
  }
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, '127.0.0.1', () => {
  console.log(`🚀 Server running on http://127.0.0.1:${PORT}`);
  console.log(`💚 Health check: http://127.0.0.1:${PORT}/health`);
});