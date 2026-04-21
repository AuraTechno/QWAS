const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(__dirname));

let users = {}; // socket.id -> username

io.on("connection", (socket) => {

    socket.on("join", (username) => {
        users[socket.id] = username;

        // отправляем список пользователей всем
        io.emit("users", Object.values(users));
    });

    socket.on("private_message", (data) => {
        const { to, message } = data;

        // ищем получателя
        for (let id in users) {
            if (users[id] === to) {
                io.to(id).emit("private_message", {
                    from: users[socket.id],
                    message
                });
            }
        }
    });

    socket.on("disconnect", () => {
        delete users[socket.id];
        io.emit("users", Object.values(users));
    });

});

server.listen(3000, () => {
    console.log("Сервер запущен");
});