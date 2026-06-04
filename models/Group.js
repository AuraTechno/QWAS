const mongoose = require("mongoose");

const MemberSchema = new mongoose.Schema({
  username: { type: String, required: true },
  role: { type: String, enum: ["creator", "admin", "member"], default: "member" },
  joinedAt: { type: Date, default: Date.now }
}, { _id: false });

const GroupSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 100 },
  avatar: { type: String, default: "" },
  avatarColor: { type: String, default: "#6366f1" },
  description: { type: String, default: "", maxlength: 500 },
  type: { type: String, enum: ["group", "channel"], default: "group" },
  members: [MemberSchema],
  createdBy: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});

GroupSchema.index({ "members.username": 1 });
GroupSchema.index({ createdBy: 1 });

module.exports = mongoose.model("Group", GroupSchema);
