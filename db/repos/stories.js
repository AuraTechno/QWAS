// Сторис
const db = require("../pg");
const config = require("../../config");

function rowToStory(row) {
  if (!row) return null;
  return {
    id: db.bigintToNum(row.id),
    userId: db.bigintToNum(row.user_id),
    username: row.username,
    firstName: row.first_name,
    lastName: row.last_name,
    avatarUrl: row.avatar_url,
    type: row.type,
    mediaUrl: row.media_url,
    textCaption: row.text_caption,
    viewsCount: row.views_count,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    isViewed: row.is_viewed || false
  };
}

async function create({ userId, type, mediaUrl, textCaption }) {
  const expiresAt = new Date(Date.now() + config.STORY_TTL_HOURS * 60 * 60 * 1000);
  const res = await db.query(
    `INSERT INTO stories (user_id, type, media_url, text_caption, expires_at)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [userId, type, mediaUrl, textCaption || null, expiresAt]
  );
  return rowToStory(res.rows[0]);
}

async function getFeed(viewerId) {
  const res = await db.query(
    `SELECT s.*,
       u.username, u.first_name, u.last_name, u.avatar_url,
       EXISTS(SELECT 1 FROM story_views sv WHERE sv.story_id = s.id AND sv.user_id = $1) AS is_viewed
     FROM stories s
     JOIN users u ON u.id = s.user_id
     WHERE s.expires_at > NOW()
     ORDER BY s.user_id = $1 DESC, s.created_at DESC`,
    [viewerId]
  );
  return res.rows.map(rowToStory);
}

async function findById(id) {
  const res = await db.query(
    `SELECT s.*, u.username, u.first_name, u.last_name, u.avatar_url
     FROM stories s JOIN users u ON u.id = s.user_id
     WHERE s.id = $1`,
    [id]
  );
  return rowToStory(res.rows[0]);
}

async function markViewed(storyId, userId) {
  await db.query(
    `INSERT INTO story_views (story_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [storyId, userId]
  );
  await db.query(`UPDATE stories SET views_count = views_count + 1 WHERE id = $1`, [storyId]);
}

async function getViewers(storyId) {
  const res = await db.query(
    `SELECT u.id, u.username, u.first_name, u.last_name, u.avatar_url, sv.viewed_at
     FROM story_views sv JOIN users u ON u.id = sv.user_id
     WHERE sv.story_id = $1
     ORDER BY sv.viewed_at DESC`,
    [storyId]
  );
  return res.rows.map(r => ({
    id: db.bigintToNum(r.id),
    username: r.username,
    firstName: r.first_name,
    lastName: r.last_name,
    avatarUrl: r.avatar_url,
    viewedAt: r.viewed_at
  }));
}

async function deleteExpired() {
  const res = await db.query(`DELETE FROM stories WHERE expires_at <= NOW() RETURNING id`);
  return res.rows.length;
}

async function deleteStory(id, userId) {
  const res = await db.query(
    `DELETE FROM stories WHERE id = $1 AND user_id = $2 RETURNING id`,
    [id, userId]
  );
  return res.rows.length > 0;
}

module.exports = {
  create, getFeed, findById, markViewed, getViewers, deleteExpired, deleteStory,
  rowToStory
};
