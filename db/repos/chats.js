// Репозиторий чатов, участников и user_chats
const db = require("../pg");

function rowToChat(row) {
  if (!row) return null;
  return {
    id: db.bigintToNum(row.id),
    type: row.type,
    title: row.title,
    username: row.username,
    description: row.description,
    avatarUrl: row.avatar_url,
    ownerId: db.bigintToNum(row.owner_id),
    isPublic: row.is_public,
    membersCanPost: row.members_can_post,
    slowModeSec: row.slow_mode_sec,
    inviteLink: row.invite_link,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function rowToUserChat(row) {
  if (!row) return null;
  return {
    chatId: db.bigintToNum(row.chat_id),
    userId: db.bigintToNum(row.user_id),
    lastMessageId: db.bigintToNum(row.last_message_id),
    lastMessageText: row.last_message_text,
    lastMessageFromId: db.bigintToNum(row.last_message_from_id),
    lastMessageType: row.last_message_type,
    lastMessageHasAttachments: row.last_message_has_attachments,
    lastMessageAt: row.last_message_at,
    unreadCount: row.unread_count,
    isPinned: row.is_pinned,
    isArchived: row.is_archived,
    isMuted: row.is_muted,
    folderId: db.bigintToNum(row.folder_id)
  };
}

/**
 * Найти или создать DM-чат между двумя пользователями.
 * Использует уникальный индекс на (chat_id, user_id) пары через CTE.
 */
async function findOrCreateDM(userIdA, userIdB) {
  // Сортируем id чтобы пара всегда была в одном порядке
  const lo = Math.min(userIdA, userIdB);
  const hi = Math.max(userIdA, userIdB);

  // Ищем существующий DM
  const found = await db.query(
    `SELECT c.* FROM chats c
     WHERE c.type = 'dm'
       AND EXISTS (SELECT 1 FROM chat_members m1 WHERE m1.chat_id = c.id AND m1.user_id = $1)
       AND EXISTS (SELECT 1 FROM chat_members m2 WHERE m2.chat_id = c.id AND m2.user_id = $2)
     LIMIT 1`,
    [lo, hi]
  );
  if (found.rows.length) {
    return rowToChat(found.rows[0]);
  }

  // Создаём новый DM
  const created = await db.withTransaction(async (client) => {
    const chatRes = await client.query(
      `INSERT INTO chats (type, title) VALUES ('dm', '') RETURNING *`
    );
    const chat = chatRes.rows[0];
    await client.query(
      `INSERT INTO chat_members (chat_id, user_id) VALUES ($1, $2), ($1, $3)
       ON CONFLICT DO NOTHING`,
      [chat.id, lo, hi]
    );
    return chat;
  });

  return rowToChat(created);
}

/**
 * Создать группу или канал
 */
async function createGroup({ ownerId, type = "group", title, username, description, isPublic = false, members = [] }) {
  return await db.withTransaction(async (client) => {
    const chatRes = await client.query(
      `INSERT INTO chats (type, title, username, description, owner_id, is_public, invite_link)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [type, title, username || null, description || null, ownerId, isPublic, isPublic ? `inv_${db.bigintToNum(ownerId)}_${Date.now().toString(36)}` : null]
    );
    const chat = chatRes.rows[0];

    // Owner
    await client.query(
      `INSERT INTO chat_members (chat_id, user_id, role) VALUES ($1, $2, 'owner')`,
      [chat.id, ownerId]
    );
    // Остальные участники
    for (const m of members) {
      if (m === ownerId) continue;
      await client.query(
        `INSERT INTO chat_members (chat_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [chat.id, m]
      );
    }
    return rowToChat(chat);
  });
}

async function findById(chatId) {
  const res = await db.query("SELECT * FROM chats WHERE id = $1", [chatId]);
  return rowToChat(res.rows[0]);
}

async function getMembers(chatId) {
  const res = await db.query(
    `SELECT u.id, u.username, u.first_name, u.last_name, u.avatar_url, u.presence,
            cm.role, cm.joined_at, cm.is_muted
     FROM chat_members cm
     JOIN users u ON u.id = cm.user_id
     WHERE cm.chat_id = $1
     ORDER BY CASE cm.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END, cm.joined_at`,
    [chatId]
  );
  return res.rows.map(r => ({
    id: db.bigintToNum(r.id),
    username: r.username,
    firstName: r.first_name,
    lastName: r.last_name,
    avatarUrl: r.avatar_url,
    presence: r.presence,
    role: r.role,
    joinedAt: r.joined_at,
    isMuted: r.is_muted
  }));
}

async function isMember(chatId, userId) {
  const res = await db.query(
    `SELECT 1 FROM chat_members WHERE chat_id = $1 AND user_id = $2 LIMIT 1`,
    [chatId, userId]
  );
  return res.rows.length > 0;
}

async function addMember(chatId, userId, role = "member") {
  await db.query(
    `INSERT INTO chat_members (chat_id, user_id, role) VALUES ($1, $2, $3)
     ON CONFLICT DO NOTHING`,
    [chatId, userId, role]
  );
}

async function removeMember(chatId, userId) {
  await db.query(
    `DELETE FROM chat_members WHERE chat_id = $1 AND user_id = $2`,
    [chatId, userId]
  );
  // Удаляем из user_chats
  await db.query(
    `DELETE FROM user_chats WHERE chat_id = $1 AND user_id = $2`,
    [chatId, userId]
  );
}

async function getMemberIds(chatId) {
  const res = await db.query(
    `SELECT user_id FROM chat_members WHERE chat_id = $1`,
    [chatId]
  );
  return res.rows.map(r => db.bigintToNum(r.user_id));
}

async function getMemberUsernames(chatId) {
  const res = await db.query(
    `SELECT u.username FROM chat_members cm
     JOIN users u ON u.id = cm.user_id
     WHERE cm.chat_id = $1`,
    [chatId]
  );
  return res.rows.map(r => r.username);
}

/**
 * Получить список чатов пользователя с last_message и пользователями.
 * Оптимизировано: 1 CTE для me + LATERAL JOIN вместо коррелированных подзапросов.
 */
async function getUserChats(username, { tab = "all", limit = 100 } = {}) {
  const params = [username];
  let where = `uc.user_id = me.id`;
  if (tab === "unread") {
    where += ` AND uc.unread_count > 0 AND NOT uc.is_archived`;
  } else if (tab === "groups") {
    where += ` AND c.type IN ('group', 'channel')`;
  } else if (tab === "channels") {
    where += ` AND c.type = 'channel'`;
  } else {
    where += ` AND NOT uc.is_archived`;
  }
  params.push(limit);

  const res = await db.query(
    `WITH me AS (SELECT id FROM users WHERE username = $1)
     SELECT
       uc.*,
       c.type, c.title, c.username AS chat_username, c.description, c.avatar_url,
       c.is_public, c.members_can_post, c.owner_id,
       ou.user_data AS other_user,
       lmf.user_data AS last_message_from
     FROM user_chats uc
     CROSS JOIN me
     JOIN chats c ON c.id = uc.chat_id
     LEFT JOIN LATERAL (
       SELECT json_build_object(
         'id', u.id, 'username', u.username,
         'firstName', u.first_name, 'lastName', u.last_name,
         'avatarUrl', u.avatar_url, 'presence', u.presence, 'lastSeen', u.last_seen
       ) AS user_data
       FROM chat_members cm
       JOIN users u ON u.id = cm.user_id
       WHERE cm.chat_id = c.id AND cm.user_id != me.id
       LIMIT 1
     ) ou ON TRUE
     LEFT JOIN LATERAL (
       SELECT json_build_object(
         'id', u.id, 'username', u.username, 'firstName', u.first_name, 'lastName', u.last_name
       ) AS user_data
       FROM users u WHERE u.id = uc.last_message_from_id
     ) lmf ON TRUE
     WHERE ${where}
     ORDER BY uc.is_pinned DESC, uc.last_message_at DESC NULLS LAST, uc.chat_id DESC
     LIMIT $${params.length}`,
    params
  );

  return res.rows.map(r => ({
    ...rowToUserChat(r),
    type: r.type,
    title: r.title,
    username: r.chat_username,
    description: r.description,
    avatarUrl: r.avatar_url,
    isPublic: r.is_public,
    membersCanPost: r.members_can_post,
    ownerId: db.bigintToNum(r.owner_id),
    otherUser: r.other_user,
    lastMessageFrom: r.last_message_from
  }));
}

async function getUserChat(username, chatId) {
  const res = await db.query(
    `WITH me AS (SELECT id FROM users WHERE username = $1)
     SELECT
       uc.*,
       c.type, c.title, c.username AS chat_username, c.description, c.avatar_url,
       c.is_public, c.members_can_post, c.owner_id,
       ou.user_data AS other_user
     FROM user_chats uc
     CROSS JOIN me
     JOIN chats c ON c.id = uc.chat_id
     LEFT JOIN LATERAL (
       SELECT json_build_object(
         'id', u.id, 'username', u.username,
         'firstName', u.first_name, 'lastName', u.last_name,
         'avatarUrl', u.avatar_url, 'presence', u.presence, 'lastSeen', u.last_seen
       ) AS user_data
       FROM chat_members cm
       JOIN users u ON u.id = cm.user_id
       WHERE cm.chat_id = c.id AND cm.user_id != me.id
       LIMIT 1
     ) ou ON TRUE
     WHERE uc.user_id = me.id
       AND uc.chat_id = $2`,
    [username, chatId]
  );
  if (!res.rows.length) return null;
  const r = res.rows[0];
  return {
    ...rowToUserChat(r),
    type: r.type,
    title: r.title,
    username: r.chat_username,
    description: r.description,
    avatarUrl: r.avatar_url,
    isPublic: r.is_public,
    membersCanPost: r.members_can_post,
    ownerId: db.bigintToNum(r.owner_id),
    otherUser: r.other_user
  };
}

async function getArchivedChats(username) {
  return getUserChats(username, { tab: "archived_archived" }).catch(() => []);
}
async function getPinnedChats(username) {
  const res = await db.query(
    `SELECT uc.chat_id, uc.last_message_text, uc.last_message_at, uc.unread_count
     FROM user_chats uc
     WHERE uc.user_id = (SELECT id FROM users WHERE username = $1)
       AND uc.is_pinned = TRUE
     ORDER BY uc.last_message_at DESC NULLS LAST`,
    [username]
  );
  return res.rows.map(r => ({
    chatId: db.bigintToNum(r.chat_id),
    lastMessageText: r.last_message_text,
    lastMessageAt: r.last_message_at,
    unreadCount: r.unread_count
  }));
}

async function setPinned(username, chatId, pinned) {
  await db.query(
    `UPDATE user_chats SET is_pinned = $3, updated_at = NOW()
     WHERE user_id = (SELECT id FROM users WHERE username = $1) AND chat_id = $2`,
    [username, chatId, !!pinned]
  );
}

async function setArchived(username, chatId, archived) {
  await db.query(
    `UPDATE user_chats SET is_archived = $3, updated_at = NOW()
     WHERE user_id = (SELECT id FROM users WHERE username = $1) AND chat_id = $2`,
    [username, chatId, !!archived]
  );
}

async function setMuted(username, chatId, muted) {
  await db.query(
    `UPDATE user_chats SET is_muted = $3, updated_at = NOW()
     WHERE user_id = (SELECT id FROM users WHERE username = $1) AND chat_id = $2`,
    [username, chatId, !!muted]
  );
}

async function resetUnread(username, chatId) {
  await db.query(
    `UPDATE user_chats SET unread_count = 0, updated_at = NOW()
     WHERE user_id = (SELECT id FROM users WHERE username = $1) AND chat_id = $2`,
    [username, chatId]
  );
}

async function getTotalUnread(username) {
  const res = await db.query(
    `SELECT COALESCE(SUM(unread_count), 0) AS total
     FROM user_chats
     WHERE user_id = (SELECT id FROM users WHERE username = $1)
       AND NOT is_muted AND NOT is_archived AND unread_count > 0`,
    [username]
  );
  return parseInt(res.rows[0]?.total || 0);
}

module.exports = {
  findOrCreateDM, createGroup,
  findById, getMembers, isMember, addMember, removeMember,
  getMemberIds, getMemberUsernames,
  getUserChats, getUserChat, getArchivedChats, getPinnedChats,
  setPinned, setArchived, setMuted,
  resetUnread, getTotalUnread,
  rowToChat, rowToUserChat
};
