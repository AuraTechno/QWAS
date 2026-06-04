const mongoose = require("mongoose");

const MemberSchema = new mongoose.Schema({
  username: { type: String, required: true },
  role: { type: String, enum: ["creator", "admin", "member"], default: "member" },
  joinedAt: { type: Date, default: Date.now }
}, { _id: false });

const GroupSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 100 },
  avatar: { type: String, default: "" },
  avatarColor: { type: String, default: "#5e8ee7" },
  description: { type: String, default: "", maxlength: 500 },
  type: { type: String, enum: ["group", "channel", "supergroup"], default: "group" },
  isPublic: { type: Boolean, default: false },
  username: { type: String, default: "" },
  members: [MemberSchema],

  pinnedMessage: { type: mongoose.Schema.Types.ObjectId, ref: "Message", default: null },

  slowModeSeconds: { type: Number, default: 0 },
  permissions: {
    sendMessages: { type: Boolean, default: true },
    sendMedia: { type: Boolean, default: true }
  },

  createdBy: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});

GroupSchema.index({ "members.username": 1 });
GroupSchema.index({ "members.username": 1, lastMessageAt: -1 });
GroupSchema.index({ createdBy: 1 });
GroupSchema.index(
  { name: "text", description: "text", username: "text" },
  { default_language: "russian", name: "group_text_idx" }
);

GroupSchema.virtual("lastMessageAt").get(function () {
  return this._lastMessageAt || this.createdAt;
});
GroupSchema.set("toJSON", { virtuals: true });
GroupSchema.set("toObject", { virtuals: true });

module.exports = mongoose.model("Group", GroupSchema);
