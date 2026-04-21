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

let online = {};
let typingTimers = {};

/* AUTH */
io.use((socket,next)=>{
try{
const token=socket.handshake.auth.token;
socket.username=jwt.verify(token,config.JWT_SECRET).username;
next();
}catch{
next(new Error("auth"));
}
});

io.on("connection",(socket)=>{

online[socket.id]=socket.username;
emitUsers();

/* MESSAGE */
socket.on("private_message",async(data)=>{

const msg=await Message.create({
from:socket.username,
to:data.to,
message:data.message,
status:"sent"
});

emitToUser(data.to,"private_message",msg);
socket.emit("private_message",msg);

});

/* HISTORY */
socket.on("get_history",async(user)=>{

const msgs=await Message.find({
$or:[
{from:socket.username,to:user},
{from:user,to:socket.username}
]
}).sort({time:1});

socket.emit("chat_history",msgs);

});

/* 🔥 REAL TIME READ FIX */
socket.on("read",async(data)=>{

const updated=await Message.updateMany(
{from:data.from,to:data.to,status:{$ne:"read"}},
{$set:{status:"read"}}
);

/* 🔥 ВАЖНО: отправляем ID */
const msgs=await Message.find({
from:data.from,
to:data.to,
status:"read"
});

emitToUser(data.from,"read_update",{
from:data.from,
to:data.to,
messages:msgs.map(m=>m._id)
});

});

/* TYPING */
socket.on("typing",(to)=>{

emitToUser(to,"typing",{from:socket.username});

clearTimeout(socket.typingTimer);

socket.typingTimer=setTimeout(()=>{
emitToUser(to,"stop_typing",{from:socket.username});
},600);

});

/* DISCONNECT */
socket.on("disconnect",()=>{

delete online[socket.id];
emitUsers();

});

});

async function emitUsers() {
    try {
        const users = await User.find({}, "username avatar lastSeen");

        io.emit("users",
            users.map(u => ({
                username: u.username,
                avatar: u.avatar,
                online: Object.values(online).includes(u.username)
            }))
        );
    } catch (err) {
        console.log("emitUsers error:", err);
    }
}

function emitToUser(username,event,data){
for(let id in online){
if(online[id]===username){
io.to(id).emit(event,data);
}
}
}

server.listen(3000,()=>console.log("OK"));