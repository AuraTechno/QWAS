const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(__dirname));

let users = {}; // socket.id -> username
let messages = {}; // "user1_user2" -> [сообщения]

// функция для ключа диалога
function getChatKey(user1, user2) {
    return [user1, user2].sort().join("_");
}

io.on("connection", (socket) => {

    socket.on("join", (username) => {
        users[socket.id] = username;
        io.emit("users", Object.values(users));
    });

    socket.on("private_message", (data) => {
        const { to, message } = data;
        const from = users[socket.id];

        let key = getChatKey(from, to);

        if (!messages[key]) {
            messages[key] = [];
        }

        let msgObj = { from, message };
        messages[key].push(msgObj);

        // отправка получателю
        for (let id in users) {
            if (users[id] === to) {
                io.to(id).emit("private_message", msgObj);
            }
        }
    });

    // запрос истории
    socket.on("get_history", (withUser) => {
        const user = users[socket.id];
        let key = getChatKey(user, withUser);

        socket.emit("chat_history", messages[key] || []);
    });

    socket.on("disconnect", () => {
        delete users[socket.id];
        io.emit("users", Object.values(users));
    });

});

server.listen(3000, () => {
    console.log("Сервер запущен");
});