const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema({
    username: String,
    password: String,
    avatar: { type: String, default: "" }, // base64 или url
    lastSeen: { type: Number, default: Date.now }
});

module.exports = mongoose.model("User", UserSchema);