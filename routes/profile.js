const express = require("express");
const { authMiddleware } = require("../middleware/auth");
const { emitChatList } = require("../socket/handlers");

const router = express.Router();

function getModels() {
  try {
    return { User: require("../models/User"), Message: require("../models/Message") };
  } catch {
    return { User: null, Message: null };
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
    const { avatar, avatarColor } = req.body;
    const update = {};
    if (avatar !== undefined) update.avatar = avatar;
    if (avatarColor !== undefined) update.avatarColor = avatarColor;
    await User.updateOne({ username: req.user.username }, { $set: update });

    const online = req.app.get("onlineUsers");
    if (online) {
      const io = req.app.get("io");
      if (io) emitChatList(io, online);
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
      .select("username avatar avatarColor").lean();
    res.json({ ok: true, users });
  } catch (err) {
    res.json({ ok: false, users: [] });
  }
});

module.exports = router;
