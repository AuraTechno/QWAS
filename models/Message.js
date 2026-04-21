const mongoose = require("mongoose");

const MessageSchema = new mongoose.Schema({
    from: String,
    to: String,
    message: String, // encrypted
    status: { type: String, default: "sent" },
    time: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Message", MessageSchema);