/**
 * Create/update every collection's indexes to match the schemas (and drop ones no
 * longer declared). Run after each deploy:  pnpm db:indexes
 */
import mongoose from "mongoose";
import "../app"; // registers every model
import { connectDB, disconnectDB } from "../app/config/db";

async function main() {
  await connectDB();
  for (const name of mongoose.modelNames()) {
    const dropped = await mongoose.model(name).syncIndexes();
    console.log(`✔ ${name}${dropped.length ? ` (dropped: ${dropped.join(", ")})` : ""}`);
  }
  await disconnectDB();
}

main().catch(async (err) => {
  console.error("❌ index sync failed:", err);
  await disconnectDB().catch(() => undefined);
  process.exit(1);
});
