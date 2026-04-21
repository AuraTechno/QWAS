require("dotenv").config();

module.exports = {
    MONGO_URL: process.env.MONGO_URL,
    JWT_SECRET: process.env.JWT_SECRET,
    PORT: process.env.PORT || 3000
};