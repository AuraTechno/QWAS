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

app.use(express.json({limit:"10mb"}));
app.use(express.static("public"));

mongoose.connect(config.MONGO_URL);

let online = {}; // socket.id -> username

/* REGISTER */
app.post("/register", async (req,res)=>{
    const {username,password}=req.body;

    const exists = await User.findOne({username});
    if(exists) return res.json({ok:false});

    const hash = await bcrypt.hash(password,10);

    await User.create({username,password:hash});

    res.json({ok:true});
});

/* LOGIN */
app.post("/login", async (req,res)=>{
    const {username,password}=req.body;

    const user = await User.findOne({username});
    if(!user) return res.json({ok:false});

    const ok = await bcrypt.compare(password,user.password);
    if(!ok) return res.json({ok:false});

    const token = jwt.sign(
        {username},
        config.JWT_SECRET,
        {expiresIn:"7d"}
    );

    res.json({ok:true,token});
});

/* UPDATE AVATAR */
app.post("/avatar", async (req,res)=>{
    const {username,avatar}=req.body;

    await User.updateOne(
        {username},
        {$set:{avatar}}
    );

    res.json({ok:true});
});

/* SOCKET AUTH */
io.use((socket,next)=>{
    try{
        const token = socket.handshake.auth.token;
        const data = jwt.verify(token,config.JWT_SECRET);
        socket.username=data.username;
        next();
    }catch(e){
        next(new Error("auth"));
    }
});

io.on("connection",(socket)=>{

    online[socket.id]=socket.username;

    emitUsers();

    socket.on("join",()=>{
        emitUsers();
    });

    /* MESSAGE */
    socket.on("private_message", async (data)=>{

        const msg = await Message.create({
            from:socket.username,
            to:data.to,
            message:data.message,
            status:"sent"
        });

        emitToUser(data.to,"private_message",msg);
        socket.emit("private_message",msg);
    });

    /* HISTORY */
    socket.on("get_history", async (user)=>{

        const msgs = await Message.find({
            $or:[
                {from:socket.username,to:user},
                {from:user,to:socket.username}
            ]
        }).sort({time:1});

        socket.emit("chat_history",msgs);
    });

    /* READ */
    socket.on("read", async (data)=>{

        await Message.updateMany(
            {from:data.from,to:data.to},
            {$set:{status:"read"}}
        );

        emitToUser(data.from,"read_update",data);
    });

    /* TYPING */
    let typingTimeout;

    socket.on("typing",(to)=>{

        emitToUser(to,"typing",{from:socket.username});

        clearTimeout(typingTimeout);

        typingTimeout=setTimeout(()=>{
            emitToUser(to,"stop_typing",{from:socket.username});
        },1000);
    });

    /* DISCONNECT */
    socket.on("disconnect",async ()=>{

        const user = socket.username;

        if(user){
            await User.updateOne(
                {username:user},
                {$set:{lastSeen:Date.now()}}
            );
        }

        delete online[socket.id];

        emitUsers();
    });

});

/* USERS */
async function emitUsers(){

    const users = await User.find({}, "username avatar lastSeen");

    io.emit("users",{
        users,
        online:Object.values(online)
    });
}

/* SEND TO USER */
function emitToUser(username,event,data){

    for(let id in online){
        if(online[id]===username){
            io.to(id).emit(event,data);
        }
    }
}

server.listen(3000,()=>{
    console.log("PRO STABLE 5 RUN");
});