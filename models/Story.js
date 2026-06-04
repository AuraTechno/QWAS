const mongoose = require("mongoose");

const StorySchema = new mongoose.Schema({
  author: { type: String, required: true, index: true },
  type: { type: String, enum: ["text", "image", "video"], default: "text" },
  content: { type: String, default: "" },
  mediaUrl: { type: String, default: "" },
  backgroundColor: { type: String, default: "#5e8ee7" },
  views: [{ type: String }],
  createdAt: { type: Date, default: Date.now, expires: 86400 }
});

StorySchema.index({ author: 1, createdAt: -1 });

module.exports = mongoose.model("Story", StorySchema);
