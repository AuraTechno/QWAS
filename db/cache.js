const { LRUCache } = require("lru-cache");

const lru = new LRUCache({
  max: 5000,
  ttl: 1000 * 30,
  ttlAutopurge: true,
  allowStale: true,
  updateAgeOnGet: false
});

const slowLru = new LRUCache({
  max: 1000,
  ttl: 1000 * 300,
  ttlAutopurge: true,
  allowStale: true
});

let redis = null;
let redisOk = false;

async function initRedis(url) {
  if (!url) return;
  try {
    const IORedis = require("ioredis");
    const pub = new IORedis(url, { lazyConnect: true, maxRetriesPerRequest: 1, enableOfflineQueue: false });
    const sub = new IORedis(url, { lazyConnect: true, maxRetriesPerRequest: 1, enableOfflineQueue: false });
    await pub.connect();
    await sub.connect();
    redis = { pub, sub };
    redisOk = true;
    console.log("[cache] Redis connected");
    const { Server } = require("socket.io");
  } catch (e) {
    console.log("[cache] Redis not available, using in-memory only:", e.message);
    redis = null;
    redisOk = false;
  }
}

function get(key) {
  return lru.get(key);
}

function set(key, value, ttlMs) {
  if (ttlMs) {
    lru.set(key, value, { ttl: ttlMs });
  } else {
    lru.set(key, value);
  }
  if (redisOk && redis) {
    redis.pub.set(`qwas:${key}`, JSON.stringify(value), "PX", ttlMs || 30000).catch(() => {});
  }
}

function del(key) {
  lru.delete(key);
  if (redisOk && redis) {
    redis.pub.del(`qwas:${key}`).catch(() => {});
  }
}

function delByPrefix(prefix) {
  for (const k of lru.keys()) {
    if (k.startsWith(prefix)) lru.delete(k);
  }
  if (redisOk && redis) {
    const pattern = `qwas:${prefix}*`;
    const stream = redis.pub.scanStream({ match: pattern, count: 200 });
    stream.on("data", (keys) => {
      if (keys.length) redis.pub.del(...keys).catch(() => {});
    });
    stream.on("error", () => {});
  }
}

async function getRemote(key) {
  if (!redisOk || !redis) return null;
  try {
    const v = await redis.pub.get(`qwas:${key}`);
    return v ? JSON.parse(v) : null;
  } catch {
    return null;
  }
}

function keysByPrefix(prefix) {
  const out = [];
  for (const k of lru.keys()) {
    if (k.startsWith(prefix)) out.push(k);
  }
  return out;
}

function stats() {
  return {
    lruSize: lru.size,
    lruMax: lru.max,
    redis: redisOk ? "connected" : "disabled"
  };
}

module.exports = {
  initRedis,
  get, set, del, delByPrefix, getRemote,
  slow: { get: (k) => slowLru.get(k), set: (k, v) => slowLru.set(k, v) },
  keysByPrefix,
  stats,
  get _redis() { return redis; }
};
