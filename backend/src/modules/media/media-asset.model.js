import mongoose from 'mongoose';

import { IMAGE_MIME_TYPES, MEDIA_PURPOSES, MEDIA_STATUSES } from './media.constants.js';

const { Schema, Types } = mongoose;

const dimensionsSchema = new Schema(
  {
    width: { type: Number, required: true, min: 1 },
    height: { type: Number, required: true, min: 1 },
  },
  { _id: false },
);

const mediaAssetSchema = new Schema(
  {
    tenantId: {
      type: Types.ObjectId,
      ref: 'Tenant',
      required: true,
      index: true,
    },
    ownerUserId: {
      type: Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    purpose: {
      type: String,
      enum: MEDIA_PURPOSES,
      default: 'general',
      index: true,
    },
    originalName: { type: String, required: true, trim: true, maxlength: 255 },
    mimeType: { type: String, enum: IMAGE_MIME_TYPES, required: true },
    extension: { type: String, required: true, lowercase: true, trim: true, maxlength: 12 },
    sizeBytes: { type: Number, required: true, min: 1 },
    dimensions: { type: dimensionsSchema, required: true },
    checksumSha256: { type: String, required: true, lowercase: true, trim: true },
    storageDriver: {
      type: String,
      enum: ['local', 's3'],
      required: true,
      index: true,
    },
    storageKey: { type: String, required: true, trim: true, unique: true },
    bucket: { type: String, default: null, trim: true },
    publicUrl: { type: String, default: null, trim: true },
    isPublic: { type: Boolean, default: false },
    status: {
      type: String,
      enum: MEDIA_STATUSES,
      default: 'active',
      index: true,
    },
    deletedAt: { type: Date, default: null },
    lastAccessedAt: { type: Date, default: null },
    metadata: {
      type: Schema.Types.Mixed,
      default: () => ({}),
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

mediaAssetSchema.index({ tenantId: 1, status: 1, createdAt: -1 });
mediaAssetSchema.index({ tenantId: 1, purpose: 1, status: 1, createdAt: -1 });
mediaAssetSchema.index({ deletedAt: 1, status: 1 });

const toPublic = (_doc, ret) => {
  ret.id = ret._id?.toString();
  delete ret._id;
  return ret;
};

mediaAssetSchema.set('toJSON', { virtuals: true, versionKey: false, transform: toPublic });
mediaAssetSchema.set('toObject', { virtuals: true, versionKey: false, transform: toPublic });

export const MediaAsset =
  mongoose.models.MediaAsset ?? mongoose.model('MediaAsset', mediaAssetSchema);
