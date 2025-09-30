import { MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose from 'mongoose';

let mongoReplSet: MongoMemoryReplSet;

// Setup before all tests
beforeAll(async () => {
  // Set NODE_ENV to test to avoid Redis and other production dependencies
  process.env.NODE_ENV = 'test';
  
  // Create MongoMemoryReplSet for transaction support
  mongoReplSet = await MongoMemoryReplSet.create({
    replSet: { count: 1 },
  });
  const mongoUri = mongoReplSet.getUri();
  
  await mongoose.connect(mongoUri);
}, 30000); // Increase timeout to 30 seconds

// Cleanup after all tests
afterAll(async () => {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  
  if (mongoReplSet) {
    await mongoReplSet.stop();
  }
}, 30000); // Increase timeout to 30 seconds

// Clear database between tests
afterEach(async () => {
  if (mongoose.connection.readyState === 1) {
    const collections = mongoose.connection.collections;
    
    for (const key in collections) {
      const collection = collections[key];
      await collection.deleteMany({});
    }
  }
});