// Папки чатов
const db = require("../pg");

function rowToFolder(row) {
  if (!row) return null;
  return {
    id: db.bigintToNum(row.id),
    name: row.name,
    emoji: row.emoji,
    color: row.color,
    sortOrder: row.sort_order,
    includeArchived: row.include_archived,
    includeMuted: row.include_muted,
    createdAt: row.created_at
  };
}

async function list(username) {
  const res = await db.query(
    `SELECT * FROM chat_folders
     WHERE user_id = (SELECT id FROM users WHERE username = $1)
     ORDER BY sort_order, id`,
    [username]
  );
  return res.rows.map(rowToFolder);
}

async function create({ username, name, emoji, color }) {
  const maxOrder = await db.query(
    `SELECT COALESCE(MAX(sort_order), 0) AS m FROM chat_folders
     WHERE user_id = (SELECT id FROM users WHERE username = $1)`,
    [username]
  );
  const res = await db.query(
    `INSERT INTO chat_folders (user_id, name, emoji, color, sort_order)
     VALUES ((SELECT id FROM users WHERE username = $1), $2, $3, $4, $5)
     RETURNING *`,
    [username, name, emoji || null, color || null, (maxOrder.rows[0].m || 0) + 1]
  );
  return rowToFolder(res.rows[0]);
}

async function update(id, username, patch) {
  const sets = [];
  const vals = [];
  let i = 1;
  if (patch.name !== undefined) { sets.push(`name = $${i++}`); vals.push(patch.name); }
  if (patch.emoji !== undefined) { sets.push(`emoji = $${i++}`); vals.push(patch.emoji); }
  if (patch.color !== undefined) { sets.push(`color = $${i++}`); vals.push(patch.color); }
  if (patch.sortOrder !== undefined) { sets.push(`sort_order = $${i++}`); vals.push(patch.sortOrder); }
  if (patch.includeArchived !== undefined) { sets.push(`include_archived = $${i++}`); vals.push(patch.includeArchived); }
  if (patch.includeMuted !== undefined) { sets.push(`include_muted = $${i++}`); vals.push(patch.includeMuted); }
  if (!sets.length) return await findById(id, username);
  sets.push(`id = $${i++}`); vals.push(id);
  vals.push(username);
  const res = await db.query(
    `UPDATE chat_folders SET ${sets.join(", ")}
     WHERE id = $${i++} AND user_id = (SELECT id FROM users WHERE username = $${i})
     RETURNING *`,
    vals
  );
  return rowToFolder(res.rows[0]);
}

async function findById(id, username) {
  const res = await db.query(
    `SELECT * FROM chat_folders
     WHERE id = $1 AND user_id = (SELECT id FROM users WHERE username = $2)`,
    [id, username]
  );
  return rowToFolder(res.rows[0]);
}

async function remove(id, username) {
  await db.query(
    `DELETE FROM chat_folders
     WHERE id = $1 AND user_id = (SELECT id FROM users WHERE username = $2)`,
    [id, username]
  );
  await db.query(
    `UPDATE user_chats SET folder_id = NULL
     WHERE folder_id = $1 AND user_id = (SELECT id FROM users WHERE username = $2)`,
    [id, username]
  );
}

async function addChatToFolder(username, chatId, folderId) {
  await db.query(
    `UPDATE user_chats SET folder_id = $3
     WHERE user_id = (SELECT id FROM users WHERE username = $1) AND chat_id = $2`,
    [username, chatId, folderId]
  );
}

module.exports = {
  list, create, update, findById, remove, addChatToFolder,
  rowToFolder
};
