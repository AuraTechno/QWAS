const mongoose = require("mongoose");

async function ensureAllIndexes() {
  const models = [
    "User", "Message", "Group", "Notification", "Story", "Folder", "Chat"
  ];
  const results = {};
  for (const name of models) {
    try {
      const Model = mongoose.models[name] || mongoose.model(name);
      await Model.syncIndexes();
      const idx = await Model.collection.indexes();
      results[name] = idx.length;
    } catch (e) {
      results[name] = "error: " + e.message;
    }
  }
  return results;
}

module.exports = { ensureAllIndexes };
