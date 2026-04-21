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

/* DB CONNECT (ONLY HERE) */
mongoose.connect(config.MONGO_URL)
.then(()=>console.log("Mongo connected"))
.catch(err=>console.log("Mongo error",err));

/* ONLINE MAP */
let online = {}; // socket.id -> username

/* REGISTER */
app.post("/register", async (req,res)=>{
    const {username,password}=req.body;

    const exists = await User.findOne({username});
    if(exists) return res.json({ok:false});

    const hash = await bcrypt.hash(password,10);

    await User.create({
        username,
        password:hash
    });

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

/* SOCKET AUTH */
io.use((socket,next)=>{
    try{
        const token = socket.handshake.auth.token;
        const data = jwt.verify(token,config.JWT_SECRET);

        socket.username = data.username;
        next();
    }catch(e){
        next(new Error("auth failed"));
    }
});

/* SOCKET */
io.on("connection",(socket)=>{

    online[socket.id]=socket.username;

    sendUsers();

    socket.on("private_message", async (data)=>{

        const msg = await Message.create({
            from:socket.username,
            to:data.to,
            message:data.message
        });

        for(let id in online){
            if(online[id]===data.to){
                io.to(id).emit("private_message",msg);
            }
        }

        socket.emit("private_message",msg);
    });

    socket.on("get_history", async (withUser)=>{

        const msgs = await Message.find({
            $or:[
                {from:socket.username,to:withUser},
                {from:withUser,to:socket.username}
            ]
        }).sort({time:1});

        socket.emit("chat_history",msgs);
    });

    socket.on("disconnect",async ()=>{

        const user = socket.username;

        if(user){
            await User.updateOne(
                {username:user},
                {$set:{lastSeen:Date.now()}}
            );
        }

        for(let id in online){
            if(online[id]===user){
                delete online[id];
            }
        }

        sendUsers();
    });

});

/* USERS UPDATE */
async function sendUsers(){
    const users = await User.find({}, "username avatar lastSeen");

    io.emit("users",{
        users,
        online:Object.values(online)
    });
}

server.listen(config.PORT,()=>{
    console.log("PRO STABLE 3.1 RUN");
});