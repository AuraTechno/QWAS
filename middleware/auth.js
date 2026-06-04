const jwt = require("jsonwebtoken");

function getJWTSecret() {
  return process.env.JWT_SECRET || require("../config").JWT_SECRET;
}

function verifyToken(token) {
  return jwt.verify(token, getJWTSecret());
}

function authMiddleware(req, res, next) {
  try {
    const header = req.headers.authorization;
    if (!header) return res.status(401).json({ ok: false, error: "No token" });
    const token = header.split(" ")[1];
    req.user = verifyToken(token);
    next();
  } catch (err) {
    res.status(401).json({ ok: false, error: "Invalid token" });
  }
}

module.exports = { authMiddleware, verifyToken, getJWTSecret };
