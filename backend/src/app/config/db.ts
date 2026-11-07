import mongoose from "mongoose";
import config from ".";
import { logger } from "../utils/logger";

export async function connectDB(url = config.dbUrl) {
  mongoose.set("strictQuery", true);
  // Building indexes on every boot is slow on big collections and can block writes.
  // In production run `pnpm db:indexes` after a deploy instead.
  mongoose.set("autoIndex", !config.isProd);
  await mongoose.connect(url, { maxPoolSize: 20, serverSelectionTimeoutMS: 10_000 });
  logger.info("MongoDB connected");
  mongoose.connection.on("disconnected", () => logger.warn("MongoDB disconnected"));
  mongoose.connection.on("reconnected", () => logger.info("MongoDB reconnected"));
}

export async function disconnectDB() {
  await mongoose.disconnect();
}
