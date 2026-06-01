const mongoose = require('mongoose');
require('dotenv').config();

const mongoURI = process.env.MONGO_URI || 'mongodb://localhost:27017/timetable_db';

(async () => {
  try {
    await mongoose.connect(mongoURI);
    const users = await mongoose.connection.db.collection('users').find().toArray();
    console.log('Found users:', users.length);
    console.log(users.map(u => ({ username: u.username, email: u.email, department: u.department })));
    process.exit(0);
  } catch (err) {
    console.error('Error listing users:', err);
    process.exit(1);
  }
})();
