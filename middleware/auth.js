// HTTP middleware: проверка JWT, кладёт req.user = { id, username, isAdmin }
const tokenUtil = require("../utils/jwt");
const usersRepo = require("../db/repos/users");

function parseToken(req) {
  const auth = req.headers.authorization || "";
  if (auth.startsWith("Bearer ")) return auth.slice(7).trim();
  // также поддерживаем ?token= для socket.io polling
  if (req.query && req.query.token) return String(req.query.token);
  return null;
}

function authRequired(req, res, next) {
  const token = parseToken(req);
  if (!token) {
    return res.status(401).json({ ok: false, error: "Не авторизован" });
  }
  const payload = tokenUtil.verify(token);
  if (!payload || !payload.id || !payload.username) {
    return res.status(401).json({ ok: false, error: "Невалидный токен" });
  }
  req.user = {
    id: payload.id,
    username: payload.username,
    isAdmin: !!payload.isAdmin
  };
  next();
}

function authOptional(req, res, next) {
  const token = parseToken(req);
  if (token) {
    const payload = tokenUtil.verify(token);
    if (payload && payload.id) {
      req.user = { id: payload.id, username: payload.username, isAdmin: !!payload.isAdmin };
    }
  }
  next();
}

function adminRequired(req, res, next) {
  if (!req.user) return res.status(401).json({ ok: false, error: "Не авторизован" });
  if (!req.user.isAdmin) return res.status(403).json({ ok: false, error: "Доступ запрещён" });
  next();
}

module.exports = { authRequired, authOptional, adminRequired, parseToken };
