import mongoose from "mongoose";
import config from ".";

export async function connectDB(url = config.dbUrl) {
  mongoose.set("strictQuery", true);
  await mongoose.connect(url);
  console.log("✅ MongoDB connected");
}

export async function disconnectDB() {
  await mongoose.disconnect();
}
