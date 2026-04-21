const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema({
    username: String,
    password: String,
    avatar: { type: String, default: "" },
    lastSeen: { type: Number, default: Date.now }
});

module.exports = mongoose.model("User", UserSchema);