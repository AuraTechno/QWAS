const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(express.static(__dirname));

/* ================= DATABASE ================= */

mongoose.connect("mongodb+srv://server:bRtteM2rqijlDTsd@qwas.ijvw0zw.mongodb.net/messenger");

const UserSchema = new mongoose.Schema({
    username: String,
    password: String
});

const MessageSchema = new mongoose.Schema({
    from: String,
    to: String,
    message: String,
    time: { type: Date, default: Date.now }
});

const User = mongoose.model("User", UserSchema);
const Message = mongoose.model("Message", MessageSchema);

/* ================= USERS ONLINE ================= */

let onlineUsers = {};

/* ================= AUTH API ================= */

// регистрация
app.post("/register", async (req, res) => {
    const { username, password } = req.body;

    let exists = await User.findOne({ username });
    if (exists) return res.json({ ok: false, msg: "Уже существует" });

    let hash = await bcrypt.hash(password, 10);

    await User.create({
        username,
        password: hash
    });

    res.json({ ok: true });
});

// вход
app.post("/login", async (req, res) => {
    const { username, password } = req.body;

    let user = await User.findOne({ username });
    if (!user) return res.json({ ok: false });

    let valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.json({ ok: false });

    res.json({ ok: true });
});

/* ================= SOCKET ================= */

io.on("connection", (socket) => {

    socket.on("join", (username) => {
        onlineUsers[socket.id] = username;
        io.emit("users", Object.values(onlineUsers));
    });

    socket.on("private_message", async (data) => {
        const from = onlineUsers[socket.id];
        const { to, message } = data;

        await Message.create({
            from,
            to,
            message
        });

        for (let id in onlineUsers) {
            if (onlineUsers[id] === to) {
                io.to(id).emit("private_message", {
                    from,
                    message
                });
            }
        }
    });

    socket.on("get_history", async (withUser) => {
        const user = onlineUsers[socket.id];

        const messages = await Message.find({
            $or: [
                { from: user, to: withUser },
                { from: withUser, to: user }
            ]
        });

        socket.emit("chat_history", messages);
    });

    socket.on("disconnect", () => {
        delete onlineUsers[socket.id];
        io.emit("users", Object.values(onlineUsers));
    });

});

server.listen(3000, () => {
    console.log("Server running");
});