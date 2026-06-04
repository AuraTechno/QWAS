const { Types } = require("mongoose");
const Chat = require("../models/Chat");
const Message = require("../models/Message");
const User = require("../models/User");
const Group = require("../models/Group");
const cache = require("./cache");

function convIdDM(a, b) {
  return [a, b].sort().join(":");
}

function isGroupChat(to) {
  return typeof to === "string" && to.startsWith("group:");
}

function getGroupId(to) {
  return to.startsWith("group:") ? to.slice(6) : null;
}

function extractText(m) {
  if (m.message) return m.message;
  if (m.attachments?.length) {
    const a = m.attachments[0];
    if (a.type === "image") return "📷 Фото";
    if (a.type === "video") return "🎥 Видео";
    if (a.type === "voice") return "🎤 Голосовое";
    if (a.type === "round") return "⭕ Видеосообщение";
    if (a.type === "audio") return "🎵 Аудио";
    if (a.type === "file") return `📎 ${a.name || "Файл"}`;
    if (a.type === "location") return "📍 Местоположение";
    return "📎 Вложение";
  }
  return "";
}

async function invalidateOwner(owner) {
  cache.delByPrefix(`chatlist:${owner}:`);
  cache.del(`chatlist:${owner}`);
}

async function touchChat(owner, otherUser, type, lastMessage, isFromMe) {
  const chatId = type === "favorites" ? "favorites" : convIdDM(owner, otherUser);
  try {
    const update = {
      lastMessageId: lastMessage._id,
      lastMessageFrom: lastMessage.from,
      lastMessageText: extractText(lastMessage),
      lastMessageHasAttachment: !!lastMessage.attachments?.length,
      lastMessageType: lastMessage.attachments?.[0]?.type || "text",
      lastMessageAt: lastMessage.createdAt,
      type
    };
    if (type === "dm") update.otherUser = otherUser;
    if (isFromMe) {
      update.unreadCount = 0;
    } else {
      update.$inc = { unreadCount: 1 };
    }
    const op = update.$inc
      ? { $set: { ...update.$set, type, owner, chatId, otherUser: otherUser || null, archived: false, pinned: false }, $inc: update.$inc, $setOnInsert: { createdAt: new Date() } }
      : { $set: { ...update, type, owner, chatId, otherUser: otherUser || null, archived: false, pinned: false }, $setOnInsert: { createdAt: new Date() } };
    delete op.$set.$inc;
    await Chat.updateOne({ owner, chatId }, op, { upsert: true });
  } catch (e) {
    console.error("touchChat error:", e.message);
  }
  await invalidateOwner(owner);
}

async function bumpUnread(owner, from) {
  try {
    const chatId = convIdDM(owner, from);
    const r = await Chat.updateOne(
      { owner, chatId },
      { $inc: { unreadCount: 1 }, $set: { lastMessageAt: new Date() } }
    );
    if (r.matchedCount === 0) {
      await touchChat(owner, from, "dm", { _id: null, from, message: "", attachments: [], createdAt: new Date() }, false);
    } else {
      await invalidateOwner(owner);
    }
  } catch (e) {
    console.error("bumpUnread error:", e.message);
  }
}

async function markRead(owner, from) {
  try {
    const chatId = convIdDM(owner, from);
    await Chat.updateOne({ owner, chatId }, { $set: { unreadCount: 0 } });
    await invalidateOwner(owner);
  } catch (e) {
    console.error("markRead error:", e.message);
  }
}

async function getFastChatList(owner) {
  const key = `chatlist:${owner}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const [chats, groups] = await Promise.all([
    Chat.find({ owner, archived: { $ne: true } })
      .sort({ pinned: -1, pinOrder: -1, lastMessageAt: -1 })
      .limit(200)
      .lean(),
    Group.find({ "members.username": owner }).select("_id name avatar avatarColor description type members createdBy createdAt").lean()
  ]);

  const dmChats = chats.filter(c => c.type === "dm" && c.otherUser);
  const favChat = chats.find(c => c.type === "favorites");
  const usernames = dmChats.map(c => c.otherUser).filter(Boolean);

  const users = usernames.length
    ? await User.find({ username: { $in: usernames } })
        .select("username firstName lastName bio avatar avatarColor presence lastSeen")
        .lean()
    : [];
  const userMap = Object.fromEntries(users.map(u => [u.username, u]));

  const groupIds = groups.map(g => g._id);
  let lastByGroup = new Map();
  if (groupIds.length) {
    const lastMsgs = await Message.aggregate([
      { $match: { conversationId: { $in: groupIds.map(id => `g:${id}`) } } },
      { $sort: { createdAt: -1 } },
      { $group: { _id: "$conversationId", m: { $first: "$$ROOT" } } }
    ]);
    for (const l of lastMsgs) lastByGroup.set(l._id, l.m);
  }

  const dmList = dmChats.map(c => {
    const u = userMap[c.otherUser] || {};
    return {
      type: "dm",
      username: c.otherUser,
      name: u.firstName ? `${u.firstName} ${u.lastName || ""}`.trim() : c.otherUser,
      firstName: u.firstName || "",
      lastName: u.lastName || "",
      avatar: u.avatar || "",
      avatarColor: u.avatarColor || "#5e8ee7",
      online: u.presence === "online",
      lastSeen: u.lastSeen,
      lastMessage: c.lastMessageText || "",
      lastMessageTime: c.lastMessageAt,
      lastMessageFrom: c.lastMessageFrom,
      unreadCount: c.unreadCount || 0,
      pinned: c.pinned,
      pinOrder: c.pinOrder,
      muted: c.muted
    };
  });

  const groupList = groups.map(g => {
    const lm = lastByGroup.get(`g:${g._id}`);
    const chatId = `group:${g._id}`;
    return {
      type: "group",
      _id: g._id,
      username: chatId,
      name: g.name,
      avatar: g.avatar,
      avatarColor: g.avatarColor,
      description: g.description,
      groupType: g.type,
      memberCount: g.members.length,
      myRole: g.members.find(m => m.username === owner)?.role,
      lastMessage: lm ? extractText(lm) : "",
      lastMessageTime: lm?.createdAt || g.createdAt,
      lastMessageFrom: lm?.from,
      unreadCount: 0,
      pinned: false,
      muted: false
    };
  });

  let fav = null;
  if (favChat) {
    fav = {
      type: "favorites",
      username: "favorites",
      name: "Избранное",
      avatar: "",
      avatarColor: "#5e8ee7",
      lastMessage: favChat.lastMessageText || "",
      lastMessageTime: favChat.lastMessageAt,
      lastMessageFrom: favChat.lastMessageFrom,
      unreadCount: 0,
      pinned: false
    };
  }

  const all = [fav, ...dmList, ...groupList].filter(Boolean);
  cache.set(key, all, 5000);
  return all;
}

async function getHistoryFast(owner, chatId, before, limit = 30) {
  const key = `history:${owner}:${chatId}:${before ? before.toISOString() : "first"}:${limit}`;
  const cached = cache.get(key);
  if (cached) return cached;

  let convId;
  let convType;
  if (chatId === "favorites") {
    convId = `favorites:${owner}`;
    convType = "favorites";
  } else if (isGroupChat(chatId)) {
    convId = `g:${getGroupId(chatId)}`;
    convType = "group";
  } else {
    convId = convIdDM(owner, chatId);
    convType = "dm";
  }

  const query = { conversationId: convId };
  if (before) query.createdAt = { $lt: before };

  const msgs = await Message.find(query)
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();

  const hasMore = msgs.length === limit;
  const result = { messages: msgs.reverse(), hasMore, convType };
  cache.set(key, result, 1000);
  return result;
}

async function searchMessages(owner, q, limit = 50) {
  if (!q || q.length < 2) return [];
  const cacheKey = `search:m:${owner}:${q}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const results = await Message.find(
    { $text: { $search: q }, $or: [{ from: owner }, { to: owner }] },
    { score: { $meta: "textScore" } }
  )
    .sort({ score: { $meta: "textScore" }, createdAt: -1 })
    .limit(limit)
    .lean();

  cache.set(cacheKey, results, 30000);
  return results;
}

async function searchUsers(q, limit = 30) {
  if (!q) return [];
  const cacheKey = `search:u:${q}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const re = new RegExp("^" + q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
  const results = await User.find({
    $or: [{ username: re }, { firstName: re }, { lastName: re }]
  })
    .select("username firstName lastName avatar avatarColor presence")
    .limit(limit)
    .lean();
  cache.set(cacheKey, results, 60000);
  return results;
}

async function setArchived(owner, chatId, archived) {
  await Chat.updateOne({ owner, chatId }, { $set: { archived } });
  await invalidateOwner(owner);
}

async function setPinned(owner, chatId, pinned, pinOrder = 0) {
  await Chat.updateOne({ owner, chatId }, { $set: { pinned, pinOrder } });
  await invalidateOwner(owner);
}

async function setMuted(owner, chatId, muted, mutedUntil = null) {
  await Chat.updateOne({ owner, chatId }, { $set: { muted, mutedUntil } });
  await invalidateOwner(owner);
}

module.exports = {
  convIdDM,
  isGroupChat,
  getGroupId,
  extractText,
  touchChat,
  bumpUnread,
  markRead,
  getFastChatList,
  getHistoryFast,
  searchMessages,
  searchUsers,
  setArchived,
  setPinned,
  setMuted,
  invalidateOwner
};
