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

const ARCHIVE_KEY = "__archived__";
const PINNED_KEY = "__pinned__";
const MUTE_KEY_PREFIX = "__mute__";

function userChatSettingsKey(username) {
  return `chat_settings:${username}`;
}

async function getChatSettings(User, username) {
  try {
    const user = await User.findOne({ username }).select("chatSettings").lean();
    return user?.chatSettings || {};
  } catch {
    return {};
  }
}

async function setChatSettings(User, username, settings) {
  try {
    await User.updateOne({ username }, { $set: { chatSettings: settings } });
  } catch {}
}

router.get("/", authMiddleware, async (req, res) => {
  try {
    const { User, Message, Group } = getModels();
    if (!User || !Message) return res.status(503).json({ ok: false });

    const me = req.user.username;
    const settings = await getChatSettings(User, me);
    const archived = settings[ARCHIVE_KEY] || [];
    const pinned = settings[PINNED_KEY] || [];
    const muteMap = settings.__mutes || {};

    const chatInfo = await Message.aggregate([
      {
        $match: {
          $and: [
            { $or: [{ from: me }, { to: me }] },
            { to: { $ne: "favorites" } },
            { to: { $not: /^group:/ } }
          ]
        }
      },
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: { $cond: [{ $eq: ["$from", me] }, "$to", "$from"] },
          lastMessage: { $first: "$$ROOT" },
          unreadCount: {
            $sum: {
              $cond: [
                { $and: [{ $eq: ["$to", me] }, { $ne: ["$status", "read"] }] },
                1, 0
              ]
            }
          }
        }
      },
      { $sort: { "lastMessage.createdAt": -1 } }
    ]);

    const contacts = await User.find({ username: { $in: chatInfo.map(c => c._id) } })
      .select("username firstName lastName avatar avatarColor presence lastSeen").lean();

    const online = req.app.get("onlineUsers") || new Map();
    const blocked = (await User.findOne({ username: me }).select("blocked").lean())?.blocked || [];

    const dmChats = chatInfo
      .filter(chat => !blocked.includes(chat._id))
      .map(chat => {
        const user = contacts.find(c => c.username === chat._id);
        return {
          type: "dm",
          username: chat._id,
          firstName: user?.firstName || "",
          lastName: user?.lastName || "",
          name: user?.firstName ? `${user.firstName} ${user.lastName || ""}`.trim() : chat._id,
          avatar: user?.avatar || "",
          avatarColor: user?.avatarColor || "#5e8ee7",
          online: user?.presence === "online",
          lastSeen: user?.lastSeen,
          lastMessage: chat.lastMessage.message || (chat.lastMessage.attachments?.length ? "📎 Вложение" : ""),
          lastMessageTime: chat.lastMessage.createdAt,
          lastMessageFrom: chat.lastMessage.from,
          lastMessageStatus: chat.lastMessage.status,
          unreadCount: chat.unreadCount || 0,
          archived: archived.includes(chat._id),
          pinned: pinned.includes(chat._id),
          muted: !!muteMap[chat._id],
          pinOrder: pinned.indexOf(chat._id)
        };
      });

    const groups = await Group.find({ "members.username": me }).lean();
    const groupChats = await Promise.all(groups.map(async (g) => {
      const lastMsg = await Message.findOne({ to: `group:${g._id}` })
        .sort({ createdAt: -1 }).lean();
      const unread = await Message.countDocuments({
        to: `group:${g._id}`,
        status: { $ne: "read" },
        from: { $ne: me }
      });
      const chatId = `group:${g._id}`;
      return {
        type: "group",
        _id: g._id,
        username: chatId,
        name: g.name,
        description: g.description,
        avatar: g.avatar,
        avatarColor: g.avatarColor,
        groupType: g.type,
        memberCount: g.members.length,
        myRole: g.members.find(m => m.username === me)?.role,
        lastMessage: lastMsg?.message || (lastMsg?.attachments?.length ? "📎 Вложение" : ""),
        lastMessageTime: lastMsg?.createdAt || g.createdAt,
        lastMessageFrom: lastMsg?.from,
        unreadCount: unread,
        archived: archived.includes(chatId),
        pinned: pinned.includes(chatId),
        muted: !!muteMap[chatId],
        pinOrder: pinned.indexOf(chatId)
      };
    }));

    const all = [...dmChats, ...groupChats];

    res.json({
      ok: true,
      chats: all,
      archiveCount: all.filter(c => c.archived).length,
      pinnedCount: pinned.length
    });
  } catch (err) {
    console.error("Get chats error:", err);
    res.json({ ok: false, chats: [] });
  }
});

router.post("/archive", authMiddleware, async (req, res) => {
  try {
    const { User } = getModels();
    const { chatId, archive = true } = req.body;
    const me = req.user.username;
    const settings = await getChatSettings(User, me);
    const archived = new Set(settings[ARCHIVE_KEY] || []);
    if (archive) archived.add(chatId); else archived.delete(chatId);
    settings[ARCHIVE_KEY] = [...archived];
    await setChatSettings(User, me, settings);
    res.json({ ok: true });
  } catch (err) {
    res.json({ ok: false });
  }
});

router.post("/pin", authMiddleware, async (req, res) => {
  try {
    const { User } = getModels();
    const { chatId, pin = true } = req.body;
    const me = req.user.username;
    const settings = await getChatSettings(User, me);
    const pinned = new Set(settings[PINNED_KEY] || []);
    if (pin) pinned.add(chatId); else pinned.delete(chatId);
    settings[PINNED_KEY] = [...pinned];
    await setChatSettings(User, me, settings);
    res.json({ ok: true });
  } catch (err) {
    res.json({ ok: false });
  }
});

router.post("/mute", authMiddleware, async (req, res) => {
  try {
    const { User } = getModels();
    const { chatId, mute = true, until = null } = req.body;
    const me = req.user.username;
    const settings = await getChatSettings(User, me);
    const mutes = settings.__mutes || {};
    if (mute) mutes[chatId] = until || "forever";
    else delete mutes[chatId];
    settings.__mutes = mutes;
    await setChatSettings(User, me, settings);
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
    let query;
    if (chatId.startsWith("group:")) {
      query = { to: chatId, attachments: { $exists: true, $ne: [] } };
    } else {
      query = {
        $or: [{ from: me, to: chatId }, { from: chatId, to: me }],
        attachments: { $exists: true, $ne: [] }
      };
    }
    const messages = await Message.find(query).sort({ createdAt: -1 }).limit(200).lean();
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

module.exports = router;
