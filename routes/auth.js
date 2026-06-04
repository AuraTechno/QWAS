// /register /login /logout /me /sessions
const express = require("express");
const router = express.Router();
const usersRepo = require("../db/repos/users");
const tokenUtil = require("../utils/jwt");
const { authRequired } = require("../middleware/auth");
const audit = require("../db/repos/audit");
const config = require("../config");

const USERNAME_RE = /^[a-z0-9_]{3,32}$/;

router.post("/register", async (req, res) => {
  const { username, firstName, lastName, password } = req.body || {};
  if (!username || !firstName || !password) {
    return res.status(400).json({ ok: false, error: "Заполните все поля" });
  }
  if (!USERNAME_RE.test(username)) {
    return res.status(400).json({ ok: false, error: "Логин: 3-32 символа, a-z, 0-9, _" });
  }
  if (password.length < 6) {
    return res.status(400).json({ ok: false, error: "Пароль минимум 6 символов" });
  }
  const existing = await usersRepo.findByUsername(username);
  if (existing) {
    return res.status(409).json({ ok: false, error: "Пользователь уже существует" });
  }
  const user = await usersRepo.create({ username, firstName, lastName, password });
  await audit.log({
    actorId: user.id, action: "user.register",
    targetType: "user", targetId: user.id,
    newValue: { username: user.username },
    ipAddress: req.ip, userAgent: req.headers["user-agent"]
  });
  const token = tokenUtil.sign({ id: user.id, username: user.username, isAdmin: user.isAdmin });
  res.json({ ok: true, token, user });
});

router.post("/login", async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ ok: false, error: "Введите логин и пароль" });
  }
  const user = await usersRepo.verifyPassword(username, password);
  if (!user) {
    return res.status(401).json({ ok: false, error: "Неверный логин или пароль" });
  }
  if (user.isBanned) {
    return res.status(403).json({ ok: false, error: "Аккаунт заблокирован" });
  }
  await audit.log({
    actorId: user.id, action: "user.login",
    targetType: "user", targetId: user.id,
    ipAddress: req.ip, userAgent: req.headers["user-agent"]
  });
  const token = tokenUtil.sign({ id: user.id, username: user.username, isAdmin: user.isAdmin });
  res.json({ ok: true, token, user });
});

router.post("/logout", authRequired, async (req, res) => {
  // Клиент сам выкидывает токен. Здесь можно добавить blacklist при необходимости.
  res.json({ ok: true });
});

router.get("/me", authRequired, async (req, res) => {
  const user = await usersRepo.findById(req.user.id);
  if (!user) return res.status(404).json({ ok: false, error: "Пользователь не найден" });
  res.json({ ok: true, user: usersRepo.rowToUser(user) });
});

module.exports = router;
