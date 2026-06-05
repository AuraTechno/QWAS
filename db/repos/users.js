// Репозиторий пользователей
const db = require("../pg");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");

function tokenHash(token) {
  return crypto.createHash("sha256").update(String(token || "")).digest("hex");
}

function rowToUser(row) {
  if (!row) return null;
  return {
    id: db.bigintToNum(row.id),
    username: row.username,
    email: row.email,
    emailVerifiedAt: row.email_verified_at,
    firstName: row.first_name,
    lastName: row.last_name,
    avatarUrl: row.avatar_url,
    bio: row.bio,
    presence: row.presence,
    lastSeen: row.last_seen,
    settings: row.settings || {},
    isAdmin: row.is_admin,
    isBanned: row.is_banned,
    createdAt: row.created_at
  };
}

async function create({ username, firstName, lastName, email, password }) {
  const hash = await bcrypt.hash(password, 10);
  const res = await db.query(
    `INSERT INTO users (username, first_name, last_name, email, password_hash)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [username, firstName, lastName || null, email || null, hash]
  );
  return rowToUser(res.rows[0]);
}

async function findByUsername(username) {
  const res = await db.query("SELECT * FROM users WHERE username = $1", [username]);
  return res.rows[0] || null;
}

async function findByEmail(email) {
  if (!email) return null;
  const res = await db.query("SELECT * FROM users WHERE email = $1", [email.toLowerCase()]);
  return res.rows[0] || null;
}

async function findById(id) {
  const res = await db.query("SELECT * FROM users WHERE id = $1", [id]);
  return res.rows[0] || null;
}

async function verifyPassword(username, password) {
  const row = await findByUsername(username);
  if (!row) return null;
  const ok = await bcrypt.compare(password, row.password_hash);
  if (!ok) return null;
  return rowToUser(row);
}

async function getManyByUsernames(usernames) {
  if (!usernames || !usernames.length) return [];
  const res = await db.query(
    `SELECT * FROM users WHERE username = ANY($1::text[])`,
    [usernames]
  );
  return res.rows.map(rowToUser);
}

async function getManyByIds(ids) {
  if (!ids || !ids.length) return [];
  const res = await db.query(
    `SELECT * FROM users WHERE id = ANY($1::bigint[])`,
    [ids]
  );
  return res.rows.map(rowToUser);
}

async function search(q, limit = 20) {
  if (!q || !q.trim()) return [];
  const term = q.trim();
  const res = await db.query(
    `SELECT * FROM users
     WHERE (username ILIKE $1 OR first_name ILIKE $1 OR last_name ILIKE $1)
        OR username % $2 OR first_name % $2
     ORDER BY
       CASE WHEN username ILIKE $1 THEN 0
            WHEN first_name ILIKE $1 THEN 1
            ELSE 2 END,
       similarity(username, $2) DESC,
       id DESC
     LIMIT $3`,
    [`%${term}%`, term, limit]
  );
  return res.rows.map(rowToUser);
}

async function setPresence(username, presence) {
  await db.query(
    `UPDATE users SET presence = $2, last_seen = NOW() WHERE username = $1`,
    [username, presence]
  );
}

async function setOnline(username) {
  await db.query(
    `UPDATE users SET presence = 'online', last_seen = NOW() WHERE username = $1`,
    [username]
  );
}

async function setOffline(username) {
  await db.query(
    `UPDATE users SET presence = 'offline', last_seen = NOW() WHERE username = $1`,
    [username]
  );
}

async function touchLastSeen(username) {
  await db.query(`UPDATE users SET last_seen = NOW() WHERE username = $1`, [username]);
}

async function getOnlineUsernames() {
  const res = await db.query(
    `SELECT username, last_seen FROM users WHERE presence = 'online'`
  );
  return res.rows;
}

async function getSettings(username) {
  const res = await db.query(`SELECT settings FROM users WHERE username = $1`, [username]);
  return res.rows[0]?.settings || {};
}

async function updateSettings(username, patch) {
  const res = await db.query(
    `UPDATE users SET settings = settings || $2::jsonb, updated_at = NOW()
     WHERE username = $1 RETURNING settings`,
    [username, JSON.stringify(patch)]
  );
  return res.rows[0]?.settings || {};
}

async function updateProfile(username, { firstName, lastName, bio, avatarUrl }) {
  const sets = [];
  const vals = [];
  let i = 1;
  if (firstName !== undefined) { sets.push(`first_name = $${i++}`); vals.push(firstName); }
  if (lastName !== undefined) { sets.push(`last_name = $${i++}`); vals.push(lastName); }
  if (bio !== undefined) { sets.push(`bio = $${i++}`); vals.push(bio); }
  if (avatarUrl !== undefined) { sets.push(`avatar_url = $${i++}`); vals.push(avatarUrl); }
  if (!sets.length) return await findByUsername(username);
  sets.push(`updated_at = NOW()`);
  vals.push(username);
  const res = await db.query(
    `UPDATE users SET ${sets.join(", ")} WHERE username = $${i} RETURNING *`,
    vals
  );
  return rowToUser(res.rows[0]);
}

async function getContacts(username) {
  const res = await db.query(
    `SELECT c.contact_id, c.display_name, c.is_favorite, c.added_at,
            u.username, u.first_name, u.last_name, u.avatar_url, u.presence, u.last_seen
     FROM contacts c
     JOIN users u ON u.id = c.contact_id
     WHERE c.owner_id = (SELECT id FROM users WHERE username = $1)
     ORDER BY c.is_favorite DESC, c.added_at DESC`,
    [username]
  );
  return res.rows.map(r => ({
    contactId: db.bigintToNum(r.contact_id),
    displayName: r.display_name,
    isFavorite: r.is_favorite,
    addedAt: r.added_at,
    username: r.username,
    firstName: r.first_name,
    lastName: r.last_name,
    avatarUrl: r.avatar_url,
    presence: r.presence,
    lastSeen: r.last_seen
  }));
}

async function addContact(username, contactUsername) {
  await db.query(
    `INSERT INTO contacts (owner_id, contact_id)
     SELECT u1.id, u2.id FROM users u1, users u2
     WHERE u1.username = $1 AND u2.username = $2
     ON CONFLICT DO NOTHING`,
    [username, contactUsername]
  );
}

async function removeContact(username, contactUsername) {
  await db.query(
    `DELETE FROM contacts
     WHERE owner_id = (SELECT id FROM users WHERE username = $1)
       AND contact_id = (SELECT id FROM users WHERE username = $2)`,
    [username, contactUsername]
  );
}

// === Sessions (multi-device) ===
async function getActiveSessions(userId, currentTokenHash) {
  const res = await db.query(
    `SELECT id, device_info, ip_address, user_agent, created_at, last_active_at, expires_at, token_hash
     FROM sessions
     WHERE user_id = $1 AND expires_at > NOW()
     ORDER BY last_active_at DESC`,
    [userId]
  );
  return res.rows.map(r => ({
    id: db.bigintToNum(r.id),
    deviceName: r.device_info,
    ipAddress: r.ip_address,
    userAgent: r.user_agent,
    createdAt: r.created_at,
    lastActiveAt: r.last_active_at,
    expiresAt: r.expires_at,
    isCurrent: !!(currentTokenHash && r.token_hash === currentTokenHash)
  }));
}

async function createSession({ userId, token, deviceInfo, ipAddress, userAgent, ttlMs }) {
  const hash = tokenHash(token);
  const expires = new Date(Date.now() + (ttlMs || 30 * 24 * 60 * 60 * 1000));
  const r = await db.query(
    `INSERT INTO sessions (user_id, token_hash, device_info, ip_address, user_agent, expires_at, last_active_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW())
     ON CONFLICT (token_hash) DO UPDATE SET last_active_at = NOW()
     RETURNING id`,
    [userId, hash, deviceInfo || null, ipAddress || null, userAgent || null, expires]
  );
  return db.bigintToNum(r.rows[0]?.id);
}

async function touchSession(token) {
  const hash = tokenHash(token);
  await db.query(`UPDATE sessions SET last_active_at = NOW() WHERE token_hash = $1`, [hash]);
}

async function deleteSessionByToken(token) {
  const hash = tokenHash(token);
  await db.query(`DELETE FROM sessions WHERE token_hash = $1`, [hash]);
}

async function terminateSession(sessionId, userId) {
  await db.query(
    `DELETE FROM sessions WHERE id = $1 AND user_id = $2`,
    [sessionId, userId]
  );
}

async function terminateAllOtherSessions(userId, currentTokenHash) {
  const r = await db.query(
    `DELETE FROM sessions WHERE user_id = $1 AND ($2::text IS NULL OR token_hash != $2)`,
    [userId, currentTokenHash || null]
  );
  return r.rowCount || 0;
}

module.exports = {
  create, findByUsername, findByEmail, findById, verifyPassword,
  getManyByUsernames, getManyByIds, search,
  setPresence, setOnline, setOffline, touchLastSeen,
  getOnlineUsernames,
  getSettings, updateSettings, updateProfile,
  getContacts, addContact, removeContact,
  getActiveSessions, terminateSession, terminateAllOtherSessions,
  createSession, touchSession, deleteSessionByToken, tokenHash,
  rowToUser
};
