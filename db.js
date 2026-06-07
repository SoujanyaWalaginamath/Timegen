const mongoose = require("mongoose");

const mongoURI = process.env.MONGO_URI || "mongodb://localhost:27017/timetable_db";
const usingAtlas = !!process.env.MONGO_URI;

mongoose.connect(mongoURI).then(() => {
  console.log(`MongoDB Connected (${usingAtlas ? 'Atlas / REMOTE' : 'Local'})`);
  console.log('[Mongo] Using DB name from URI: ', mongoURI.split('/').pop());
}).catch(err => {
  console.error("MongoDB Connection Error: ", err);
  // Fail fast so we don't report "success" when DB is not reachable
  process.exit(1);
});


module.exports = mongoose;