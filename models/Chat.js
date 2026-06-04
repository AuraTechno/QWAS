const mongoose = require("mongoose");

const ChatSchema = new mongoose.Schema({
  owner: { type: String, required: true, index: true },
  chatId: { type: String, required: true },
  type: { type: String, enum: ["dm", "group", "favorites"], default: "dm" },
  otherUser: { type: String, default: null },
  groupId: { type: mongoose.Schema.Types.ObjectId, default: null },

  lastMessageId: { type: mongoose.Schema.Types.ObjectId, default: null, ref: "Message" },
  lastMessageFrom: { type: String, default: null },
  lastMessageText: { type: String, default: "" },
  lastMessageHasAttachment: { type: Boolean, default: false },
  lastMessageType: { type: String, default: "" },
  lastMessageAt: { type: Date, default: null, index: true },

  unreadCount: { type: Number, default: 0, index: true },
  archived: { type: Boolean, default: false },
  pinned: { type: Boolean, default: false },
  pinOrder: { type: Number, default: 0 },
  muted: { type: Boolean, default: false },
  mutedUntil: { type: Date, default: null },

  createdAt: { type: Date, default: Date.now }
});

ChatSchema.index({ owner: 1, chatId: 1 }, { unique: true });
ChatSchema.index({ owner: 1, archived: 1, pinned: -1, lastMessageAt: -1 });
ChatSchema.index({ owner: 1, lastMessageAt: -1 });

ChatSchema.statics.buildChatId = function (owner, other) {
  return [owner, other].sort().join(":");
};

module.exports = mongoose.model("Chat", ChatSchema);
