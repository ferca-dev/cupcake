import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import { joinPublicUrl, normalizeObjectKey } from './storage-utils.js';

const DEFAULT_SIGNED_URL_SECONDS = 15 * 60;

export class S3StorageProvider {
  constructor({ endpoint, region, bucket, accessKeyId, secretAccessKey, publicBaseUrl }) {
    this.driver = 's3';
    this.bucket = bucket;
    this.publicBaseUrl = publicBaseUrl || '';
    this.client = new S3Client({
      endpoint: endpoint || undefined,
      region,
      forcePathStyle: Boolean(endpoint),
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });
  }

  async uploadImage({ key, buffer, contentType }) {
    const normalizedKey = normalizeObjectKey(key);
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: normalizedKey,
        Body: buffer,
        ContentType: contentType,
      }),
    );

    return {
      storageKey: normalizedKey,
      publicUrl: joinPublicUrl(this.publicBaseUrl, normalizedKey),
      isPublic: Boolean(this.publicBaseUrl),
      bucket: this.bucket,
    };
  }

  async deleteImage({ key }) {
    const normalizedKey = normalizeObjectKey(key);
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: normalizedKey,
      }),
    );
  }

  async getImageUrl({ key, expiresInSeconds = DEFAULT_SIGNED_URL_SECONDS }) {
    const normalizedKey = normalizeObjectKey(key);
    const publicUrl = joinPublicUrl(this.publicBaseUrl, normalizedKey);
    if (publicUrl) {
      return { url: publicUrl, expiresAt: null, isPublic: true };
    }

    const expiresAt = new Date(Date.now() + expiresInSeconds * 1000);
    const url = await getSignedUrl(
      this.client,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: normalizedKey,
      }),
      { expiresIn: expiresInSeconds },
    );

    return { url, expiresAt, isPublic: false };
  }
}
