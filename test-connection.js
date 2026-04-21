const mongoose = require('mongoose');
const config = require('./config');

console.log('Testing connection to MongoDB...');
console.log('URL:', config.MONGO_URL.replace(/:[^:@]+@/, ':****@'));

mongoose.set('strictQuery', false);

mongoose.connect(config.MONGO_URL)
  .then(() => {
    console.log('✅ MongoDB connected successfully!');
    console.log('Connection state:', mongoose.connection.readyState);
    process.exit(0);
  })
  .catch(err => {
    console.error('❌ Connection failed:', err.message);
    process.exit(1);
  });