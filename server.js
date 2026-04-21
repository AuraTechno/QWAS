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

mongoose.connect("mongodb+srv://server:PASSWORD@qwas.ijvw0zw.mongodb.net/messenger");

const UserSchema = new mongoose.Schema({
    username: String,
    password: String,
    avatar: String,
    lastSeen: Number
});

const MessageSchema = new mongoose.Schema({
    from: String,
    to: String,
    message: String,
    time: { type: Date, default: Date.now },
    status: { type: String, default: "sent" }
});

const User = mongoose.model("User", UserSchema);
const Message = mongoose.model("Message", MessageSchema);

let online = {};

/* AUTH */
app.post("/register", async (req,res)=>{
    const {username,password}=req.body;

    const exists = await User.findOne({username});
    if(exists) return res.json({ok:false});

    const hash = await bcrypt.hash(password,10);

    await User.create({
        username,
        password:hash,
        avatar:"",
        lastSeen:Date.now()
    });

    res.json({ok:true});
});

app.post("/login", async (req,res)=>{
    const {username,password}=req.body;

    const user = await User.findOne({username});
    if(!user) return res.json({ok:false});

    const ok = await bcrypt.compare(password,user.password);
    if(!ok) return res.json({ok:false});

    res.json({ok:true});
});

/* SOCKET */
io.on("connection",(socket)=>{

    socket.on("join", async (username)=>{

        online[socket.id]=username;

        const users = await User.find({}, "username avatar lastSeen");

        io.emit("users",{
            users,
            online:Object.values(online)
        });
    });

    socket.on("private_message", async (data)=>{

        const from = online[socket.id];

        const msg = await Message.create({
            from,
            to:data.to,
            message:data.message,
            status:"sent"
        });

        for(let id in online){
            if(online[id]===data.to){
                io.to(id).emit("private_message",msg);
            }
        }

        socket.emit("private_message",msg);
    });

    socket.on("get_history", async (withUser)=>{

        const user = online[socket.id];

        const msgs = await Message.find({
            $or:[
                {from:user,to:withUser},
                {from:withUser,to:user}
            ]
        }).sort({time:1});

        socket.emit("chat_history",msgs);
    });

    socket.on("disconnect",()=>{
        delete online[socket.id];
    });

});

server.listen(3000,()=>console.log("STABLE RUN"));