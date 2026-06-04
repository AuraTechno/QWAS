require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const mongoose = require("mongoose");
const { ensureAllIndexes } = require("../db/indexes");
const logger = require("../utils/logger");

const MONGO_URL = process.env.MONGO_URL || "mongodb://127.0.0.1:27017/messenger";

(async () => {
  try {
    await mongoose.connect(MONGO_URL);
    logger.info("Connected. Syncing indexes...");
    const results = await ensureAllIndexes();
    for (const [model, count] of Object.entries(results)) {
      logger.info(`  ${model}: ${count} indexes`);
    }
    await mongoose.disconnect();
    logger.info("Done.");
    process.exit(0);
  } catch (e) {
    console.error("Index sync failed:", e);
    process.exit(1);
  }
})();
