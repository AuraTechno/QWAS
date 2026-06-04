const express = require("express");
const { authMiddleware } = require("../middleware/auth");

const router = express.Router();

function getModels() {
  try {
    return { User: require("../models/User"), Message: require("../models/Message"), Group: require("../models/Group") };
  } catch {
    return { User: null, Message: null, Group: null };
  }
}

router.get("/", authMiddleware, async (req, res) => {
  try {
    const { User } = getModels();
    if (!User) return res.status(503).json({ ok: false });
    const user = await User.findOne({ username: req.user.username }).select("-password").lean();
    if (!user) return res.status(404).json({ ok: false });
    res.json({ ok: true, user });
  } catch (err) {
    res.status(401).json({ ok: false });
  }
});

router.post("/update", authMiddleware, async (req, res) => {
  try {
    const { User } = getModels();
    if (!User) return res.status(503).json({ ok: false });

    const allowed = ["firstName", "lastName", "bio", "avatar", "avatarColor", "settings"];
    const update = {};
    for (const k of allowed) {
      if (req.body[k] !== undefined) update[k] = req.body[k];
    }
    await User.updateOne({ username: req.user.username }, { $set: update });

    const online = req.app.get("onlineUsers");
    const io = req.app.get("io");
    if (online && io) {
      const { emitChatList, emitGroupChatList } = require("../socket/handlers");
      emitChatList(io, online);
      emitGroupChatList(io, online);
    }

    res.json({ ok: true, message: "Профиль обновлён" });
  } catch (err) {
    res.status(500).json({ ok: false });
  }
});

router.get("/all", authMiddleware, async (req, res) => {
  try {
    const { User } = getModels();
    if (!User) return res.status(503).json({ ok: false });
    const users = await User.find({ username: { $ne: req.user.username } })
      .select("username firstName lastName bio avatar avatarColor presence lastSeen")
      .lean();
    res.json({ ok: true, users });
  } catch (err) {
    res.json({ ok: false, users: [] });
  }
});

router.get("/:username", authMiddleware, async (req, res) => {
  try {
    const { User } = getModels();
    if (!User) return res.status(503).json({ ok: false });
    const u = await User.findOne({ username: req.params.username })
      .select("username firstName lastName bio avatar avatarColor presence lastSeen createdAt")
      .lean();
    if (!u) return res.status(404).json({ ok: false, error: "Не найден" });

    const me = await User.findOne({ username: req.user.username }).select("settings blocked").lean();
    if (me?.blocked?.includes(u.username)) {
      return res.json({ ok: false, error: "blocked" });
    }
    const target = await User.findOne({ username: u.username }).select("blocked").lean();
    if (target?.blocked?.includes(req.user.username)) {
      return res.json({ ok: false, error: "blocked_by" });
    }
    res.json({ ok: true, user: u });
  } catch (err) {
    res.json({ ok: false });
  }
});

router.post("/block", authMiddleware, async (req, res) => {
  try {
    const { User } = getModels();
    const { username } = req.body;
    if (!username) return res.json({ ok: false });
    await User.updateOne(
      { username: req.user.username },
      { $addToSet: { blocked: username } }
    );
    res.json({ ok: true });
  } catch (err) {
    res.json({ ok: false });
  }
});

router.post("/unblock", authMiddleware, async (req, res) => {
  try {
    const { User } = getModels();
    const { username } = req.body;
    await User.updateOne(
      { username: req.user.username },
      { $pull: { blocked: username } }
    );
    res.json({ ok: true });
  } catch (err) {
    res.json({ ok: false });
  }
});

router.get("/blocked/list", authMiddleware, async (req, res) => {
  try {
    const { User } = getModels();
    const me = await User.findOne({ username: req.user.username }).select("blocked").lean();
    if (!me || !me.blocked?.length) return res.json({ ok: true, users: [] });
    const users = await User.find({ username: { $in: me.blocked } })
      .select("username firstName lastName avatar avatarColor")
      .lean();
    res.json({ ok: true, users });
  } catch (err) {
    res.json({ ok: false, users: [] });
  }
});

router.post("/contact/add", authMiddleware, async (req, res) => {
  try {
    const { User } = getModels();
    const { username } = req.body;
    if (!username || username === req.user.username) return res.json({ ok: false });
    const exists = await User.findOne({ username }).select("_id").lean();
    if (!exists) return res.json({ ok: false, error: "Пользователь не найден" });
    await User.updateOne(
      { username: req.user.username },
      { $addToSet: { contacts: username } }
    );
    res.json({ ok: true });
  } catch (err) {
    res.json({ ok: false });
  }
});

router.post("/contact/remove", authMiddleware, async (req, res) => {
  try {
    const { User } = getModels();
    const { username } = req.body;
    await User.updateOne(
      { username: req.user.username },
      { $pull: { contacts: username } }
    );
    res.json({ ok: true });
  } catch (err) {
    res.json({ ok: false });
  }
});

router.get("/contacts/list", authMiddleware, async (req, res) => {
  try {
    const { User } = getModels();
    const me = await User.findOne({ username: req.user.username }).select("contacts").lean();
    if (!me || !me.contacts?.length) return res.json({ ok: true, users: [] });
    const users = await User.find({ username: { $in: me.contacts } })
      .select("username firstName lastName avatar avatarColor presence lastSeen")
      .lean();
    res.json({ ok: true, users });
  } catch (err) {
    res.json({ ok: false, users: [] });
  }
});

router.post("/settings", authMiddleware, async (req, res) => {
  try {
    const { User } = getModels();
    const settings = req.body || {};
    const allowed = [
      "theme", "accent", "chatBackground",
      "notifications", "soundEnabled", "enterToSend", "showLastSeen",
      "fontSize", "compactMode", "bubbleStyle", "animationsEnabled",
      "videoQuality", "videoFps", "voiceQuality",
      "echoCancellation", "noiseSuppression", "autoGainControl",
      "readReceipts", "typingIndicators", "keepOnline", "nightModeAuto",
      "autoplayVideos", "autoplayGifs", "loopAnimatedStickers",
      "messageTextSize", "bubbleCorners"
    ];
    const update = {};
    for (const k of allowed) {
      if (settings[k] !== undefined) update[`settings.${k}`] = settings[k];
    }
    if (settings.autoDownload && typeof settings.autoDownload === "object") {
      update["settings.autoDownload"] = settings.autoDownload;
    }
    await User.updateOne({ username: req.user.username }, { $set: update });
    res.json({ ok: true });
  } catch (err) {
    res.json({ ok: false });
  }
});

router.post("/presence", authMiddleware, async (req, res) => {
  try {
    const { User } = getModels();
    const { presence } = req.body;
    if (!["online", "offline", "away"].includes(presence)) return res.json({ ok: false });
    await User.updateOne(
      { username: req.user.username },
      { $set: { presence, lastSeen: new Date() } }
    );
    const io = req.app.get("io");
    const online = req.app.get("onlineUsers");
    if (io && online) {
      const { emitChatList, emitGroupChatList } = require("../socket/handlers");
      emitChatList(io, online);
      emitGroupChatList(io, online);
    }
    res.json({ ok: true });
  } catch (err) {
    res.json({ ok: false });
  }
});

module.exports = router;
