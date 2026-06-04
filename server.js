require("dotenv").config();

const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const mongoose = require("mongoose");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");

const config = require("./config");
const logger = require("./utils/logger");
const socketAuth = require("./socket/auth");
const { setupSocketHandlers } = require("./socket/handlers");

const MONGO_URL = process.env.MONGO_URL || config.MONGO_URL;

const app = express();
const server = http.createServer(app);

const allowedOrigin = process.env.CORS_ORIGIN || "*";

const io = new Server(server, {
  cors: { origin: allowedOrigin, methods: ["GET", "POST"] }
});

app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: "50mb" }));
app.use(express.static("public"));
app.use("/uploads", express.static("uploads"));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { ok: false, error: "Слишком много запросов" }
});
app.use("/login", limiter);
app.use("/register", limiter);

const online = new Map();
app.set("onlineUsers", online);

app.get("/health", (req, res) => {
  const mongoStatus = mongoose.connection.readyState;
  const statusMap = { 0: "disconnected", 1: "connected", 2: "connecting", 3: "disconnecting" };
  res.json({ status: "ok", mongodb: statusMap[mongoStatus] || "unknown", online_users: online.size });
});

app.use("/", require("./routes/auth"));
app.use("/profile", require("./routes/profile"));
app.use("/chats", require("./routes/chats"));
app.use("/groups", require("./routes/groups"));
app.use("/upload", require("./routes/upload"));

logger.info("Подключение к MongoDB...");
mongoose.set("strictQuery", false);

mongoose.connect(MONGO_URL)
  .then(() => {
    logger.info("MongoDB подключена!");
    require("./models/User");
    require("./models/Message");
    logger.info("Модели загружены");
  })
  .catch(err => {
    logger.error("Ошибка подключения к MongoDB: " + err.message);
  });

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

  if (mongoose.connection.readyState === 1) {
    setupSocketHandlers(io, socket, online);
  }
});

app.set("io", io);

const PORT = process.env.PORT || 3000;
server.listen(PORT, "0.0.0.0", () => {
  logger.info(`Сервер запущен на порту ${PORT}`);
});
