// /register /login /logout /me /sessions /check-username /check-email
const express = require("express");
const router = express.Router();
const usersRepo = require("../db/repos/users");
const tokenUtil = require("../utils/jwt");
const { authRequired } = require("../middleware/auth");
const audit = require("../db/repos/audit");
const config = require("../config");

const USERNAME_RE = /^[a-z0-9_]{3,32}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// Rate limit для check-эндпоинтов (защита от перебора)
const checkLimiter = require("express-rate-limit")({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false
});

router.get("/check-username", checkLimiter, async (req, res) => {
  const u = String(req.query.u || "").trim().toLowerCase();
  if (!u) return res.json({ ok: true, available: false, error: "Пусто" });
  if (!USERNAME_RE.test(u)) {
    return res.json({ ok: true, available: false, error: "Неверный формат" });
  }
  const found = await usersRepo.findByUsername(u);
  res.json({ ok: true, available: !found });
});

router.get("/check-email", checkLimiter, async (req, res) => {
  const e = String(req.query.e || "").trim().toLowerCase();
  if (!e) return res.json({ ok: true, available: false, error: "Пусто" });
  if (!EMAIL_RE.test(e) || e.length > 254) {
    return res.json({ ok: true, available: false, error: "Неверный формат" });
  }
  const found = await usersRepo.findByEmail(e);
  res.json({ ok: true, available: !found });
});

router.post("/register", async (req, res) => {
  const { username, firstName, lastName, email, password } = req.body || {};
  if (!username || !firstName || !password) {
    return res.status(400).json({ ok: false, error: "Заполните обязательные поля" });
  }
  if (!USERNAME_RE.test(username)) {
    return res.status(400).json({ ok: false, error: "Логин: 3-32 символа, a-z, 0-9, _" });
  }
  if (email && !EMAIL_RE.test(email)) {
    return res.status(400).json({ ok: false, error: "Некорректный email" });
  }
  if (password.length < 6) {
    return res.status(400).json({ ok: false, error: "Пароль минимум 6 символов" });
  }
  const existingUser = await usersRepo.findByUsername(username);
  if (existingUser) {
    return res.status(409).json({ ok: false, error: "Пользователь уже существует" });
  }
  if (email) {
    const existingEmail = await usersRepo.findByEmail(email);
    if (existingEmail) {
      return res.status(409).json({ ok: false, error: "Email уже используется" });
    }
  }
  const user = await usersRepo.create({ username, firstName, lastName, email: email || null, password });
  await audit.log({
    actorId: user.id, action: "user.register",
    targetType: "user", targetId: user.id,
    newValue: { username: user.username, email: email || null },
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
  try {
    const deviceInfo = req.headers["sec-ch-ua-platform"] || (req.headers["user-agent"] || "").slice(0, 60);
    await usersRepo.createSession({
      userId: user.id,
      token,
      deviceInfo,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"]
    });
  } catch (e) { /* non-fatal */ }
  res.json({ ok: true, token, user });
});

router.post("/logout", authRequired, async (req, res) => {
  try {
    const auth = req.headers.authorization || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : null;
    if (token) await usersRepo.deleteSessionByToken(token);
  } catch (e) { /* non-fatal */ }
  res.json({ ok: true });
});

router.get("/me", authRequired, async (req, res) => {
  const user = await usersRepo.findById(req.user.id);
  if (!user) return res.status(404).json({ ok: false, error: "Пользователь не найден" });
  res.json({ ok: true, user: usersRepo.rowToUser(user) });
});

// === Список активных сессий ===
router.get("/sessions", authRequired, async (req, res) => {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : null;
  const hash = token ? usersRepo.tokenHash(token) : null;
  const sessions = await usersRepo.getActiveSessions(req.user.id, hash);
  res.json({ ok: true, sessions });
});

router.delete("/sessions/:id", authRequired, async (req, res) => {
  const id = parseInt(req.params.id);
  if (!id) return res.status(400).json({ ok: false, error: "Не указан id" });
  await usersRepo.terminateSession(id, req.user.id);
  res.json({ ok: true });
});

router.post("/sessions/terminate-all", authRequired, async (req, res) => {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : null;
  const hash = token ? usersRepo.tokenHash(token) : null;
  const count = await usersRepo.terminateAllOtherSessions(req.user.id, hash);
  res.json({ ok: true, terminated: count });
});

module.exports = router;
