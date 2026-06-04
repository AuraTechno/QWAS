// Уведомления
const db = require("../pg");

function rowToNotification(row) {
  if (!row) return null;
  return {
    id: db.bigintToNum(row.id),
    type: row.type,
    chatId: db.bigintToNum(row.chat_id),
    fromId: db.bigintToNum(row.from_id),
    fromUsername: row.from_username,
    fromFirstName: row.from_first_name,
    fromLastName: row.from_last_name,
    fromAvatarUrl: row.from_avatar_url,
    payload: row.payload || {},
    isRead: row.is_read,
    readAt: row.read_at,
    createdAt: row.created_at
  };
}

async function create({ userId, type, chatId, fromId, payload }) {
  const res = await db.query(
    `INSERT INTO notifications (user_id, type, chat_id, from_id, payload)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [userId, type, chatId || null, fromId || null, JSON.stringify(payload || {})]
  );
  return rowToNotification(res.rows[0]);
}

async function getForUser(username, { limit = 50 } = {}) {
  const res = await db.query(
    `SELECT n.*,
       u.username AS from_username, u.first_name AS from_first_name,
       u.last_name AS from_last_name, u.avatar_url AS from_avatar_url
     FROM notifications n
     LEFT JOIN users u ON u.id = n.from_id
     WHERE n.user_id = (SELECT id FROM users WHERE username = $1)
     ORDER BY n.created_at DESC
     LIMIT $2`,
    [username, limit]
  );
  return res.rows.map(rowToNotification);
}

async function getUnreadCount(username) {
  const res = await db.query(
    `SELECT COUNT(*) AS c FROM notifications
     WHERE user_id = (SELECT id FROM users WHERE username = $1) AND NOT is_read`,
    [username]
  );
  return parseInt(res.rows[0]?.c || 0);
}

async function markRead(username, ids = null) {
  if (ids && ids.length) {
    await db.query(
      `UPDATE notifications SET is_read = TRUE, read_at = NOW()
       WHERE user_id = (SELECT id FROM users WHERE username = $1)
         AND id = ANY($2::bigint[])`,
      [username, ids]
    );
  } else {
    await db.query(
      `UPDATE notifications SET is_read = TRUE, read_at = NOW()
       WHERE user_id = (SELECT id FROM users WHERE username = $1) AND NOT is_read`,
      [username]
    );
  }
}

async function markAllRead(username) {
  await db.query(
    `UPDATE notifications SET is_read = TRUE, read_at = NOW()
     WHERE user_id = (SELECT id FROM users WHERE username = $1) AND NOT is_read`,
    [username]
  );
}

module.exports = {
  create, getForUser, getUnreadCount, markRead, markAllRead,
  rowToNotification
};
