// Хелпер для отправки события пользователю по username (через online map)
function sendToUser(io, online, username, event, payload) {
  const entry = online.get(username);
  const sid = entry && typeof entry === 'object' ? entry.id : entry;
  if (sid) {
    io.to(sid).emit(event, payload);
    return true;
  }
  return false;
}

function sendToUsers(io, online, usernames, event, payload) {
  for (const u of usernames) sendToUser(io, online, u, event, payload);
}

function broadcastToChat(io, chatId, event, payload) {
  io.to(`chat:${chatId}`).emit(event, payload);
}

module.exports = { sendToUser, sendToUsers, broadcastToChat };
