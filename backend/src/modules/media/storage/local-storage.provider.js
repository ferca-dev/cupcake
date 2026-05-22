import fs from 'node:fs/promises';
import path from 'node:path';

import { assertPathInside, joinPublicUrl, normalizeObjectKey } from './storage-utils.js';

export class LocalStorageProvider {
  constructor({ uploadsDir, publicBaseUrl }) {
    this.driver = 'local';
    this.uploadsDir = path.resolve(uploadsDir);
    this.publicBaseUrl = publicBaseUrl;
  }

  async uploadImage({ key, buffer }) {
    const normalizedKey = normalizeObjectKey(key);
    const targetPath = path.join(this.uploadsDir, normalizedKey);
    assertPathInside(this.uploadsDir, targetPath);
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.writeFile(targetPath, buffer);
    return {
      storageKey: normalizedKey,
      publicUrl: joinPublicUrl(this.publicBaseUrl, normalizedKey),
      isPublic: Boolean(this.publicBaseUrl),
      bucket: null,
    };
  }

  async deleteImage({ key }) {
    const normalizedKey = normalizeObjectKey(key);
    const targetPath = path.join(this.uploadsDir, normalizedKey);
    assertPathInside(this.uploadsDir, targetPath);
    try {
      await fs.unlink(targetPath);
    } catch (err) {
      if (err?.code !== 'ENOENT') throw err;
    }
  }

  async getImageUrl({ key }) {
    return {
      url: joinPublicUrl(this.publicBaseUrl, key),
      expiresAt: null,
      isPublic: Boolean(this.publicBaseUrl),
    };
  }
}
