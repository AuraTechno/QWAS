const mongoose = require("mongoose");

const MessageSchema = new mongoose.Schema({
    from: String,
    to: String,
    message: String,

    status: {
        type: String,
        default: "sent" // sent | read
    },

    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model("Message", MessageSchema);