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

/* USERS ONLINE */
let online = {};

/* REGISTER */
app.post("/register", async (req, res) => {
    const { username, password } = req.body;

    const exists = await User.findOne({ username });
    if (exists) return res.json({ ok: false });

    const hash = await bcrypt.hash(password, 10);
    await User.create({ username, password: hash });

    res.json({ ok: true });
});

/* LOGIN */
app.post("/login", async (req, res) => {
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

    online[socket.username] = true;

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
            status: "sent"
        });

        emitToUser(data.to, "private_message", msg);
        socket.emit("private_message", msg);
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

        emitToUser(data.from, "read_update", {
            from: data.from
        });
    });

    /* TYPING */
    socket.on("typing", (to) => {
        emitToUser(to, "typing", { from: socket.username });

        clearTimeout(socket.typingTimer);

        socket.typingTimer = setTimeout(() => {
            emitToUser(to, "stop_typing", { from: socket.username });
        }, 600);
    });

    socket.on("disconnect", () => {
        delete online[socket.username];
        emitUsers();
    });

});

/* USERS */
async function emitUsers() {
    const users = await User.find({}, "username");

    io.emit("users", users.map(u => ({
        username: u.username,
        online: !!online[u.username]
    })));
}

/* SEND TO USER */
function emitToUser(username, event, data) {
    for (let id in io.sockets.sockets) {
        const s = io.sockets.sockets.get(id);
        if (s?.username === username) {
            s.emit(event, data);
        }
    }
}

server.listen(3000, () => {
    console.log("SERVER RUNNING");
});