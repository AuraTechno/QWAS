// JWT helpers — issue + verify
const jwt = require("jsonwebtoken");
const config = require("../config");

const TOKEN_VERSION = 1;

function sign(payload) {
  return jwt.sign(
    { ...payload, v: TOKEN_VERSION },
    config.JWT_SECRET,
    { expiresIn: config.JWT_TTL }
  );
}

function verify(token) {
  try {
    const decoded = jwt.verify(token, config.JWT_SECRET);
    if (decoded.v !== TOKEN_VERSION) return null;
    return decoded;
  } catch {
    return null;
  }
}

module.exports = { sign, verify };
