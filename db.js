const mongoose = require("mongoose");

const mongoURI = process.env.MONGO_URI || "mongodb://localhost:27017/timetable_db";

mongoose.connect(mongoURI).then(() => {
  console.log("MongoDB Connected");
}).catch(err => {
  console.error("MongoDB Connection Error: ", err);
});

module.exports = mongoose;