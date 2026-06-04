const mongoose = require("mongoose");

const NotificationSchema = new mongoose.Schema({
  user: { type: String, required: true, index: true },
  type: { type: String, enum: ["message", "mention", "reaction", "group"], default: "message" },
  from: { type: String, default: "" },
  chatId: { type: String, required: true },
  messageId: { type: mongoose.Schema.Types.ObjectId, ref: "Message" },
  preview: { type: String, default: "" },
  read: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now, index: true }
});

NotificationSchema.index({ user: 1, createdAt: -1 });
NotificationSchema.index({ user: 1, read: 1, createdAt: -1 });
NotificationSchema.index({ user: 1, chatId: 1, read: 1 });

module.exports = mongoose.model("Notification", NotificationSchema);
