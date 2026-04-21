const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const config = require("./config");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(express.static(__dirname));

mongoose.connect(config.MONGO_URL);

const UserSchema = new mongoose.Schema({
    username: String,
    password: String,
    avatar: String
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

let onlineUsers = {};

/* AUTH */
app.post("/register", async (req,res)=>{
    const {username,password}=req.body;

    const exists = await User.findOne({username});
    if(exists) return res.json({ok:false});

    const hash = await bcrypt.hash(password,10);

    await User.create({
        username,
        password:hash,
        avatar:""
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
        onlineUsers[socket.id]=username;

        const users = await User.find({}, "username avatar");

        io.emit("users",{
            users,
            online:Object.values(onlineUsers)
        });
    });

    /* MESSAGE */
    socket.on("private_message", async (data)=>{
        const from = onlineUsers[socket.id];

        const msg = await Message.create({
            from,
            to:data.to,
            message:data.message,
            status:"sent"
        });

        for(let id in onlineUsers){
            if(onlineUsers[id]===data.to){
                io.to(id).emit("private_message",msg);
            }
        }
    });

    /* HISTORY */
    socket.on("get_history", async (withUser)=>{
        const user = onlineUsers[socket.id];

        await Message.updateMany(
            {from:withUser,to:user},
            {$set:{status:"read"}}
        );

        const msgs = await Message.find({
            $or:[
                {from:user,to:withUser},
                {from:withUser,to:user}
            ]
        }).sort({time:1});

        socket.emit("chat_history",msgs);
    });

    /* TYPING */
    socket.on("typing",(data)=>{
        for(let id in onlineUsers){
            if(onlineUsers[id]===data.to){
                io.to(id).emit("typing",{from:data.from});
            }
        }
    });

    socket.on("stop_typing",(data)=>{
        for(let id in onlineUsers){
            if(onlineUsers[id]===data.to){
                io.to(id).emit("stop_typing");
            }
        }
    });

    socket.on("disconnect",()=>{
        delete onlineUsers[socket.id];
    });

});

server.listen(3000);