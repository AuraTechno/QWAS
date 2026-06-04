// Socket.io auth: читает токен из handshake.auth или query
const tokenUtil = require("../utils/jwt");
const usersRepo = require("../db/repos/users");

module.exports = async (socket, next) => {
  try {
    const token = socket.handshake.auth?.token
      || socket.handshake.query?.token
      || (socket.handshake.headers.authorization || "").replace(/^Bearer /, "");
    if (!token) return next(new Error("AUTH_REQUIRED"));
    const payload = tokenUtil.verify(token);
    if (!payload || !payload.id || !payload.username) {
      return next(new Error("INVALID_TOKEN"));
    }
    socket.userId = payload.id;
    socket.username = payload.username;
    socket.isAdmin = !!payload.isAdmin;
    next();
  } catch (err) {
    next(new Error("AUTH_ERROR"));
  }
};
