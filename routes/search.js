// Поиск: пользователи, чаты, сообщения
const express = require("express");
const router = express.Router();
const usersRepo = require("../db/repos/users");
const messagesRepo = require("../db/repos/messages");
const chatsRepo = require("../db/repos/chats");
const { authRequired } = require("../middleware/auth");

router.get("/users", authRequired, async (req, res) => {
  const q = String(req.query.q || "").trim();
  if (!q) return res.json({ ok: true, users: [] });
  const users = await usersRepo.search(q, 20);
  res.json({ ok: true, users });
});

router.get("/messages", authRequired, async (req, res) => {
  const q = String(req.query.q || "").trim();
  if (!q) return res.json({ ok: true, messages: [] });
  const limit = Math.min(parseInt(req.query.limit) || 50, 200);
  const messages = await messagesRepo.globalSearch(q, { limit });
  res.json({ ok: true, messages });
});

router.get("/chats", authRequired, async (req, res) => {
  const q = String(req.query.q || "").trim();
  if (!q) return res.json({ ok: true, chats: [] });
  // Поиск среди чатов пользователя по title и username
  const db = require("../db/pg");
  const res1 = await db.query(
    `SELECT c.* FROM chats c
     JOIN chat_members cm ON cm.chat_id = c.id
     WHERE cm.user_id = $1
       AND (c.title ILIKE $2 OR c.username ILIKE $2)`,
    [req.user.id, `%${q}%`]
  );
  const chats = res1.rows.map(chatsRepo.rowToChat);
  res.json({ ok: true, chats });
});

module.exports = router;
