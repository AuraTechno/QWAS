require("dotenv").config();
require("express-async-errors");

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
const cache = require("./db/cache");
const { ensureAllIndexes } = require("./db/indexes");
const socketAuth = require("./socket/auth");
const { setupSocketHandlers } = require("./socket/handlers");

const MONGO_URL = process.env.MONGO_URL || config.MONGO_URL;
const REDIS_URL = process.env.REDIS_URL || null;
const PORT = parseInt(process.env.PORT) || 3000;

const app = express();
const server = http.createServer(app);
const online = new Map();
app.set("onlineUsers", online);

const allowedOrigin = process.env.CORS_ORIGIN || "*";

const io = new Server(server, {
  cors: { origin: allowedOrigin, methods: ["GET", "POST"] },
  pingTimeout: 60000,
  pingInterval: 25000,
  maxHttpBufferSize: 5e7,
  perMessageDeflate: { threshold: 1024 },
  httpCompression: { threshold: 1024 }
});

app.set("trust proxy", 1);
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));
app.use(compression({
  level: 6,
  threshold: 1024,
  filter: (req, res) => {
    if (req.path.startsWith("/uploads/")) return false;
    return compression.filter(req, res);
  }
}));
app.use(express.json({ limit: "60mb" }));
app.use(express.urlencoded({ extended: true, limit: "60mb" }));
app.use(morgan("tiny"));

app.use(express.static("public", {
  maxAge: "1h",
  etag: true,
  lastModified: true,
  setHeaders: (res, path) => {
    if (path.endsWith(".html")) res.setHeader("Cache-Control", "no-cache");
    if (path.endsWith(".webmanifest")) res.setHeader("Cache-Control", "public, max-age=86400");
  }
}));

app.use("/uploads", express.static("uploads", {
  maxAge: "30d",
  etag: true,
  lastModified: true,
  acceptRanges: true,
  setHeaders: (res, filePath) => {
    res.setHeader("Cache-Control", "public, max-age=2592000, immutable");
    res.setHeader("Access-Control-Allow-Origin", "*");
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

app.get("/health", (req, res) => {
  const mongoStatus = mongoose.connection.readyState;
  const statusMap = { 0: "disconnected", 1: "connected", 2: "connecting", 3: "disconnecting" };
  res.json({
    status: "ok",
    mongodb: statusMap[mongoStatus] || "unknown",
    cache: cache.stats(),
    online_users: online.size,
    uptime: process.uptime(),
    memory: process.memoryUsage()
  });
});

app.use("/", require("./routes/auth"));
app.use("/profile", require("./routes/profile"));
app.use("/chats", require("./routes/chats"));
app.use("/groups", require("./routes/groups"));
app.use("/stories", require("./routes/stories"));
app.use("/folders", require("./routes/folders"));
app.use("/upload", require("./routes/upload"));
app.use("/search", require("./routes/search"));

app.use((err, req, res, next) => {
  console.error("Express error:", err);
  res.status(err.status || 500).json({ ok: false, error: err.message || "Server error" });
});

mongoose.set("strictQuery", false);

async function bootstrap() {
  logger.info("Подключение к MongoDB...");
  try {
    await mongoose.connect(MONGO_URL, {
      maxPoolSize: 20,
      minPoolSize: 5,
      socketTimeoutMS: 30000,
      connectTimeoutMS: 10000,
      serverSelectionTimeoutMS: 10000
    });
    logger.info("MongoDB подключена!");
  } catch (err) {
    logger.error("Ошибка подключения к MongoDB: " + err.message);
    process.exit(1);
  }

  try {
    require("./models/User");
    require("./models/Message");
    require("./models/Group");
    require("./models/Notification");
    require("./models/Folder");
    require("./models/Story");
    require("./models/Chat");
    const idxResults = await ensureAllIndexes();
    logger.info("Индексы: " + JSON.stringify(idxResults));
  } catch (e) {
    logger.error("Index sync error: " + e.message);
  }

  await cache.initRedis(REDIS_URL);
  logger.info("Кэш инициализирован: " + JSON.stringify(cache.stats()));

  try {
    const mod = require("@socket.io/redis-adapter");
    if (cache._redis && cache._redis.pub && cache._redis.sub) {
      io.adapter(mod.createAdapter(cache._redis.pub, cache._redis.sub));
      logger.info("Socket.io Redis adapter подключён");
    }
  } catch (e) {
    // optional adapter missing
  }

  attachHandlers();
}

function attachHandlers() {
  io.use(socketAuth);
  io.on("connection", async (socket) => {
    logger.info(`${socket.username} подключился`);
    online.set(socket.username, socket.id);

    socket.paginationState = {
      currentChat: null,
      page: 1,
      hasMore: true,
      isLoading: false,
      cursor: null
    };

    setupSocketHandlers(io, socket, online);
  });
}

app.set("io", io);

server.listen(PORT, "0.0.0.0", () => {
  logger.info(`Сервер запущен на порту ${PORT}`);
});

bootstrap().catch(err => {
  logger.error("Bootstrap failed: " + err.message);
});

process.on("unhandledRejection", (err) => {
  console.error("UNHANDLED REJECTION:", err);
});
process.on("uncaughtException", (err) => {
  console.error("UNCAUGHT EXCEPTION:", err);
});
