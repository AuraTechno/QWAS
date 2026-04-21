<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<title>Messenger PRO 3</title>
<script src="/socket.io/socket.io.js"></script>

<style>
body{
    margin:0;
    font-family:Arial;
    background:#0d0d0d;
    color:#fff;
}

/* AUTH */
#auth{
    width:320px;
    margin:120px auto;
    display:flex;
    flex-direction:column;
    gap:10px;
}

input{
    padding:12px;
    border:none;
    border-radius:10px;
    background:#1a1a1a;
    color:#fff;
}

button{
    padding:12px;
    border:none;
    border-radius:10px;
    background:#fff;
    color:#000;
    cursor:pointer;
}

/* LAYOUT */
#chat{
    display:none;
    height:100vh;
}

/* USERS */
.sidebar{
    width:300px;
    background:#121212;
    border-right:1px solid #222;
    overflow:auto;
}

.user{
    display:flex;
    gap:10px;
    padding:15px;
    cursor:pointer;
    border-bottom:1px solid #1f1f1f;
}

.user:hover{
    background:#1a1a1a;
}

/* AVATAR */
.avatar{
    width:40px;
    height:40px;
    border-radius:50%;
    background:#333;
    overflow:hidden;
    display:flex;
    align-items:center;
    justify-content:center;
}

.avatar img{
    width:100%;
    height:100%;
}

/* CHAT */
.chat{
    flex:1;
    display:flex;
    flex-direction:column;
}

.header{
    padding:15px;
    border-bottom:1px solid #222;
    display:flex;
    justify-content:space-between;
}

.status{
    font-size:12px;
    opacity:0.7;
}

/* MSG */
.messages{
    flex:1;
    padding:15px;
    overflow:auto;
}

.msg{
    display:flex;
    margin:6px 0;
}

.me{justify-content:flex-end;}
.other{justify-content:flex-start;}

.bubble{
    max-width:60%;
    padding:10px;
    border-radius:12px;
}

/* ME */
.me .bubble{
    background:#fff;
    color:#000;
}

/* OTHER */
.other .bubble{
    background:#1a1a1a;
    border:1px solid #333;
}

/* TIME + CHECKS */
.meta{
    font-size:10px;
    opacity:0.6;
    display:flex;
    justify-content:center;
    gap:5px;
    margin-top:5px;
}

/* INPUT */
.input{
    display:flex;
    border-top:1px solid #222;
}

.input input{
    flex:1;
    border:none;
    padding:15px;
    background:#111;
}

.input button{
    width:80px;
}

/* typing */
.typing{
    font-size:12px;
    opacity:0.6;
}
</style>
</head>

<body>

<div id="auth">
    <h2>Messenger PRO 3</h2>
    <input id="u">
    <input id="p" type="password">
    <button onclick="login()">Войти</button>
    <button onclick="register()">Регистрация</button>
</div>

<div id="chat">

    <div class="sidebar" id="users"></div>

    <div class="chat">

        <div class="header">
            <div id="chatName"></div>
            <div class="status" id="status"></div>
        </div>

        <div class="messages" id="messages"></div>

        <div class="input">
            <input id="msg" placeholder="Сообщение">
            <button onclick="send()">➤</button>
        </div>

    </div>
</div>

<script>
const socket=io();

let username="";
let current="";

/* AUTH */
function register(){
fetch("/register",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({username:u.value,password:p.value})})
}

function login(){
fetch("/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({username:u.value,password:p.value})})
.then(r=>r.json()).then(d=>{
if(d.ok){
username=u.value;
auth.style.display="none";
chat.style.display="flex";
socket.emit("join",username);
}
});
}

/* USERS */
socket.on("users",data=>{
users.innerHTML="";
data.users.forEach(u=>{
if(u.username!==username){
users.innerHTML+=`
<div class="user" onclick="openChat('${u.username}')">
<div class="avatar">${u.avatar?`<img src="${u.avatar}">`:u.username[0]}</div>
<div>${u.username}</div>
</div>`;
}
});
});

/* CHAT */
function openChat(u){
current=u;
chatName.innerText=u;
socket.emit("get_history",u);
}

/* SEND */
function send(){
if(!msg.value||!current)return;

socket.emit("private_message",{to:current,message:msg.value});

render({
from:username,
message:msg.value,
time:new Date(),
status:"sent"
});

msg.value="";
}

/* ENTER */
msg.onkeydown=e=>{
if(e.key==="Enter")send();
};

/* TYPING */
msg.oninput=()=>{
socket.emit("typing",{from:username,to:current});
};

/* RENDER */
function render(m){

let me=m.from===username;

let time=new Date(m.time).toLocaleTimeString([],{
hour:"2-digit",minute:"2-digit"
});

let check="";
if(me){
if(m.status==="sent")check="✓";
if(m.status==="read")check="✓✓";
}

messages.innerHTML+=`
<div class="msg ${me?'me':'other'}">
<div class="bubble">

<div>${m.message}</div>

<div class="meta">
<span>${time}</span>
<span>${check}</span>
</div>

</div>
</div>`;

messages.scrollTop=messages.scrollHeight;
}

/* TYPING */
socket.on("typing",d=>{
if(d.from===current){
status.innerText="печатает...";
}
});

socket.on("stop_typing",()=>{
status.innerText="";
});

/* HISTORY */
socket.on("chat_history",msgs=>{
messages.innerHTML="";
msgs.forEach(render);
});
</script>

</body>
</html>