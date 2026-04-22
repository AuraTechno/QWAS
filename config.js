module.exports = {
  // Добавляем retryWrites и w=majority для стабильности
  MONGO_URL: "mongodb+srv://server:bRtteM2rqijlDTsd@qwas.ijvw0zw.mongodb.net/messenger?retryWrites=true&w=majority",
  JWT_SECRET: "secret_key_123"
  MESSAGES_PER_PAGE: 30  // Количество сообщений за одну загрузку
};