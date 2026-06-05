// Redis cache (optional). Falls back to in-memory if REDIS_URL not set.
const config = require("../config");
const logger = require("./logger");

let client = null;
let enabled = false;
const memStore = new Map();
const memExpiry = new Map();

async function init() {
  if (client) return client;
  if (!config.REDIS_URL) {
    logger.info("REDIS_URL not set, using in-memory cache");
    return null;
  }
  try {
    const Redis = require("ioredis");
    client = new Redis(config.REDIS_URL, {
      maxRetriesPerRequest: 2,
      enableOfflineQueue: false,
      lazyConnect: true,
      reconnectOnError: () => true
    });
    client.on("error", (err) => {
      if (enabled) logger.warn("Redis error:", err.message);
    });
    await client.connect();
    enabled = true;
    logger.info("Redis connected");
    return client;
  } catch (e) {
    logger.warn("Redis unavailable, falling back to memory:", e.message);
    client = null;
    return null;
  }
}

function get(key) {
  if (enabled && client) {
    return client.get(key).then((v) => (v ? safeParse(v) : null)).catch(() => null);
  }
  if (memExpiry.has(key) && memExpiry.get(key) < Date.now()) {
    memStore.delete(key);
    memExpiry.delete(key);
    return Promise.resolve(null);
  }
  const v = memStore.get(key);
  return Promise.resolve(v != null ? v : null);
}

function set(key, value, ttlSec = 60) {
  if (enabled && client) {
    const s = JSON.stringify(value);
    if (ttlSec > 0) return client.set(key, s, "EX", ttlSec).catch(() => {});
    return client.set(key, s).catch(() => {});
  }
  memStore.set(key, value);
  if (ttlSec > 0) memExpiry.set(key, Date.now() + ttlSec * 1000);
  return Promise.resolve();
}

function del(key) {
  if (enabled && client) return client.del(key).catch(() => 0);
  memStore.delete(key);
  memExpiry.delete(key);
  return Promise.resolve(0);
}

function delPattern(pattern) {
  if (enabled && client) {
    return client.keys(pattern).then((keys) => keys.length ? client.del(...keys) : 0).catch(() => 0);
  }
  const re = new RegExp("^" + pattern.replace(/\*/g, ".*") + "$");
  for (const k of memStore.keys()) {
    if (re.test(k)) { memStore.delete(k); memExpiry.delete(k); }
  }
  return Promise.resolve(0);
}

function wrap(key, ttlSec, fn) {
  return get(key).then((cached) => {
    if (cached !== null && cached !== undefined) return cached;
    return fn().then((fresh) => {
      if (fresh !== null && fresh !== undefined) set(key, fresh, ttlSec);
      return fresh;
    });
  });
}

function invalidateChat(chatId) {
  return delPattern(`chat:${chatId}:*`);
}

function invalidateUser(username) {
  return delPattern(`user:${username}:*`);
}

function safeParse(s) { try { return JSON.parse(s); } catch { return null; } }
function isEnabled() { return enabled; }

module.exports = { init, get, set, del, delPattern, wrap, invalidateChat, invalidateUser, isEnabled };
