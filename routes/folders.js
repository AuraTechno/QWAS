const express = require("express");
const { authMiddleware } = require("../middleware/auth");

const router = express.Router();

function getModels() {
  try { return { Folder: require("../models/Folder") }; } catch { return { Folder: null }; }
}

router.get("/", authMiddleware, async (req, res) => {
  try {
    const { Folder } = getModels();
    if (!Folder) return res.json({ ok: true, folders: [] });
    const folders = await Folder.find({ owner: req.user.username }).sort({ order: 1 }).lean();
    res.json({ ok: true, folders });
  } catch (err) {
    res.json({ ok: false, folders: [] });
  }
});

router.post("/", authMiddleware, async (req, res) => {
  try {
    const { Folder } = getModels();
    if (!Folder) return res.status(503).json({ ok: false });
    const { title, icon = "folder", color = "#5e8ee7", chatIds = [] } = req.body;
    if (!title) return res.json({ ok: false, error: "Введите название" });
    const count = await Folder.countDocuments({ owner: req.user.username });
    if (count >= 10) return res.json({ ok: false, error: "Максимум 10 папок" });
    const folder = await Folder.create({ owner: req.user.username, title, icon, color, chatIds, order: count });
    res.json({ ok: true, folder });
  } catch (err) {
    res.json({ ok: false });
  }
});

router.put("/:id", authMiddleware, async (req, res) => {
  try {
    const { Folder } = getModels();
    const f = await Folder.findById(req.params.id);
    if (!f || f.owner !== req.user.username) return res.json({ ok: false });
    const { title, icon, color, chatIds } = req.body;
    if (title !== undefined) f.title = title;
    if (icon !== undefined) f.icon = icon;
    if (color !== undefined) f.color = color;
    if (chatIds !== undefined) f.chatIds = chatIds;
    await f.save();
    res.json({ ok: true, folder: f.toObject() });
  } catch (err) {
    res.json({ ok: false });
  }
});

router.delete("/:id", authMiddleware, async (req, res) => {
  try {
    const { Folder } = getModels();
    const f = await Folder.findById(req.params.id);
    if (!f || f.owner !== req.user.username) return res.json({ ok: false });
    await Folder.deleteOne({ _id: req.params.id });
    res.json({ ok: true });
  } catch (err) {
    res.json({ ok: false });
  }
});

module.exports = router;
