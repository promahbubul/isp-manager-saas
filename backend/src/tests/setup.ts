import { MongoMemoryReplSet } from "mongodb-memory-server";
import mongoose from "mongoose";
import { afterAll, afterEach, beforeAll, beforeEach } from "vitest";
import { setSmsProvider } from "../app/services/sms/sms.provider";
import { flushBackground } from "../app/utils/background";
import { seedPlans } from "../scripts/seed";
import { installFakeRouterDriver, resetFakeRouters } from "./fakeRouter";
import { fakeSms } from "./fakeSms";

let replSet: MongoMemoryReplSet;

beforeAll(async () => {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: "wiredTiger" } });
  await mongoose.connect(replSet.getUri());
  await mongoose.connection.syncIndexes();
  installFakeRouterDriver();
  setSmsProvider(fakeSms);
});

beforeEach(async () => {
  resetFakeRouters();
  fakeSms.reset();
  const collections = await mongoose.connection.db!.collections();
  await Promise.all(collections.map((c) => c.deleteMany({})));
  const log = console.log;
  console.log = () => undefined;
  await seedPlans();
  console.log = log;
});

// Background work (SMS, syncs) must finish before the next test wipes the DB.
afterEach(async () => {
  await flushBackground();
});

afterAll(async () => {
  await mongoose.disconnect();
  await replSet?.stop();
});
