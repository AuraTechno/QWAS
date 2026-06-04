const express = require("express");
const { authMiddleware } = require("../middleware/auth");

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
    const { User, Message } = getModels();
    if (!User || !Message) return res.status(503).json({ ok: false });

    const chatInfo = await Message.aggregate([
      {
        $match: {
          $and: [
            { $or: [{ from: req.user.username }, { to: req.user.username }] },
            { to: { $ne: "favorites" } },
            { to: { $not: /^group:/ } }
          ]
        }
      },
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: {
            $cond: [{ $eq: ["$from", req.user.username] }, "$to", "$from"]
          },
          lastMessage: { $first: "$$ROOT" },
          unreadCount: {
            $sum: {
              $cond: [
                { $and: [{ $eq: ["$to", req.user.username] }, { $ne: ["$status", "read"] }] },
                1,
                0
              ]
            }
          }
        }
      },
      { $sort: { "lastMessage.createdAt": -1 } }
    ]);

    const contacts = await User.find({ username: { $in: chatInfo.map(c => c._id) } })
      .select("username avatar avatarColor").lean();

    const online = req.app.get("onlineUsers") || new Map();

    const chatList = chatInfo.map(chat => {
      const user = contacts.find(c => c.username === chat._id);
      return {
        username: chat._id,
        avatar: user?.avatar || "",
        avatarColor: user?.avatarColor || "#6366f1",
        online: online.has(chat._id),
        lastMessage: chat.lastMessage.message,
        lastMessageTime: chat.lastMessage.createdAt,
        unreadCount: chat.unreadCount || 0
      };
    });

    res.json({ ok: true, chats: chatList });
  } catch (err) {
    console.error("Get chats error:", err);
    res.json({ ok: false, chats: [] });
  }
});

module.exports = router;
