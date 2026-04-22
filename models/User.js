
const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  avatar: { type: String, default: "" },
  avatarColor: { type: String, default: "#667eea" },
  createdAt: { type: Date, default: Date.now }
});

// Виртуальное поле для отображения с @
UserSchema.virtual('displayName').get(function() {
  return '@' + this.username;
});

module.exports = mongoose.model("User", UserSchema);
