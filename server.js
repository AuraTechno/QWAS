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

const online = new Map();

/* REGISTER */
app.post("/register", async (req, res) => {
    try {
        const { username, password } = req.body;

        const exists = await User.findOne({ username });
        if (exists) return res.json({ ok: false });

        const hash = await bcrypt.hash(password, 10);
        await User.create({ username, password: hash });

        res.json({ ok: true });
    } catch {
        res.json({ ok: false });
    }
});

/* LOGIN */
app.post("/login", async (req, res) => {
    try {
        const { username, password } = req.body;

        const user = await User.findOne({ username });
        if (!user) return res.json({ ok: false });

        const ok = await bcrypt.compare(password, user.password);
        if (!ok) return res.json({ ok: false });

        const token = jwt.sign(
            { username },
            config.JWT_SECRET,
            { expiresIn: "7d" }
        );

        res.json({ ok: true, token });
    } catch {
        res.json({ ok: false });
    }
});

/* SOCKET AUTH */
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

    online.set(socket.username, socket.id);
    emitUsers();

    socket.on("join", () => emitUsers());

    /* SEND MESSAGE */
    socket.on("private_message", async (data) => {

        const msg = await Message.create({
            from: socket.username,
            to: data.to,
            message: data.message,
            status: "sent"
        });

        send(data.to, "new_message", msg);
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

    /* READ RECEIPT */
    socket.on("read", async (data) => {

        const msgs = await Message.find({
            from: data.from,
            to: data.to,
            status: { $ne: "read" }
        });

        await Message.updateMany(
            { from: data.from, to: data.to },
            { $set: { status: "read" } }
        );

        send(data.from, "read_update", {
            messages: msgs.map(m => m._id)
        });
    });

    /* TYPING */
    socket.on("typing", (to) => {
        send(to, "typing", { from: socket.username });

        clearTimeout(socket.typingTimer);
        socket.typingTimer = setTimeout(() => {
            send(to, "stop_typing", {});
        }, 500);
    });

    socket.on("disconnect", () => {
        online.delete(socket.username);
        emitUsers();
    });

});

/* USERS */
async function emitUsers() {
    const users = await User.find({}, "username avatar");

    io.emit("users", users.map(u => ({
        username: u.username,
        avatar: u.avatar || "",
        online: online.has(u.username)
    })));
}

/* SEND */
function send(user, event, data) {
    const id = online.get(user);
    if (id) io.to(id).emit(event, data);
}

server.listen(3000, () => console.log("RUNNING"));