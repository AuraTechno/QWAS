const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const config = require("./config");

const User = require("./models/User");
const Message = require("./models/Message");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(express.static("public"));

mongoose.connect(config.MONGO_URL);

let onlineUsers = new Map();

/* AUTH */
io.use((socket, next) => {
    try {
        const token = socket.handshake.auth.token;
        const data = jwt.verify(token, config.JWT_SECRET);
        socket.username = data.username;
        next();
    } catch {
        next(new Error("auth"));
    }
});

io.on("connection", (socket) => {

    onlineUsers.set(socket.username, socket.id);

    emitUsers();

    /* JOIN */
    socket.on("join", () => {
        emitUsers();
    });

    /* MESSAGE */
    socket.on("private_message", async (data) => {

        const msg = await Message.create({
            from: socket.username,
            to: data.to,
            message: data.message,
            status: "sent",
            createdAt: Date.now()
        });

        sendToUser(data.to, "new_message", msg);
        socket.emit("new_message", msg);
    });

    /* HISTORY */
    socket.on("get_history", async (user) => {

        const msgs = await Message.find({
            $or: [
                { from: socket.username, to: user },
                { from: user, to: socket.username }
            ]
        }).sort({ createdAt: 1 });

        socket.emit("chat_history", msgs);
    });

    /* READ */
    socket.on("read", async (data) => {

        await Message.updateMany(
            { from: data.from, to: data.to },
            { $set: { status: "read" } }
        );

        sendToUser(data.from, "read_update", {
            from: data.from,
            to: data.to
        });
    });

    /* TYPING */
    socket.on("typing", (to) => {
        sendToUser(to, "typing", { from: socket.username });

        clearTimeout(socket.typingTimer);

        socket.typingTimer = setTimeout(() => {
            sendToUser(to, "stop_typing", { from: socket.username });
        }, 500);
    });

    socket.on("disconnect", () => {
        onlineUsers.delete(socket.username);
        emitUsers();
    });

});

/* USERS */
async function emitUsers() {

    const users = await User.find({}, "username");

    io.emit("users", users.map(u => ({
        username: u.username,
        online: onlineUsers.has(u.username)
    })));
}

/* SEND */
function sendToUser(username, event, data) {
    const socketId = onlineUsers.get(username);
    if (socketId) {
        io.to(socketId).emit(event, data);
    }
}

server.listen(3000, () => console.log("FINAL STABLE RUN"));