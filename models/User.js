
const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  avatar: { type: String, default: "" }, // храним base64 или URL аватарки
  avatarColor: { type: String, default: "#667eea" }, // цвет аватарки по умолчанию
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("User", UserSchema);
