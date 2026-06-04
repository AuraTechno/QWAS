require("dotenv").config();
require("express-async-errors");

const express = require("express");
const http = require("http");
const path = require("path");
const fs = require("fs");
const { Server } = require("socket.io");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const compression = require("compression");
const morgan = require("morgan");

const config = require("./config");
const logger = require("./utils/logger");
const db = require("./db/pg");
const { runMigrations } = require("./scripts/migrate");
const socketAuth = require("./socket/auth");
const { setupSocketHandlers } = require("./socket/handlers");

const app = express();
const server = http.createServer(app);
const online = new Map();
app.set("onlineUsers", online);

const allowedOrigin = config.CORS_ORIGIN;

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
  setHeaders: (res, p) => {
    if (p.endsWith(".html")) res.setHeader("Cache-Control", "no-cache");
    if (p.endsWith(".webmanifest")) res.setHeader("Cache-Control", "public, max-age=86400");
  }
}));

app.use("/uploads", express.static(config.UPLOAD_DIR, {
  maxAge: "30d",
  etag: true,
  lastModified: true,
  acceptRanges: true,
  setHeaders: (res, p) => {
    res.setHeader("Cache-Control", "public, max-age=2592000, immutable");
    res.setHeader("Access-Control-Allow-Origin", "*");
    if (p.match(/\.(webm|mp4|m4a|mov)$/i)) {
      res.setHeader("Accept-Ranges", "bytes");
    }
  }
}));

// Rate limit
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: { ok: false, error: "Слишком много запросов" }
});
app.use("/login", limiter);
app.use("/register", limiter);

// Health
app.get("/health", async (req, res) => {
  try {
    const r = await db.query("SELECT 1 AS ok");
    res.json({
      status: "ok",
      db: "ok",
      online_users: online.size,
      uptime: process.uptime(),
      memory: process.memoryUsage()
    });
  } catch (err) {
    res.status(503).json({ status: "degraded", db: "down", error: err.message });
  }
});

// Routes
app.use("/", require("./routes/auth"));
app.use("/profile", require("./routes/profile"));
app.use("/chats", require("./routes/chats"));
app.use("/groups", require("./routes/groups"));
app.use("/stories", require("./routes/stories"));
app.use("/folders", require("./routes/folders"));
app.use("/upload", require("./routes/upload"));
app.use("/search", require("./routes/search"));
app.use("/notifications", require("./routes/notifications"));

// Error handler
app.use((err, req, res, next) => {
  logger.error("Express error: " + err.stack);
  res.status(err.status || 500).json({ ok: false, error: err.message || "Server error" });
});

// Bootstrap
async function bootstrap() {
  // Проверяем подключение к БД
  try {
    const info = await db.ping();
    logger.info("PostgreSQL connected: " + info.v);
  } catch (err) {
    logger.error("PostgreSQL connection failed: " + err.message);
    process.exit(1);
  }

  // Миграции
  if (process.env.AUTO_MIGRATE !== "false") {
    try {
      await runMigrations();
    } catch (err) {
      logger.error("Migrations failed: " + err.message);
      process.exit(1);
    }
  }

  // WebSocket
  io.use(socketAuth);
  io.on("connection", async (socket) => {
    try {
      await setupSocketHandlers(io, socket, online);
    } catch (err) {
      logger.error("WS setup error: " + err.message);
      socket.disconnect(true);
    }
  });

  app.set("io", io);

  server.listen(config.PORT, config.HOST, () => {
    logger.info(`QWAS Messenger running on http://${config.HOST}:${config.PORT}`);
    logger.info(`Environment: ${config.NODE_ENV}`);
  });
}

process.on("unhandledRejection", (err) => {
  logger.error("UNHANDLED REJECTION: " + (err?.stack || err));
});
process.on("uncaughtException", (err) => {
  logger.error("UNCAUGHT EXCEPTION: " + (err?.stack || err));
  process.exit(1);
});

bootstrap();
