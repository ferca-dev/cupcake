import { del, head, put } from '@vercel/blob';
import { normalizeObjectKey } from './storage-utils.js';

export class VercelBlobStorageProvider {
  constructor({ token, storeId }) {
    this.driver = 'vercel-blob';
    this.options = token ? { token } : { storeId };
  }

  async uploadImage({ key, buffer, contentType }) {
    const stored = await put(normalizeObjectKey(key), buffer, {
      ...this.options,
      access: 'public',
      contentType,
      addRandomSuffix: false,
      allowOverwrite: false,
    });
    return {
      storageKey: stored.pathname,
      publicUrl: stored.url,
      isPublic: true,
      bucket: null,
    };
  }

  async deleteImage({ key }) {
    await del(normalizeObjectKey(key), this.options);
  }

  async getImageUrl({ key }) {
    const stored = await head(normalizeObjectKey(key), this.options);
    return { url: stored.url, expiresAt: null, isPublic: true };
  }
}
