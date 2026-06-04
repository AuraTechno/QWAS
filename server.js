require("dotenv").config();

const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const mongoose = require("mongoose");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const compression = require("compression");
const morgan = require("morgan");

const config = require("./config");
const logger = require("./utils/logger");
const socketAuth = require("./socket/auth");
const { setupSocketHandlers } = require("./socket/handlers");

const MONGO_URL = process.env.MONGO_URL || config.MONGO_URL;

const app = express();
const server = http.createServer(app);

const allowedOrigin = process.env.CORS_ORIGIN || "*";

const io = new Server(server, {
  cors: { origin: allowedOrigin, methods: ["GET", "POST"] },
  pingTimeout: 60000,
  maxHttpBufferSize: 5e7
});

app.set("trust proxy", 1);
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));
app.use(compression());
app.use(express.json({ limit: "60mb" }));
app.use(express.urlencoded({ extended: true, limit: "60mb" }));
app.use(morgan("tiny"));
app.use(express.static("public", {
  maxAge: "1h",
  setHeaders: (res, path) => {
    if (path.endsWith(".html")) res.setHeader("Cache-Control", "no-cache");
  }
}));
app.use("/uploads", express.static("uploads", {
  maxAge: "7d",
  etag: true,
  lastModified: true,
  acceptRanges: true,
  setHeaders: (res, filePath) => {
    res.setHeader("Cache-Control", "public, max-age=604800, immutable");
    if (filePath.match(/\.(webm|mp4|m4a|mov)$/i)) {
      res.setHeader("Accept-Ranges", "bytes");
    }
  }
}));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: { ok: false, error: "Слишком много запросов" }
});
app.use("/login", limiter);
app.use("/register", limiter);

const online = new Map();
app.set("onlineUsers", online);

app.get("/health", (req, res) => {
  const mongoStatus = mongoose.connection.readyState;
  const statusMap = { 0: "disconnected", 1: "connected", 2: "connecting", 3: "disconnecting" };
  res.json({
    status: "ok",
    mongodb: statusMap[mongoStatus] || "unknown",
    online_users: online.size,
    uptime: process.uptime()
  });
});

app.use("/", require("./routes/auth"));
app.use("/profile", require("./routes/profile"));
app.use("/chats", require("./routes/chats"));
app.use("/groups", require("./routes/groups"));
app.use("/stories", require("./routes/stories"));
app.use("/folders", require("./routes/folders"));
app.use("/upload", require("./routes/upload"));

app.use((err, req, res, next) => {
  console.error("Express error:", err);
  res.status(err.status || 500).json({ ok: false, error: err.message || "Server error" });
});

logger.info("Подключение к MongoDB...");
mongoose.set("strictQuery", false);

mongoose.connect(MONGO_URL)
  .then(() => {
    logger.info("MongoDB подключена!");
    const User = require("./models/User");
    const Message = require("./models/Message");
    require("./models/Group");
    require("./models/Notification");
    require("./models/Folder");
    require("./models/Story");
    logger.info("Модели загружены");

    User.syncIndexes().catch(() => {});
    Message.syncIndexes().catch(() => {});
  })
  .catch(err => {
    logger.error("Ошибка подключения к MongoDB: " + err.message);
  });

const attachHandlers = () => {
  io.use(socketAuth);
  io.on("connection", async (socket) => {
    logger.info(`${socket.username} подключился`);
    online.set(socket.username, socket.id);

    socket.paginationState = {
      currentChat: null,
      page: 1,
      hasMore: true,
      isLoading: false
    };

    setupSocketHandlers(io, socket, online);
  });
};

if (mongoose.connection.readyState === 1) {
  attachHandlers();
} else {
  mongoose.connection.once("connected", attachHandlers);
}

app.set("io", io);

const PORT = process.env.PORT || 3000;
server.listen(PORT, "0.0.0.0", () => {
  logger.info(`Сервер запущен на порту ${PORT}`);
});

process.on("unhandledRejection", (err) => {
  console.error("UNHANDLED REJECTION:", err);
});
process.on("uncaughtException", (err) => {
  console.error("UNCAUGHT EXCEPTION:", err);
});
