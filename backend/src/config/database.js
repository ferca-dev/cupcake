import mongoose from 'mongoose';
import { logger } from '../common/utils/logger.js';
import { loadEnv } from './env.js';

const env = loadEnv();

mongoose.set('strictQuery', true);
mongoose.set('sanitizeFilter', true);

const attachConnectionListeners = (connection) => {
  connection.on('connected', () => {
    logger.info({ host: connection.host, name: connection.name }, 'MongoDB connected');
  });
  connection.on('disconnected', () => {
    logger.warn('MongoDB disconnected');
  });
  connection.on('reconnected', () => {
    logger.info('MongoDB reconnected');
  });
  connection.on('error', (err) => {
    logger.error({ err }, 'MongoDB connection error');
  });
};

let listenersAttached = false;

/**
 * Opens the MongoDB connection. Resolves once the underlying connection is
 * established, rejects with a clear error if the URI is unreachable.
 */
export const connectDatabase = async () => {
  if (!listenersAttached) {
    attachConnectionListeners(mongoose.connection);
    listenersAttached = true;
  }

  try {
    await mongoose.connect(env.MONGODB_URI, {
      serverSelectionTimeoutMS: 10_000,
      dbName: env.MONGODB_DB_NAME || undefined,
      maxPoolSize: 5,
      autoIndex: !env.isProduction,
    });
    return mongoose.connection;
  } catch (err) {
    logger.error({ err }, 'Failed to connect to MongoDB');
    throw err;
  }
};

/**
 * Closes the MongoDB connection. Safe to call when no connection is open.
 */
export const disconnectDatabase = async () => {
  if (mongoose.connection.readyState === 0) return;
  await mongoose.disconnect();
  logger.info('MongoDB connection closed');
};

export const getConnectionState = () => {
  const states = ['disconnected', 'connected', 'connecting', 'disconnecting', 'uninitialized'];
  return states[mongoose.connection.readyState] ?? 'unknown';
};

export { mongoose };
