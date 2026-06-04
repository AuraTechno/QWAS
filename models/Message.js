const mongoose = require("mongoose");

const AttachmentSchema = new mongoose.Schema({
  type: { type: String, enum: ["image", "file", "audio", "video", "voice", "round"], default: "file" },
  url: { type: String, required: true },
  name: { type: String, default: "" },
  size: { type: Number, default: 0 },
  duration: { type: Number, default: 0 },
  width: { type: Number, default: 0 },
  height: { type: Number, default: 0 },
  thumbnail: { type: String, default: "" },
  waveform: { type: [Number], default: [] }
}, { _id: false });

const ReactionSchema = new mongoose.Schema({
  emoji: { type: String, required: true },
  users: [{ type: String }]
}, { _id: false });

const MessageSchema = new mongoose.Schema({
  from: { type: String, required: true, index: true },
  to: { type: String, required: true, index: true },
  conversationId: { type: String, required: true, index: true },
  type: { type: String, enum: ["dm", "group", "favorites"], default: "dm" },
  message: { type: String, default: "" },
  attachments: [AttachmentSchema],

  replyTo: { type: mongoose.Schema.Types.ObjectId, ref: "Message", default: null },
  replyToSnapshot: {
    from: String, message: String, attachments: [AttachmentSchema]
  },

  status: { type: String, enum: ["sent", "delivered", "read"], default: "sent" },
  edited: { type: Boolean, default: false },
  editHistory: [{ message: String, editedAt: Date }],

  isForwarded: { type: Boolean, default: false },
  forwardedFrom: { type: String, default: null },
  forwardChain: [{ from: String, messageId: mongoose.Schema.Types.ObjectId }],

  reactions: [ReactionSchema],

  isPinned: { type: Boolean, default: false },
  pinnedBy: { type: String, default: null },
  pinnedAt: { type: Date, default: null },

  mentions: [{ type: String }],

  deliveredTo: [{ type: String }],
  readBy: [{ type: String }],

  createdAt: { type: Date, default: Date.now, index: true }
});

MessageSchema.index({ conversationId: 1, createdAt: -1 });
MessageSchema.index({ conversationId: 1, status: 1 });
MessageSchema.index({ from: 1, to: 1, createdAt: -1 });
MessageSchema.index({ to: 1, from: 1, createdAt: -1 });
MessageSchema.index({ to: 1, status: 1 });
MessageSchema.index({ to: 1, createdAt: -1 });
MessageSchema.index({ from: 1, to: 1, status: 1, createdAt: -1 });
MessageSchema.index({ "mentions": 1, conversationId: 1 });
MessageSchema.index(
  { message: "text", "attachments.name": "text" },
  { default_language: "russian", name: "message_text_idx" }
);

module.exports = mongoose.model("Message", MessageSchema);
