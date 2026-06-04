const express = require("express");
const { authMiddleware } = require("../middleware/auth");
const { emitGroupChatList } = require("../socket/handlers");

const router = express.Router();

function getModels() {
  try {
    return { User: require("../models/User"), Message: require("../models/Message"), Group: require("../models/Group") };
  } catch {
    return { User: null, Message: null, Group: null };
  }
}

const AVATAR_COLORS = ["#5e8ee7", "#8e44ad", "#e91e63", "#e74c3c", "#ff9800", "#f1c40f", "#27ae60", "#16a085", "#3498db"];

router.post("/create", authMiddleware, async (req, res) => {
  try {
    const { Group } = getModels();
    if (!Group) return res.status(503).json({ ok: false, error: "DB not ready" });

    const { name, members, type, description, isPublic, username } = req.body;
    if (!name || !name.trim()) return res.json({ ok: false, error: "Введите название" });
    if (!members || !Array.isArray(members)) return res.json({ ok: false, error: "Добавьте участников" });

    const uniqueMembers = [...new Set([req.user.username, ...members])];
    const allMembers = uniqueMembers.map((u, i) => ({
      username: u,
      role: i === 0 ? "creator" : "member"
    }));

    const randomColor = AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];

    const group = await Group.create({
      name: name.trim(),
      avatar: "",
      avatarColor: randomColor,
      description: description || "",
      type: type === "channel" ? "channel" : "group",
      isPublic: !!isPublic,
      username: username || "",
      members: allMembers,
      createdBy: req.user.username
    });

    res.json({ ok: true, group: group.toObject() });
  } catch (err) {
    console.error("Create group error:", err);
    res.json({ ok: false, error: "Ошибка создания группы" });
  }
});

router.get("/my", authMiddleware, async (req, res) => {
  try {
    const { Group, Message } = getModels();
    if (!Group) return res.json({ ok: false, groups: [] });

    const groups = await Group.find({ "members.username": req.user.username }).lean();

    const groupsWithMeta = await Promise.all(groups.map(async (g) => {
      const lastMsg = await Message.findOne({ to: `group:${g._id}` })
        .sort({ createdAt: -1 }).lean();
      const unread = await Message.countDocuments({
        to: `group:${g._id}`,
        status: { $ne: "read" },
        from: { $ne: req.user.username }
      });
      return {
        _id: g._id,
        name: g.name,
        avatar: g.avatar,
        avatarColor: g.avatarColor,
        description: g.description,
        type: g.type,
        memberCount: g.members.length,
        myRole: g.members.find(m => m.username === req.user.username)?.role,
        lastMessage: lastMsg?.message || (lastMsg?.attachments?.length ? "📎 Вложение" : ""),
        lastMessageTime: lastMsg?.createdAt || g.createdAt,
        unreadCount: unread
      };
    }));

    groupsWithMeta.sort((a, b) => new Date(b.lastMessageTime) - new Date(a.lastMessageTime));
    res.json({ ok: true, groups: groupsWithMeta });
  } catch (err) {
    res.json({ ok: false, groups: [] });
  }
});

router.get("/:id", authMiddleware, async (req, res) => {
  try {
    const { Group, User } = getModels();
    if (!Group) return res.status(503).json({ ok: false });
    const group = await Group.findById(req.params.id).lean();
    if (!group) return res.status(404).json({ ok: false, error: "Группа не найдена" });
    const isMember = group.members.some(m => m.username === req.user.username);
    if (!isMember) return res.status(403).json({ ok: false, error: "Вы не участник" });

    const usernames = group.members.map(m => m.username);
    const users = await User.find({ username: { $in: usernames } })
      .select("username firstName lastName avatar avatarColor presence lastSeen")
      .lean();
    const byUsername = Object.fromEntries(users.map(u => [u.username, u]));
    const members = group.members.map(m => ({ ...m, ...(byUsername[m.username] || {}) }));

    res.json({ ok: true, group: { ...group, members } });
  } catch (err) {
    res.status(500).json({ ok: false });
  }
});

router.post("/leave", authMiddleware, async (req, res) => {
  try {
    const { Group } = getModels();
    const { groupId } = req.body;
    const group = await Group.findById(groupId);
    if (!group) return res.json({ ok: false, error: "Группа не найдена" });

    const idx = group.members.findIndex(m => m.username === req.user.username);
    if (idx === -1) return res.json({ ok: false, error: "Вы не участник" });

    if (group.members[idx].role === "creator") {
      if (group.members.length > 1) {
        const remaining = group.members.filter((_, i) => i !== idx);
        const newCreator = remaining.find(m => m.role === "admin") || remaining[0];
        newCreator.role = "creator";
        const newMembers = remaining.map(m => m.username === newCreator.username ? newCreator : m);
        group.members = newMembers;
        await group.save();
      } else {
        await Group.deleteOne({ _id: groupId });
      }
    } else {
      group.members.splice(idx, 1);
      await group.save();
    }

    const io = req.app.get("io");
    if (io) io.to(`group:${groupId}`).emit("group_updated", { groupId });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false });
  }
});

router.post("/add", authMiddleware, async (req, res) => {
  try {
    const { Group } = getModels();
    const { groupId, username } = req.body;
    if (!groupId || !username) return res.json({ ok: false, error: "Нет данных" });

    const group = await Group.findById(groupId);
    if (!group) return res.json({ ok: false, error: "Группа не найдена" });

    const member = group.members.find(m => m.username === req.user.username);
    if (!member || !["creator", "admin"].includes(member.role)) {
      return res.json({ ok: false, error: "Нет прав" });
    }

    if (group.members.some(m => m.username === username)) {
      return res.json({ ok: false, error: "Уже участник" });
    }

    group.members.push({ username, role: "member" });
    await group.save();

    const io = req.app.get("io");
    if (io) {
      io.to(`group:${groupId}`).emit("group_updated", { groupId });
      io.to(`group:${groupId}`).emit("system_message", { groupId, text: `${username} добавлен(а) в группу` });
    }
    res.json({ ok: true, group: group.toObject() });
  } catch (err) {
    res.status(500).json({ ok: false });
  }
});

router.post("/remove", authMiddleware, async (req, res) => {
  try {
    const { Group } = getModels();
    const { groupId, username } = req.body;
    const group = await Group.findById(groupId);
    if (!group) return res.json({ ok: false, error: "Группа не найдена" });

    const member = group.members.find(m => m.username === req.user.username);
    if (!member || !["creator", "admin"].includes(member.role)) {
      return res.json({ ok: false, error: "Нет прав" });
    }

    const targetIdx = group.members.findIndex(m => m.username === username);
    if (targetIdx === -1) return res.json({ ok: false, error: "Не найден" });
    if (group.members[targetIdx].role === "creator") {
      return res.json({ ok: false, error: "Нельзя удалить создателя" });
    }

    group.members.splice(targetIdx, 1);
    await group.save();
    res.json({ ok: true, group: group.toObject() });
  } catch (err) {
    res.status(500).json({ ok: false });
  }
});

router.post("/promote", authMiddleware, async (req, res) => {
  try {
    const { Group } = getModels();
    const { groupId, username, role } = req.body;
    const group = await Group.findById(groupId);
    if (!group) return res.json({ ok: false });

    const me = group.members.find(m => m.username === req.user.username);
    if (!me || me.role !== "creator") return res.json({ ok: false, error: "Только создатель" });

    const target = group.members.find(m => m.username === username);
    if (!target) return res.json({ ok: false, error: "Не найден" });

    if (target.role === "creator") return res.json({ ok: false, error: "Нельзя изменить создателя" });
    target.role = role === "admin" ? "admin" : "member";
    await group.save();
    res.json({ ok: true, group: group.toObject() });
  } catch (err) {
    res.status(500).json({ ok: false });
  }
});

router.post("/update", authMiddleware, async (req, res) => {
  try {
    const { Group } = getModels();
    const { groupId, name, description, avatar, avatarColor, slowModeSeconds } = req.body;
    const group = await Group.findById(groupId);
    if (!group) return res.json({ ok: false, error: "Группа не найдена" });

    const member = group.members.find(m => m.username === req.user.username);
    if (!member || !["creator", "admin"].includes(member.role)) {
      return res.json({ ok: false, error: "Нет прав" });
    }

    if (name !== undefined) group.name = name;
    if (description !== undefined) group.description = description;
    if (avatar !== undefined) group.avatar = avatar;
    if (avatarColor !== undefined) group.avatarColor = avatarColor;
    if (slowModeSeconds !== undefined) group.slowModeSeconds = slowModeSeconds;
    await group.save();

    const io = req.app.get("io");
    if (io) io.to(`group:${groupId}`).emit("group_updated", { groupId });
    res.json({ ok: true, group: group.toObject() });
  } catch (err) {
    res.status(500).json({ ok: false });
  }
});

router.post("/pin", authMiddleware, async (req, res) => {
  try {
    const { Group, Message } = getModels();
    const { groupId, messageId, pin = true } = req.body;
    const group = await Group.findById(groupId);
    if (!group) return res.json({ ok: false });

    const me = group.members.find(m => m.username === req.user.username);
    if (!me || !["creator", "admin"].includes(me.role)) {
      return res.json({ ok: false, error: "Нет прав" });
    }
    if (pin) {
      const msg = await Message.findById(messageId);
      if (!msg) return res.json({ ok: false, error: "Сообщение не найдено" });
      group.pinnedMessage = messageId;
    } else {
      group.pinnedMessage = null;
    }
    await group.save();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false });
  }
});

router.delete("/:id", authMiddleware, async (req, res) => {
  try {
    const { Group, Message } = getModels();
    const group = await Group.findById(req.params.id);
    if (!group) return res.json({ ok: false });
    if (group.createdBy !== req.user.username) {
      return res.json({ ok: false, error: "Только создатель может удалить" });
    }
    await Group.deleteOne({ _id: req.params.id });
    await Message.deleteMany({ to: `group:${req.params.id}` });
    const io = req.app.get("io");
    if (io) io.to(`group:${req.params.id}`).emit("group_deleted", { groupId: req.params.id });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false });
  }
});

module.exports = router;
