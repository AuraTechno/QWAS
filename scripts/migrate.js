const path = require("path");
const fs = require("fs");
const db = require("../db/pg");
const logger = require("../utils/logger");

const MIGRATIONS_DIR = path.join(__dirname, "..", "db", "migrations");

async function ensureMigrationsTable() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id SERIAL PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function appliedMigrations() {
  const res = await db.query("SELECT name FROM _migrations ORDER BY id");
  return new Set(res.rows.map(r => r.name));
}

async function runMigrations() {
  await ensureMigrationsTable();
  const applied = await appliedMigrations();
  const files = fs.readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith(".sql"))
    .sort();

  for (const file of files) {
    if (applied.has(file)) {
      logger.info(`Migration already applied: ${file}`);
      continue;
    }
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
    logger.info(`Applying migration: ${file}`);
    try {
      await db.withTransaction(async (client) => {
        await client.query(sql);
        await client.query("INSERT INTO _migrations (name) VALUES ($1)", [file]);
      });
      logger.info(`Migration applied: ${file}`);
    } catch (err) {
      logger.error(`Migration failed: ${file} — ${err.message}`);
      throw err;
    }
  }
}

async function reset() {
  await db.query(`
    DROP SCHEMA public CASCADE;
    CREATE SCHEMA public;
    GRANT ALL ON SCHEMA public TO PUBLIC;
  `);
  logger.warn("Database schema dropped. Re-running migrations...");
  await runMigrations();
}

async function status() {
  await ensureMigrationsTable();
  const applied = await appliedMigrations();
  const files = fs.readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith(".sql"))
    .sort();
  console.log("\nMigrations status:");
  for (const file of files) {
    console.log(`  ${applied.has(file) ? "[x]" : "[ ]"} ${file}`);
  }
  console.log("");
}

if (require.main === module) {
  const cmd = process.argv[2] || "up";
  (async () => {
    try {
      if (cmd === "status") {
        await status();
      } else if (cmd === "reset") {
        await reset();
      } else {
        await runMigrations();
      }
      process.exit(0);
    } catch (err) {
      logger.error("Migration script failed: " + err.message);
      process.exit(1);
    }
  })();
}

module.exports = { runMigrations, reset, status };
