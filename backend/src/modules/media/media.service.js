import crypto from 'node:crypto';
import path from 'node:path';

import { fileTypeFromBuffer } from 'file-type';
import { imageSize } from 'image-size';
import mongoose from 'mongoose';

import * as repo from './media.repository.js';
import {
  IMAGE_EXTENSIONS,
  IMAGE_MIME_TYPES,
  MAX_IMAGE_DIMENSION,
  MAX_IMAGE_PIXELS,
} from './media.constants.js';
import { createStorageProvider } from './storage/index.js';
import { AuthorizationError, NotFoundError, ValidationError } from '../../common/errors/index.js';
import { loadEnv } from '../../config/env.js';

const PURPOSE_SEGMENTS = Object.freeze({
  survey_image: 'surveys',
  template_image: 'templates',
  tenant_branding: 'branding',
  general: 'general',
});

const assertObjectId = (id, label = 'id') => {
  if (!mongoose.isValidObjectId(id)) {
    throw new ValidationError(`Invalid ${label}`);
  }
};

const ensureTenant = (tenantId) => {
  if (!tenantId) {
    throw new AuthorizationError('Tenant context is required');
  }
  return tenantId.toString();
};

const safeOriginalName = (name) => {
  const base = Array.from(path.basename(String(name ?? 'image')))
    .filter((char) => {
      const code = char.charCodeAt(0);
      return code >= 32 && code !== 127;
    })
    .join('')
    .trim();
  return (base || 'image').slice(0, 255);
};

const extensionForDetectedType = (detected) => (detected.ext === 'jpg' ? 'jpg' : detected.ext);

const validateImage = async ({ file, maxBytes }) => {
  if (!file?.buffer || file.buffer.length === 0) {
    throw new ValidationError('Image file is required', [
      { path: ['image'], message: 'Attach an image file using the image field' },
    ]);
  }

  if (file.size > maxBytes) {
    throw new ValidationError('Image is too large', [
      { path: ['image'], message: 'Image exceeds the configured upload size limit' },
    ]);
  }

  const originalName = safeOriginalName(file.originalname);
  const declaredExtension = path.extname(originalName).replace('.', '').toLowerCase();
  if (!IMAGE_EXTENSIONS.includes(declaredExtension)) {
    throw new ValidationError('Unsupported image extension', [
      {
        path: ['image'],
        message: 'Only PNG, JPEG, and WebP image files are allowed',
      },
    ]);
  }

  const detected = await fileTypeFromBuffer(file.buffer);
  if (!detected || !IMAGE_MIME_TYPES.includes(detected.mime)) {
    throw new ValidationError('Unsupported image type', [
      {
        path: ['image'],
        message: 'Only PNG, JPEG, and WebP image files are allowed',
      },
    ]);
  }

  if (file.mimetype && !IMAGE_MIME_TYPES.includes(file.mimetype)) {
    throw new ValidationError('Declared file type is not allowed', [
      { path: ['image'], message: 'The uploaded file must be an image' },
    ]);
  }

  let dimensions;
  try {
    dimensions = imageSize(file.buffer);
  } catch {
    throw new ValidationError('Image dimensions could not be read', [
      { path: ['image'], message: 'The image file is malformed or unsupported' },
    ]);
  }

  const { width, height } = dimensions;
  if (!width || !height) {
    throw new ValidationError('Image dimensions could not be read', [
      { path: ['image'], message: 'The image file has no readable dimensions' },
    ]);
  }

  if (
    width > MAX_IMAGE_DIMENSION ||
    height > MAX_IMAGE_DIMENSION ||
    width * height > MAX_IMAGE_PIXELS
  ) {
    throw new ValidationError('Image dimensions are too large', [
      {
        path: ['image'],
        message: `Images must be at most ${MAX_IMAGE_DIMENSION}px on either side`,
      },
    ]);
  }

  return {
    originalName,
    detected,
    extension: extensionForDetectedType(detected),
    dimensions: { width, height },
  };
};

const buildStorageKey = ({ tenantId, purpose, extension }) => {
  const now = new Date();
  const year = String(now.getUTCFullYear());
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const purposeSegment = PURPOSE_SEGMENTS[purpose] ?? PURPOSE_SEGMENTS.general;
  return [
    'tenants',
    tenantId.toString(),
    purposeSegment,
    year,
    month,
    `${crypto.randomUUID()}.${extension}`,
  ].join('/');
};

const checksum = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');

const toPublicAsset = (asset, urlInfo = null) => ({
  id: asset._id.toString(),
  tenantId: asset.tenantId.toString(),
  ownerUserId: asset.ownerUserId.toString(),
  purpose: asset.purpose,
  originalName: asset.originalName,
  mimeType: asset.mimeType,
  extension: asset.extension,
  sizeBytes: asset.sizeBytes,
  dimensions: asset.dimensions,
  checksumSha256: asset.checksumSha256,
  storageDriver: asset.storageDriver,
  storageKey: asset.storageKey,
  bucket: asset.bucket ?? null,
  publicUrl: asset.publicUrl ?? null,
  url: asset.publicUrl ?? urlInfo?.url ?? null,
  urlExpiresAt: urlInfo?.expiresAt ?? null,
  isPublic: asset.isPublic,
  status: asset.status,
  deletedAt: asset.deletedAt ?? null,
  createdAt: asset.createdAt,
  updatedAt: asset.updatedAt,
});

const requireAsset = async ({ id, tenantId, includeDeleted = false }) => {
  assertObjectId(id, 'media asset id');
  const asset = await repo.findAssetById({ id, tenantId, includeDeleted });
  if (!asset) {
    throw new NotFoundError('Media asset not found');
  }
  return asset;
};

export const uploadImage = async ({ tenantId, actor, file, purpose = 'general' }) => {
  const tenant = ensureTenant(tenantId);
  const env = loadEnv();
  const validated = await validateImage({ file, maxBytes: env.MAX_IMAGE_UPLOAD_BYTES });
  const storage = createStorageProvider(env);
  const storageKey = buildStorageKey({
    tenantId: tenant,
    purpose,
    extension: validated.extension,
  });

  const stored = await storage.uploadImage({
    key: storageKey,
    buffer: file.buffer,
    contentType: validated.detected.mime,
  });

  const asset = await repo.createAsset({
    tenantId: tenant,
    ownerUserId: actor.id,
    purpose,
    originalName: validated.originalName,
    mimeType: validated.detected.mime,
    extension: validated.extension,
    sizeBytes: file.size,
    dimensions: validated.dimensions,
    checksumSha256: checksum(file.buffer),
    storageDriver: storage.driver,
    storageKey: stored.storageKey,
    bucket: stored.bucket ?? null,
    publicUrl: stored.publicUrl ?? null,
    isPublic: stored.isPublic,
    metadata: {
      declaredMimeType: file.mimetype || null,
    },
  });

  const urlInfo = asset.publicUrl ? null : await storage.getImageUrl({ key: asset.storageKey });
  return toPublicAsset(asset, urlInfo);
};

export const listImages = async ({ tenantId, ...query }) => {
  const tenant = ensureTenant(tenantId);
  const result = await repo.listAssets({ tenantId: tenant, ...query });
  return {
    items: result.items.map((asset) => toPublicAsset(asset)),
    pagination: {
      page: result.page,
      limit: result.limit,
      total: result.total,
      totalPages: result.limit > 0 ? Math.ceil(result.total / result.limit) : 1,
    },
  };
};

export const getImage = async ({ id, tenantId }) => {
  const tenant = ensureTenant(tenantId);
  const asset = await requireAsset({ id, tenantId: tenant });
  return toPublicAsset(asset);
};

export const getImageUrl = async ({ id, tenantId }) => {
  const tenant = ensureTenant(tenantId);
  const asset = await requireAsset({ id, tenantId: tenant });
  const storage = createStorageProvider(loadEnv());
  const urlInfo = await storage.getImageUrl({ key: asset.storageKey });
  asset.lastAccessedAt = new Date();
  await repo.saveAsset(asset);
  return {
    asset: toPublicAsset(asset, urlInfo),
    url: urlInfo.url,
    expiresAt: urlInfo.expiresAt,
    isPublic: urlInfo.isPublic,
  };
};

export const deleteImage = async ({ id, tenantId }) => {
  const tenant = ensureTenant(tenantId);
  const asset = await requireAsset({ id, tenantId: tenant });
  asset.status = 'deleted';
  asset.deletedAt = new Date();
  await repo.saveAsset(asset);
  return { id: asset._id.toString(), deletedAt: asset.deletedAt };
};

/**
 * Physical object deletion is intentionally separate from the public DELETE
 * endpoint. Published survey versions may still point at an image URL; a
 * retention job can call this helper after references have aged out.
 */
export const purgeDeletedImages = async ({ olderThan, limit = 100 } = {}) => {
  const cutoff = olderThan ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const storage = createStorageProvider(loadEnv());
  const deleted = await repo.findDeletedBefore({ before: cutoff, limit });
  const purged = [];

  for (const asset of deleted) {
    await storage.deleteImage({ key: asset.storageKey });
    await repo.removeAssetDocument(asset);
    purged.push(asset._id.toString());
  }

  return { purged };
};

export const __testing = {
  buildStorageKey,
  validateImage,
};
