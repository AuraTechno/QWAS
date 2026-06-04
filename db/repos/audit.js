// Аудит-лог для будущей админ-панели
const db = require("../pg");

async function log({ actorId, action, targetType, targetId, oldValue, newValue, ipAddress, userAgent }) {
  try {
    await db.query(
      `INSERT INTO audit_log (actor_id, action, target_type, target_id, old_value, new_value, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [actorId || null, action, targetType || null, targetId != null ? String(targetId) : null,
       oldValue ? JSON.stringify(oldValue) : null, newValue ? JSON.stringify(newValue) : null,
       ipAddress || null, userAgent || null]
    );
  } catch (err) {
    // Не ломаем основную операцию если лог не пишется
    require("../utils/logger").error("Audit log failed: " + err.message);
  }
}

async function list({ action, actorId, targetType, targetId, limit = 100, offset = 0 } = {}) {
  const params = [];
  const where = [];
  if (action) { params.push(action); where.push(`action = $${params.length}`); }
  if (actorId) { params.push(actorId); where.push(`actor_id = $${params.length}`); }
  if (targetType) { params.push(targetType); where.push(`target_type = $${params.length}`); }
  if (targetId !== undefined && targetId !== null) { params.push(String(targetId)); where.push(`target_id = $${params.length}`); }
  const whereSql = where.length ? "WHERE " + where.join(" AND ") : "";
  params.push(limit); params.push(offset);
  const res = await db.query(
    `SELECT a.*, u.username AS actor_username
     FROM audit_log a
     LEFT JOIN users u ON u.id = a.actor_id
     ${whereSql}
     ORDER BY a.created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  return res.rows;
}

module.exports = { log, list };
