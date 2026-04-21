const mongoose = require("mongoose");

const MessageSchema = new mongoose.Schema({
    from: String,
    to: String,
    message: String,
    time: { type: Date, default: Date.now },
    status: { type: String, default: "sent" }
});

module.exports = mongoose.model("Message", MessageSchema);