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

router.post("/create", authMiddleware, async (req, res) => {
  try {
    const { Group } = getModels();
    if (!Group) return res.status(503).json({ ok: false, error: "DB not ready" });

    const { name, members, type, description } = req.body;
    if (!name || !name.trim()) {
      return res.json({ ok: false, error: "Введите название группы" });
    }
    if (!members || !Array.isArray(members) || members.length === 0) {
      return res.json({ ok: false, error: "Добавьте участников" });
    }

    const allMembers = [{ username: req.user.username, role: "creator" }];
    for (const m of members) {
      if (m !== req.user.username) {
        allMembers.push({ username: m, role: type === "channel" ? "member" : "member" });
      }
    }

    const colors = ["#6366f1", "#8b5cf6", "#ec4899", "#f43f5e", "#f97316", "#eab308", "#22c55e", "#06b6d4", "#3b82f6"];
    const randomColor = colors[Math.floor(Math.random() * colors.length)];

    const group = await Group.create({
      name: name.trim(),
      avatar: "",
      avatarColor: randomColor,
      description: description || "",
      type: type || "group",
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
        .sort({ createdAt: -1 })
        .lean();
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
        lastMessage: lastMsg?.message || "",
        lastMessageTime: lastMsg?.createdAt || g.createdAt,
        unreadCount: unread
      };
    }));

    groupsWithMeta.sort((a, b) => new Date(b.lastMessageTime) - new Date(a.lastMessageTime));

    res.json({ ok: true, groups: groupsWithMeta });
  } catch (err) {
    console.error("My groups error:", err);
    res.json({ ok: false, groups: [] });
  }
});

router.get("/:id", authMiddleware, async (req, res) => {
  try {
    const { Group } = getModels();
    if (!Group) return res.status(503).json({ ok: false });
    const group = await Group.findById(req.params.id).lean();
    if (!group) return res.status(404).json({ ok: false, error: "Группа не найдена" });
    const isMember = group.members.some(m => m.username === req.user.username);
    if (!isMember) return res.status(403).json({ ok: false, error: "Вы не участник" });
    res.json({ ok: true, group });
  } catch (err) {
    res.status(500).json({ ok: false });
  }
});

router.post("/leave", authMiddleware, async (req, res) => {
  try {
    const { Group } = getModels();
    if (!Group) return res.status(503).json({ ok: false });
    const { groupId } = req.body;
    const group = await Group.findById(groupId);
    if (!group) return res.json({ ok: false, error: "Группа не найдена" });

    const idx = group.members.findIndex(m => m.username === req.user.username);
    if (idx === -1) return res.json({ ok: false, error: "Вы не участник" });

    if (group.members[idx].role === "creator") {
      await Group.deleteOne({ _id: groupId });
    } else {
      group.members.splice(idx, 1);
      await group.save();
    }

    // Уведомить остальных
    const io = req.app.get("io");
    if (io) {
      io.to(`group:${groupId}`).emit("group_updated", { groupId });
    }

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false });
  }
});

router.post("/add", authMiddleware, async (req, res) => {
  try {
    const { Group } = getModels();
    if (!Group) return res.status(503).json({ ok: false });
    const { groupId, username } = req.body;
    const group = await Group.findById(groupId);
    if (!group) return res.json({ ok: false, error: "Группа не найдена" });

    const member = group.members.find(m => m.username === req.user.username);
    if (!member || (member.role !== "creator" && member.role !== "admin")) {
      return res.json({ ok: false, error: "Нет прав" });
    }

    if (group.members.some(m => m.username === username)) {
      return res.json({ ok: false, error: "Уже участник" });
    }

    group.members.push({ username, role: "member" });
    await group.save();
    res.json({ ok: true, group: group.toObject() });
  } catch (err) {
    res.status(500).json({ ok: false });
  }
});

router.post("/remove", authMiddleware, async (req, res) => {
  try {
    const { Group } = getModels();
    if (!Group) return res.status(503).json({ ok: false });
    const { groupId, username } = req.body;
    const group = await Group.findById(groupId);
    if (!group) return res.json({ ok: false, error: "Группа не найдена" });

    const member = group.members.find(m => m.username === req.user.username);
    if (!member || (member.role !== "creator" && member.role !== "admin")) {
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

router.post("/update", authMiddleware, async (req, res) => {
  try {
    const { Group } = getModels();
    if (!Group) return res.status(503).json({ ok: false });
    const { groupId, name, description, avatar } = req.body;
    const group = await Group.findById(groupId);
    if (!group) return res.json({ ok: false, error: "Группа не найдена" });

    const member = group.members.find(m => m.username === req.user.username);
    if (!member || (member.role !== "creator" && member.role !== "admin")) {
      return res.json({ ok: false, error: "Нет прав" });
    }

    if (name) group.name = name;
    if (description !== undefined) group.description = description;
    if (avatar !== undefined) group.avatar = avatar;
    await group.save();

    res.json({ ok: true, group: group.toObject() });
  } catch (err) {
    res.status(500).json({ ok: false });
  }
});

module.exports = router;
