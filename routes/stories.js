// Сторис
const express = require("express");
const router = express.Router();
const storiesRepo = require("../db/repos/stories");
const usersRepo = require("../db/repos/users");
const { authRequired } = require("../middleware/auth");

router.get("/feed", authRequired, async (req, res) => {
  const stories = await storiesRepo.getFeed(req.user.id);
  res.json({ ok: true, stories });
});

router.post("/", authRequired, async (req, res) => {
  const { type, mediaUrl, textCaption } = req.body || {};
  if (!type || !["image", "video"].includes(type)) {
    return res.status(400).json({ ok: false, error: "Неверный тип" });
  }
  if (!mediaUrl) return res.status(400).json({ ok: false, error: "Укажите mediaUrl" });
  const story = await storiesRepo.create({
    userId: req.user.id, type, mediaUrl, textCaption
  });
  res.json({ ok: true, story });
});

router.post("/:id/view", authRequired, async (req, res) => {
  const id = parseInt(req.params.id);
  const story = await storiesRepo.findById(id);
  if (!story) return res.status(404).json({ ok: false, error: "Не найдено" });
  await storiesRepo.markViewed(id, req.user.id);
  res.json({ ok: true });
});

router.get("/:id/viewers", authRequired, async (req, res) => {
  const id = parseInt(req.params.id);
  const story = await storiesRepo.findById(id);
  if (!story) return res.status(404).json({ ok: false });
  if (story.userId !== req.user.id) return res.status(403).json({ ok: false });
  const viewers = await storiesRepo.getViewers(id);
  res.json({ ok: true, viewers });
});

router.delete("/:id", authRequired, async (req, res) => {
  const id = parseInt(req.params.id);
  const ok = await storiesRepo.deleteStory(id, req.user.id);
  res.json({ ok });
});

module.exports = router;
