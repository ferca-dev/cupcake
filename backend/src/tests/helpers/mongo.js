import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

let mongoServer = null;

/**
 * Boots an in-process MongoDB instance and connects Mongoose to it. Tests can
 * exercise real model behaviour (indexes, validators, queries) without
 * requiring a running database.
 */
export const startInMemoryMongo = async () => {
  if (mongoServer) return mongoServer.getUri();
  mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();
  await mongoose.connect(uri);
  return uri;
};

export const stopInMemoryMongo = async () => {
  await mongoose.disconnect();
  if (mongoServer) {
    await mongoServer.stop();
    mongoServer = null;
  }
};

export const clearCollections = async () => {
  const { collections } = mongoose.connection;
  await Promise.all(Object.values(collections).map((c) => c.deleteMany({})));
};
