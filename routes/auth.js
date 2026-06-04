const express = require("express");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");

const { getJWTSecret } = require("../middleware/auth");

const router = express.Router();

function getModels() {
  try {
    return {
      User: require("../models/User"),
      Message: require("../models/Message")
    };
  } catch {
    return { User: null, Message: null };
  }
}

function generateSessionToken() {
  return crypto.randomBytes(32).toString("hex");
}

router.post("/register", async (req, res) => {
  try {
    let { username, password, firstName, lastName } = req.body;
    if (!username || !password) return res.json({ ok: false, error: "Введите логин и пароль" });

    username = username.replace(/^@/, "");
    if (!/^[a-zA-Z0-9_]{3,32}$/.test(username)) {
      return res.json({ ok: false, error: "Логин: 3-32 символа, только буквы, цифры и _" });
    }

    const { User } = getModels();
    if (!User) return res.status(503).json({ ok: false, error: "База данных не готова" });

    const exists = await User.findOne({ username });
    if (exists) return res.json({ ok: false, error: "Пользователь уже существует" });

    const hash = await bcrypt.hash(password, 10);
    const colors = ["#5e8ee7", "#8e44ad", "#e91e63", "#e74c3c", "#ff9800", "#f1c40f", "#27ae60", "#16a085", "#3498db"];
    const randomColor = colors[Math.floor(Math.random() * colors.length)];

    await User.create({
      username,
      password: hash,
      firstName: firstName || "",
      lastName: lastName || "",
      avatar: "",
      avatarColor: randomColor
    });
    res.json({ ok: true, message: "Регистрация успешна!" });
  } catch (err) {
    console.error("Ошибка регистрации:", err);
    res.json({ ok: false, error: "Ошибка сервера" });
  }
});

router.post("/login", async (req, res) => {
  try {
    let { username, password } = req.body;
    username = (username || "").replace(/^@/, "");

    const { User } = getModels();
    if (!User) return res.status(503).json({ ok: false, error: "База данных не готова" });

    const user = await User.findOne({ username });
    if (!user) return res.json({ ok: false, error: "Пользователь не найден" });

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.json({ ok: false, error: "Неверный пароль" });

    const sessionToken = generateSessionToken();
    const token = jwt.sign({ username, sessionToken }, getJWTSecret());
    await User.updateOne({ username }, { $set: { sessionToken } });

    res.json({
      ok: true,
      token,
      user: publicUser(user),
      message: "Вход выполнен успешно!"
    });
  } catch (err) {
    console.error("Ошибка входа:", err);
    res.json({ ok: false, error: "Ошибка сервера" });
  }
});

router.post("/auto-login", async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.json({ ok: false });

    const { User } = getModels();
    if (!User) return res.json({ ok: false });

    const data = jwt.verify(token, getJWTSecret());
    const user = await User.findOne({ username: data.username, sessionToken: data.sessionToken });
    if (!user) return res.json({ ok: false });

    res.json({ ok: true, user: publicUser(user) });
  } catch (err) {
    res.json({ ok: false });
  }
});

router.post("/logout", async (req, res) => {
  try {
    const header = req.headers.authorization;
    if (header) {
      const token = header.split(" ")[1];
      try {
        const data = jwt.verify(token, getJWTSecret());
        const { User } = getModels();
        if (User) await User.updateOne({ username: data.username }, { $set: { sessionToken: null, presence: "offline" } });
      } catch {}
    }
    res.json({ ok: true });
  } catch (err) {
    res.json({ ok: true });
  }
});

function publicUser(u) {
  return {
    username: u.username,
    firstName: u.firstName || "",
    lastName: u.lastName || "",
    bio: u.bio || "",
    avatar: u.avatar || "",
    avatarColor: u.avatarColor || "#5e8ee7",
    presence: u.presence || "offline",
    lastSeen: u.lastSeen,
    settings: u.settings || {}
  };
}

module.exports = router;
module.exports.publicUser = publicUser;
