// Baseline test env — MUST be set before any src module (which reads env at import).
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = process.env.LOG_LEVEL ?? 'silent';
process.env.MOCK_NOMBA = process.env.MOCK_NOMBA ?? 'true';
process.env.QUEUE_DRIVER = 'memory';
process.env.MONGODB_URI = process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017/railpoint-test';
process.env.NOMBA_ACCOUNT_ID = process.env.NOMBA_ACCOUNT_ID ?? 'test-account';
process.env.NOMBA_CLIENT_ID = process.env.NOMBA_CLIENT_ID ?? 'test-client';
process.env.NOMBA_CLIENT_SECRET = process.env.NOMBA_CLIENT_SECRET ?? 'test-secret';
process.env.NOMBA_WEBHOOK_SIGNATURE_KEY = process.env.NOMBA_WEBHOOK_SIGNATURE_KEY ?? 'test-webhook-key';
process.env.WEBHOOK_VERIFY_SIGNATURE = process.env.WEBHOOK_VERIFY_SIGNATURE ?? 'true';
process.env.DEMO_FAST_RECOVERY = process.env.DEMO_FAST_RECOVERY ?? 'false';
process.env.MAX_RECOVERY_ATTEMPTS = process.env.MAX_RECOVERY_ATTEMPTS ?? '4';
process.env.RECOVERY_WINDOW_DAYS = process.env.RECOVERY_WINDOW_DAYS ?? '10';
process.env.PARTIAL_CHARGE_FRACTION = process.env.PARTIAL_CHARGE_FRACTION ?? '0.5';

import mongoose from 'mongoose';
import { __setEngine } from '../src/services/billing/queue';

// Use a provided MongoDB (TEST_MONGODB_URI) when available — avoids downloading
// the mongodb-memory-server binary. Otherwise spin up an in-memory MongoDB.
let mongo: { stop: () => Promise<void> } | null = null;

beforeAll(async () => {
  const provided = process.env.TEST_MONGODB_URI;
  if (provided) {
    await mongoose.connect(provided, { serverSelectionTimeoutMS: 30_000 });
  } else {
    const { MongoMemoryServer } = await import('mongodb-memory-server');
    const server = await MongoMemoryServer.create();
    mongo = { stop: () => server.stop() };
    await mongoose.connect(server.getUri());
  }
}, 120_000);

afterEach(async () => {
  const collections = mongoose.connection.collections;
  for (const key of Object.keys(collections)) {
    await collections[key].deleteMany({});
  }
  // Reset the in-process job engine so buffered jobs never leak across tests.
  __setEngine(null);
});

afterAll(async () => {
  await mongoose.disconnect();
  if (mongo) await mongo.stop();
});
