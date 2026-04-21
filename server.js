const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const config = require("./config");

const User = require("./models/User");
const Message = require("./models/Message");

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

// Добавим обработку ошибок подключения к MongoDB
mongoose.connect(config.MONGO_URL, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => {
  console.log("✅ MongoDB connected");
}).catch(err => {
  console.error("❌ MongoDB connection error:", err);
});

/* ONLINE USERS */
const online = new Map();

/* REGISTER */
app.post("/register", async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.json({ ok: false, error: "Username and password required" });
    }

    const exists = await User.findOne({ username });
    if (exists) return res.json({ ok: false, error: "User exists" });

    const hash = await bcrypt.hash(password, 10);
    await User.create({ username, password: hash });

    res.json({ ok: true });
  } catch (err) {
    console.error("Register error:", err);
    res.json({ ok: false, error: "Server error" });
  }
});

/* LOGIN */
app.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    const user = await User.findOne({ username });
    if (!user) return res.json({ ok: false, error: "User not found" });

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.json({ ok: false, error: "Wrong password" });

    const token = jwt.sign({ username }, config.JWT_SECRET);
    res.json({ ok: true, token });
  } catch (err) {
    console.error("Login error:", err);
    res.json({ ok: false, error: "Server error" });
  }
});

// Health check endpoint для nginx
app.get("/health", (req, res) => {
  res.json({ status: "ok", mongodb: mongoose.connection.readyState === 1 });
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
  emitUsers();

  socket.on("join", () => {
    emitUsers();
  });

  /* MESSAGE */
  socket.on("send_message", async (data) => {
    try {
      console.log(`📨 Message from ${socket.username} to ${data.to}: ${data.message}`);

      const msg = await Message.create({
        from: socket.username,
        to: data.to,
        message: data.message,
        status: "sent"
      });

      const full = await Message.findById(msg._id);
      console.log(`✅ Message saved: ${full._id}`);

      // Отправляем получателю
      send(data.to, "new_message", full);
      // Отправляем отправителю для отображения
      socket.emit("new_message", full);
    } catch (err) {
      console.error("Send message error:", err);
    }
  });

  /* HISTORY */
  socket.on("get_history", async (user) => {
    try {
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
    }
  });

  /* READ */
  socket.on("read", async (data) => {
    try {
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
    emitUsers();
  });
});

/* EMIT USERS */
async function emitUsers() {
  try {
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
    console.log(`⚠️ User ${user} is offline, message saved in DB`);
  }
}

// Используем PORT из переменной окружения или 3000
const PORT = process.env.PORT || 3000;
server.listen(PORT, '127.0.0.1', () => {
  console.log(`🚀 Server running on http://127.0.0.1:${PORT}`);
});