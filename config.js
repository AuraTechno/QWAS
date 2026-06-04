const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });

module.exports = {
  PORT: parseInt(process.env.PORT) || 3000,
  NODE_ENV: process.env.NODE_ENV || "production",
  HOST: process.env.HOST || "0.0.0.0",

  // PostgreSQL
  PGHOST: process.env.PGHOST || "127.0.0.1",
  PGPORT: parseInt(process.env.PGPORT) || 5432,
  PGUSER: process.env.PGUSER || "qwas",
  PGPASSWORD: process.env.PGPASSWORD || "",
  PGDATABASE: process.env.PGDATABASE || "qwas",
  PG_POOL_MAX: parseInt(process.env.PG_POOL_MAX) || 20,
  PG_POOL_MIN: parseInt(process.env.PG_POOL_MIN) || 2,
  PG_POOL_IDLE_MS: parseInt(process.env.PG_POOL_IDLE_MS) || 30000,

  // Auth
  JWT_SECRET: process.env.JWT_SECRET || "change_me_in_production_please",
  JWT_TTL: process.env.JWT_TTL || "30d",
  BCRYPT_ROUNDS: parseInt(process.env.BCRYPT_ROUNDS) || 10,

  // Upload
  UPLOAD_DIR: process.env.UPLOAD_DIR || "uploads",
  CHUNK_DIR: process.env.CHUNK_DIR || "uploads/chunks",
  MAX_FILE_SIZE: parseInt(process.env.MAX_FILE_SIZE) || 50 * 1024 * 1024,
  MAX_CHUNK_SIZE: parseInt(process.env.MAX_CHUNK_SIZE) || 5 * 1024 * 1024,

  // Cache / pub-sub (optional)
  REDIS_URL: process.env.REDIS_URL || null,

  // Stories
  STORY_TTL_HOURS: parseInt(process.env.STORY_TTL_HOURS) || 24,

  // Pagination
  MESSAGES_PER_PAGE: parseInt(process.env.MESSAGES_PER_PAGE) || 30,
  CHATS_PER_PAGE: parseInt(process.env.CHATS_PER_PAGE) || 100,

  // WebRTC ICE
  ICE_SERVERS: (process.env.ICE_SERVERS || "stun:stun.l.google.com:19302,stun:stun1.l.google.com:19302")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean)
    .map(url => ({ urls: url })),

  // CORS
  CORS_ORIGIN: process.env.CORS_ORIGIN || "*"
};
