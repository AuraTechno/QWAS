// Уведомления
const express = require("express");
const router = express.Router();
const notifRepo = require("../db/repos/notifications");
const { authRequired } = require("../middleware/auth");

router.get("/", authRequired, async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 50, 200);
  const notifications = await notifRepo.getForUser(req.user.username, { limit });
  const unreadCount = await notifRepo.getUnreadCount(req.user.username);
  res.json({ ok: true, notifications, unreadCount });
});

router.post("/read", authRequired, async (req, res) => {
  const ids = (req.body && req.body.ids) || null;
  await notifRepo.markRead(req.user.username, ids);
  res.json({ ok: true });
});

router.post("/read-all", authRequired, async (req, res) => {
  await notifRepo.markAllRead(req.user.username);
  res.json({ ok: true });
});

module.exports = router;
