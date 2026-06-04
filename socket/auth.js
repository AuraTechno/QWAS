const { verifyToken } = require("../middleware/auth");

function socketAuth(socket, next) {
  try {
    const token = socket.handshake.auth.token;
    if (!token) return next(new Error("No token"));
    const data = verifyToken(token);
    socket.username = data.username;
    next();
  } catch (err) {
    next(new Error("auth"));
  }
}

module.exports = socketAuth;
