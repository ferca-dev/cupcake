import { loadEnv } from '../../../config/env.js';
import { LocalStorageProvider } from './local-storage.provider.js';
import { S3StorageProvider } from './s3-storage.provider.js';

export const createStorageProvider = (env = loadEnv()) => {
  if (env.STORAGE_DRIVER === 's3') {
    return new S3StorageProvider({
      endpoint: env.S3_ENDPOINT,
      region: env.S3_REGION,
      bucket: env.S3_BUCKET,
      accessKeyId: env.S3_ACCESS_KEY_ID,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY,
      publicBaseUrl: env.S3_PUBLIC_BASE_URL,
    });
  }

  return new LocalStorageProvider({
    uploadsDir: env.LOCAL_UPLOADS_DIR,
    publicBaseUrl: env.STORAGE_PUBLIC_BASE_URL,
  });
};
