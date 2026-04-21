const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.get("/", (req, res) => {
  res.sendFile(__dirname + "/index.html");
});

let users = {};
let typingUsers = {};

function formatUsername(name) {
  return "@" + name.toLowerCase().replace(/[^a-z]/g, "");
}

io.on("connection", (socket) => {
  console.log("connected:", socket.id);

  socket.on("register", (rawName) => {
    const username = formatUsername(rawName);

    users[socket.id] = {
      username,
      online: true
    };

    socket.username = username;

    io.emit("users update", users);
  });

  socket.on("chat message", (msg) => {
    const user = users[socket.id];
    if (!user) return;

    io.emit("chat message", {
      user: user.username,
      text: msg
    });
  });

  socket.on("typing", () => {
    if (users[socket.id]) {
      typingUsers[socket.id] = users[socket.id].username;
      io.emit("typing update", Object.values(typingUsers));
    }
  });

  socket.on("stop typing", () => {
    delete typingUsers[socket.id];
    io.emit("typing update", Object.values(typingUsers));
  });

  socket.on("disconnect", () => {
    delete typingUsers[socket.id];

    if (users[socket.id]) {
      users[socket.id].online = false;
      io.emit("users update", users);
      io.emit("typing update", Object.values(typingUsers));
      delete users[socket.id];
    }
  });
});

server.listen(3000, () => {
  console.log("http://localhost:3000");
});