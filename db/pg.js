const { Pool } = require("pg");
const config = require("../config");
const logger = require("../utils/logger");

// Единый пул для всех запросов
const pool = new Pool({
  host: config.PGHOST,
  port: config.PGPORT,
  user: config.PGUSER,
  password: config.PGPASSWORD,
  database: config.PGDATABASE,
  max: config.PG_POOL_MAX,
  min: config.PG_POOL_MIN,
  idleTimeoutMillis: config.PG_POOL_IDLE_MS,
  connectionTimeoutMillis: 5000,
  statement_timeout: 15000,
  query_timeout: 15000,
  // ВАЖНО: используем BIGINT как строку чтобы не терять точность в JS
  // при работе с BIGSERIAL id. В коде репозиториев конвертим вручную где нужно.
});

pool.on("error", (err) => {
  logger.error("PostgreSQL pool error: " + err.message);
});

pool.on("connect", (client) => {
  client.query("SET TIME ZONE 'UTC'").catch(() => {});
});

/**
 * Выполнить запрос с параметрами.
 * Возвращает { rows, rowCount }.
 */
async function query(text, params) {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    if (Date.now() - start > 500) {
      logger.warn(`Slow query (${Date.now() - start}ms): ${text.slice(0, 100)}`);
    }
    return res;
  } catch (err) {
    logger.error(`Query error: ${err.message} | ${text.slice(0, 200)}`);
    throw err;
  }
}

/**
 * Получить клиент из пула для транзакции.
 * Использование:
 *   const client = await getClient();
 *   try { await client.query('BEGIN'); ... await client.query('COMMIT'); }
 *   finally { client.release(); }
 */
async function getClient() {
  return pool.connect();
}

/**
 * Запустить функцию в транзакции.
 */
async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    try { await client.query("ROLLBACK"); } catch {}
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Конвертирует BIGINT (строку) в Number.
 * Безопасно до 2^53 - 1.
 */
function bigintToNum(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return v;
  const n = Number(v);
  return Number.isSafeInteger(n) ? n : v;
}

/**
 * Подключиться и проверить соединение.
 */
async function ping() {
  const res = await query("SELECT 1 AS ok, NOW() AS ts, version() AS v");
  return res.rows[0];
}

async function close() {
  await pool.end();
}

module.exports = {
  pool,
  query,
  getClient,
  withTransaction,
  bigintToNum,
  ping,
  close
};
