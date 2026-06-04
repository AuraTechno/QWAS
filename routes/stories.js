const express = require("express");
const { authMiddleware } = require("../middleware/auth");

const router = express.Router();

function getModels() {
  try {
    return { User: require("../models/User"), Story: require("../models/Story") };
  } catch {
    return { User: null, Story: null };
  }
}

router.post("/create", authMiddleware, async (req, res) => {
  try {
    const { Story } = getModels();
    if (!Story) return res.status(503).json({ ok: false });
    const { type = "text", content = "", mediaUrl = "", backgroundColor = "#5e8ee7" } = req.body;
    if (type === "text" && !content.trim()) return res.json({ ok: false, error: "Пустой текст" });
    const story = await Story.create({ author: req.user.username, type, content, mediaUrl, backgroundColor });
    res.json({ ok: true, story: story.toObject() });
  } catch (err) {
    res.json({ ok: false, error: "Ошибка создания" });
  }
});

router.get("/feed", authMiddleware, async (req, res) => {
  try {
    const { Story, User } = getModels();
    if (!Story) return res.json({ ok: true, stories: [] });

    const me = await User.findOne({ username: req.user.username }).select("contacts").lean();
    const allowedAuthors = [...(me?.contacts || []), req.user.username];

    const stories = await Story.find({ author: { $in: allowedAuthors } })
      .sort({ createdAt: -1 }).lean();

    const grouped = {};
    for (const s of stories) {
      if (!grouped[s.author]) grouped[s.author] = [];
      grouped[s.author].push(s);
    }
    res.json({ ok: true, stories: grouped });
  } catch (err) {
    res.json({ ok: false, stories: {} });
  }
});

router.post("/:id/view", authMiddleware, async (req, res) => {
  try {
    const { Story } = getModels();
    await Story.updateOne({ _id: req.params.id }, { $addToSet: { views: req.user.username } });
    res.json({ ok: true });
  } catch (err) {
    res.json({ ok: false });
  }
});

router.delete("/:id", authMiddleware, async (req, res) => {
  try {
    const { Story } = getModels();
    const s = await Story.findById(req.params.id);
    if (!s) return res.json({ ok: false });
    if (s.author !== req.user.username) return res.json({ ok: false, error: "Нет прав" });
    await Story.deleteOne({ _id: req.params.id });
    res.json({ ok: true });
  } catch (err) {
    res.json({ ok: false });
  }
});

module.exports = router;
