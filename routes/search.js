const express = require("express");
const { authMiddleware } = require("../middleware/auth");
const { searchMessages, searchUsers } = require("../db/chatService");

const router = express.Router();

router.get("/messages", authMiddleware, async (req, res) => {
  try {
    const q = (req.query.q || "").trim();
    const limit = Math.min(parseInt(req.query.limit) || 30, 100);
    if (q.length < 2) return res.json({ ok: true, results: [] });
    const results = await searchMessages(req.user.username, q, limit);
    res.json({ ok: true, results });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

router.get("/users", authMiddleware, async (req, res) => {
  try {
    const q = (req.query.q || "").trim();
    const limit = Math.min(parseInt(req.query.limit) || 20, 50);
    const results = await searchUsers(q, limit);
    res.json({ ok: true, results });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

router.get("/chats", authMiddleware, async (req, res) => {
  try {
    const q = (req.query.q || "").toLowerCase().trim();
    const { Group } = require("../models/Group");
    const chats = (req.app.get("io") && global.QWAS_chats) || [];
    const results = [];
    if (q.length < 1) return res.json({ ok: true, results: [] });

    const myGroups = await Group.find({ "members.username": req.user.username, name: new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") })
      .select("_id name avatar avatarColor members")
      .limit(20)
      .lean();
    for (const g of myGroups) {
      results.push({ type: "group", _id: g._id, name: g.name, avatar: g.avatar, avatarColor: g.avatarColor, memberCount: g.members.length, username: `group:${g._id}` });
    }
    res.json({ ok: true, results });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

module.exports = router;
