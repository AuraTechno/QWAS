const mongoose = require("mongoose");

const MessageSchema = new mongoose.Schema({
  from: { type: String, required: true },
  to: { type: String, required: true },
  message: { type: String, required: true },
  status: { type: String, default: "sent" },
  edited: { type: Boolean, default: false },
  isForwarded: { type: Boolean, default: false },
  forwardedFrom: { type: String, default: null },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Message", MessageSchema);