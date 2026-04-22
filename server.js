
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
    
    const { username, password } = req.body;
    if (!username || !password) return res.json({ ok: false, error: "Username and password required" });

    const exists = await User.findOne({ username });
    if (exists) return res.json({ ok: false, error: "User exists" });

    const hash = await bcrypt.hash(password, 10);
    
    // Создаем пользователя с дефолтным цветом аватарки
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
    
    const { username, password } = req.body;
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
    
    // Оповещаем всех об обновлении аватарки
    emitUsers();
    
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

io.on("connection", (socket) => {
  console.log(`✅ User connected: ${socket.username}`);

  online.set(socket.username, socket.id);
  
  if (mongoose.connection.readyState === 1 && User) {
    emitUsers();
  } else {
    const onlineUsers = Array.from(online.keys()).map(u => ({ username: u, online: true }));
    socket.emit("users", onlineUsers);
    socket.broadcast.emit("users", onlineUsers);
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
  
  socket.on("profile_updated", () => emitUsers());

  socket.on("disconnect", () => {
    console.log(`❌ User disconnected: ${socket.username}`);
    online.delete(socket.username);
    if (mongoose.connection.readyState === 1 && User) emitUsers();
  });
});

async function emitUsers() {
  try {
    if (!User) return;
    const users = await User.find({}, "username avatar avatarColor");
    
    io.emit("users", users.map(u => ({
      username: u.username,
      avatar: u.avatar || "",
      avatarColor: u.avatarColor || "#667eea",
      online: online.has(u.username)
    })));
  } catch (err) {
    console.error("Emit users error:", err);
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
