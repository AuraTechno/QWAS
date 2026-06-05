// Репозиторий сообщений
const db = require("../pg");

function rowToMessage(row) {
  if (!row) return null;
  return {
    id: db.bigintToNum(row.id),
    chatId: db.bigintToNum(row.chat_id),
    fromId: db.bigintToNum(row.from_id),
    fromUsername: row.from_username || row.fromUsername,
    fromFirstName: row.from_first_name,
    fromLastName: row.from_last_name,
    fromAvatarUrl: row.from_avatar_url,
    text: row.text,
    type: row.type,
    attachments: row.attachments || [],
    replyToId: db.bigintToNum(row.reply_to_id),
    replySnapshot: row.reply_snapshot,
    mentions: (row.mentions || []).map(db.bigintToNum),
    forwardedFromId: db.bigintToNum(row.forwarded_from_id),
    forwardedFromChatId: db.bigintToNum(row.forwarded_from_chat_id),
    forwardedFromName: row.forwarded_from_name,
    pollData: row.poll_data,
    locationData: row.location_data,
    contactData: row.contact_data,
    isEdited: row.is_edited,
    editedAt: row.edited_at,
    isDeleted: row.is_deleted,
    viewsCount: row.views_count,
    createdAt: row.created_at,
    reactions: row.reactions || null,
    deliveredCount: row.delivered_count !== undefined ? parseInt(row.delivered_count) : undefined
  };
}

const BASE_SELECT = `
  SELECT m.*,
    u.username AS from_username, u.first_name AS from_first_name,
    u.last_name AS from_last_name, u.avatar_url AS from_avatar_url
  FROM messages m
  JOIN users u ON u.id = m.from_id
`;

/**
 * Создать сообщение. Триггер автоматически обновит user_chats.
 */
async function create({ chatId, fromId, text, type = "text", attachments = [], replyToId = null, replySnapshot = null, mentions = [], forwardedFromId = null, forwardedFromChatId = null, forwardedFromName = null, pollData = null, locationData = null, contactData = null }) {
  const res = await db.query(
    `INSERT INTO messages (
       chat_id, from_id, text, type, attachments, reply_to_id, reply_snapshot, mentions,
       forwarded_from_id, forwarded_from_chat_id, forwarded_from_name,
       poll_data, location_data, contact_data
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
     RETURNING id, created_at`,
    [chatId, fromId, text, type, JSON.stringify(attachments), replyToId, replySnapshot ? JSON.stringify(replySnapshot) : null, mentions, forwardedFromId, forwardedFromChatId, forwardedFromName, pollData ? JSON.stringify(pollData) : null, locationData ? JSON.stringify(locationData) : null, contactData ? JSON.stringify(contactData) : null]
  );
  return await findById(db.bigintToNum(res.rows[0].id));
}

async function findById(id) {
  const res = await db.query(
    BASE_SELECT.replace("SELECT m.*,", "SELECT m.*,") + " WHERE m.id = $1",
    [id]
  );
  return rowToMessage(res.rows[0]);
}

/**
 * История чата (cursor pagination) + реакции одним запросом (LATERAL JOIN).
 * До 30 самых новых сообщений до указанного ID.
 */
async function getHistory(chatId, { beforeId = null, limit = 30 } = {}) {
  let where = `m.chat_id = $1 AND NOT m.is_deleted`;
  const params = [chatId];
  if (beforeId) {
    params.push(beforeId);
    where += ` AND m.id < $${params.length}`;
  }
  params.push(limit);
  const res = await db.query(
    `${BASE_SELECT}
     LEFT JOIN LATERAL (
       SELECT jsonb_object_agg(r.emoji, r.users) AS reactions
       FROM (
         SELECT emoji, jsonb_agg(user_id ORDER BY created_at) AS users
         FROM reactions
         WHERE message_id = m.id
         GROUP BY emoji
       ) r
     ) rr ON TRUE
     WHERE ${where}
     ORDER BY m.id DESC LIMIT $${params.length}`,
    params
  );
  return res.rows.map(rowToMessage).reverse();
}

/**
 * Получить сообщение по ID.
 */
async function getById(messageId) {
  const res = await db.query(
    `${BASE_SELECT} WHERE m.id = $1 LIMIT 1`,
    [messageId]
  );
  return res.rows[0] ? rowToMessage(res.rows[0]) : null;
}

/**
 * Сообщения вокруг указанного (для перехода по поиску).
 */
async function getAround(chatId, messageId, { before = 15, after = 15 } = {}) {
  const beforeRes = await db.query(
    `${BASE_SELECT}
     WHERE m.chat_id = $1 AND m.id <= $2 AND NOT m.is_deleted
     ORDER BY m.id DESC LIMIT $3`,
    [chatId, messageId, before + 1]
  );
  const afterRes = await db.query(
    `${BASE_SELECT}
     WHERE m.chat_id = $1 AND m.id > $2 AND NOT m.is_deleted
     ORDER BY m.id ASC LIMIT $3`,
    [chatId, messageId, after]
  );
  return [
    ...beforeRes.rows.map(rowToMessage).reverse(),
    ...afterRes.rows.map(rowToMessage)
  ];
}

/**
 * Медиа-вложения чата (для вкладки "Медиа").
 */
async function getMedia(chatId, { type = null, limit = 60, beforeId = null } = {}) {
  const params = [chatId];
  let where = `m.chat_id = $1 AND NOT m.is_deleted AND m.type IN ('image', 'video', 'file', 'voice', 'round')`;
  if (type) {
    params.push(type);
    where += ` AND m.type = $${params.length}`;
  }
  if (beforeId) {
    params.push(beforeId);
    where += ` AND m.id < $${params.length}`;
  }
  params.push(limit);
  const res = await db.query(
    `${BASE_SELECT} WHERE ${where} ORDER BY m.id DESC LIMIT $${params.length}`,
    params
  );
  return res.rows.map(rowToMessage);
}

async function edit(id, fromId, text) {
  const res = await db.query(
    `UPDATE messages SET text = $3, is_edited = TRUE, edited_at = NOW()
     WHERE id = $1 AND from_id = $2 AND NOT is_deleted
     RETURNING id`,
    [id, fromId, text]
  );
  if (!res.rows.length) return null;
  return await findById(id);
}

async function softDelete(id, fromId) {
  await db.query(
    `UPDATE messages SET is_deleted = TRUE, deleted_at = NOW(), text = NULL, attachments = '[]'::jsonb
     WHERE id = $1 AND from_id = $2`,
    [id, fromId]
  );
}

async function search(chatId, q, { limit = 50, beforeId = null } = {}) {
  if (!q || !q.trim()) return [];
  const term = `%${q.trim()}%`;
  const params = [chatId, term, q.trim(), limit];
  let where = `m.chat_id = $1 AND NOT m.is_deleted AND m.text ILIKE $2`;
  if (beforeId) {
    params.push(beforeId);
    where += ` AND m.id < $${params.length}`;
  }
  const res = await db.query(
    `${BASE_SELECT}
     WHERE ${where}
     ORDER BY
       CASE WHEN m.text ILIKE $3 THEN 0 ELSE 1 END,
       similarity(m.text, $3) DESC,
       m.id DESC
     LIMIT $${params.length - 1}`,
    params
  );
  return res.rows.map(rowToMessage);
}

async function globalSearch(q, { limit = 50 } = {}) {
  if (!q || !q.trim()) return [];
  const term = q.trim();
  const res = await db.query(
    `${BASE_SELECT}
     WHERE NOT m.is_deleted
       AND (m.text ILIKE $1 OR m.text % $2)
     ORDER BY similarity(m.text, $2) DESC, m.id DESC
     LIMIT $3`,
    [`%${term}%`, term, limit]
  );
  return res.rows.map(rowToMessage);
}

async function addReaction(messageId, userId, emoji) {
  await db.query(
    `INSERT INTO reactions (message_id, user_id, emoji) VALUES ($1, $2, $3)
     ON CONFLICT DO NOTHING`,
    [messageId, userId, emoji]
  );
}

async function removeReaction(messageId, userId, emoji) {
  await db.query(
    `DELETE FROM reactions WHERE message_id = $1 AND user_id = $2 AND emoji = $3`,
    [messageId, userId, emoji]
  );
}

async function getReactions(messageIds) {
  if (!messageIds || !messageIds.length) return new Map();
  const res = await db.query(
    `SELECT message_id, user_id, emoji
     FROM reactions
     WHERE message_id = ANY($1::bigint[])`,
    [messageIds]
  );
  const out = new Map();
  for (const r of res.rows) {
    const mid = db.bigintToNum(r.message_id);
    if (!out.has(mid)) out.set(mid, {});
    if (!out.get(mid)[r.emoji]) out.get(mid)[r.emoji] = [];
    out.get(mid)[r.emoji].push(db.bigintToNum(r.user_id));
  }
  return out;
}

async function getLastMessage(chatId) {
  const res = await db.query(
    `${BASE_SELECT} WHERE m.chat_id = $1 AND NOT m.is_deleted
     ORDER BY m.id DESC LIMIT 1`,
    [chatId]
  );
  return rowToMessage(res.rows[0]);
}

module.exports = {
  create, findById, getById, getHistory, getAround, getMedia,
  edit, softDelete, search, globalSearch,
  addReaction, removeReaction, getReactions, getLastMessage,
  rowToMessage
};
