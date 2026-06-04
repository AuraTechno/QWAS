const mongoose = require("mongoose");

const AttachmentSchema = new mongoose.Schema({
  type: { type: String, enum: ["image", "file", "audio"], default: "file" },
  url: { type: String, required: true },
  name: { type: String, default: "" },
  size: { type: Number, default: 0 }
}, { _id: false });

const MessageSchema = new mongoose.Schema({
  from: { type: String, required: true },
  to: { type: String, required: true },
  message: { type: String, default: "" },
  attachments: [AttachmentSchema],
  status: { type: String, default: "sent" },
  edited: { type: Boolean, default: false },
  isForwarded: { type: Boolean, default: false },
  forwardedFrom: { type: String, default: null },
  createdAt: { type: Date, default: Date.now }
});

MessageSchema.index({ from: 1, to: 1, createdAt: -1 });
MessageSchema.index({ createdAt: -1 });
MessageSchema.index({ to: 1, status: 1 });

module.exports = mongoose.model("Message", MessageSchema);
