const express = require("express");
const { authMiddleware } = require("../middleware/auth");
const chatService = require("../db/chatService");
const Chat = require("../models/Chat");
const User = require("../models/User");
const Message = require("../models/Message");

const router = express.Router();

function getModels() {
  try {
    return {
      User: require("../models/User"),
      Message: require("../models/Message"),
      Group: require("../models/Group")
    };
  } catch {
    return { User: null, Message: null, Group: null };
  }
}

router.get("/", authMiddleware, async (req, res) => {
  try {
    const me = req.user.username;
    const list = await chatService.getFastChatList(me);
    const all = list || [];
    res.json({
      ok: true,
      chats: all,
      archiveCount: all.filter(c => c.archived).length,
      pinnedCount: all.filter(c => c.pinned).length
    });
  } catch (err) {
    console.error("Get chats error:", err);
    res.json({ ok: false, chats: [] });
  }
});

router.post("/archive", authMiddleware, async (req, res) => {
  try {
    const { chatId, archive = true } = req.body;
    const me = req.user.username;
    await chatService.setArchived(me, chatId, !!archive);
    res.json({ ok: true });
  } catch (err) {
    res.json({ ok: false });
  }
});

router.post("/pin", authMiddleware, async (req, res) => {
  try {
    const { chatId, pin = true } = req.body;
    const me = req.user.username;
    if (pin) {
      const cur = await Chat.findOne({ owner: me, chatId }).select("pinOrder").lean();
      const ord = (cur?.pinOrder || 0) + 1;
      await chatService.setPinned(me, chatId, true, ord);
    } else {
      await chatService.setPinned(me, chatId, false);
    }
    res.json({ ok: true });
  } catch (err) {
    res.json({ ok: false });
  }
});

router.post("/mute", authMiddleware, async (req, res) => {
  try {
    const { chatId, mute = true, until = null } = req.body;
    const me = req.user.username;
    await chatService.setMuted(me, chatId, !!mute, until);
    res.json({ ok: true });
  } catch (err) {
    res.json({ ok: false });
  }
});

router.get("/media/:chatId", authMiddleware, async (req, res) => {
  try {
    const { Message } = getModels();
    if (!Message) return res.status(503).json({ ok: false });
    const { chatId } = req.params;
    const me = req.user.username;

    let convId;
    if (chatId === "favorites") {
      convId = `favorites:${me}`;
    } else if (chatId.startsWith("group:")) {
      convId = `g:${chatId.slice(6)}`;
    } else {
      convId = chatService.convIdDM(me, chatId);
    }

    const messages = await Message.find({
      conversationId: convId,
      attachments: { $exists: true, $ne: [] }
    })
      .sort({ createdAt: -1 })
      .limit(200)
      .select("from createdAt attachments")
      .lean();

    const media = { images: [], videos: [], files: [], voice: [] };
    for (const m of messages) {
      for (const a of m.attachments || []) {
        const item = { url: a.url, name: a.name, size: a.size, from: m.from, createdAt: m.createdAt };
        if (a.type === "image") media.images.push(item);
        else if (a.type === "video") media.videos.push(item);
        else if (a.type === "voice" || a.type === "round") media.voice.push(item);
        else media.files.push(item);
      }
    }
    res.json({ ok: true, media });
  } catch (err) {
    res.json({ ok: false, media: { images: [], videos: [], files: [], voice: [] } });
  }
});

router.get("/info/:chatId", authMiddleware, async (req, res) => {
  try {
    const { chatId } = req.params;
    const me = req.user.username;
    if (chatId.startsWith("group:")) {
      const { Group } = getModels();
      const g = await Group.findById(chatId.slice(6)).lean();
      if (!g) return res.json({ ok: false, error: "not_found" });
      res.json({ ok: true, type: "group", group: g });
    } else {
      const u = await User.findOne({ username: chatId })
        .select("username firstName lastName bio avatar avatarColor presence lastSeen").lean();
      if (!u) return res.json({ ok: false, error: "not_found" });
      res.json({ ok: true, type: "dm", user: u });
    }
  } catch (err) {
    res.json({ ok: false, error: err.message });
  }
});

module.exports = router;
