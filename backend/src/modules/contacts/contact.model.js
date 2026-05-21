import mongoose from 'mongoose';

const { Schema, Types } = mongoose;

export const CONTACT_STATUSES = Object.freeze(['active', 'archived', 'blocked']);

/**
 * Tenant-scoped people directory. A contact is "useful" when it has at least
 * one direct channel (email/phone/whatsappPhone) — the service layer rejects
 * documents that lack every channel so future campaign sends can pick a
 * reachable address. The same fields are normalised here (lowercase email,
 * digit-only phone-like values) so equality lookups and dedupe behave
 * predictably.
 */
const contactSchema = new Schema(
  {
    tenantId: {
      type: Types.ObjectId,
      ref: 'Tenant',
      required: true,
      index: true,
    },
    firstName: { type: String, default: null, trim: true, maxlength: 120 },
    lastName: { type: String, default: null, trim: true, maxlength: 120 },
    fullName: { type: String, default: null, trim: true, maxlength: 240 },
    email: {
      type: String,
      default: null,
      trim: true,
      lowercase: true,
      maxlength: 200,
    },
    phone: { type: String, default: null, trim: true, maxlength: 40 },
    whatsappPhone: { type: String, default: null, trim: true, maxlength: 40 },
    tags: { type: [String], default: () => [] },
    groupIds: {
      type: [{ type: Types.ObjectId, ref: 'ContactGroup' }],
      default: () => [],
    },
    metadata: { type: Schema.Types.Mixed, default: () => ({}) },
    status: {
      type: String,
      enum: CONTACT_STATUSES,
      default: 'active',
      required: true,
      index: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

contactSchema.index({ tenantId: 1, status: 1 });
contactSchema.index({ tenantId: 1, email: 1 });
contactSchema.index({ tenantId: 1, phone: 1 });
contactSchema.index({ tenantId: 1, whatsappPhone: 1 });
contactSchema.index({ tenantId: 1, groupIds: 1 });
contactSchema.index({ tenantId: 1, tags: 1 });
contactSchema.index({ tenantId: 1, fullName: 1 });

const toPublic = (_doc, ret) => {
  ret.id = ret._id?.toString();
  delete ret._id;
  return ret;
};

contactSchema.set('toJSON', { virtuals: true, versionKey: false, transform: toPublic });
contactSchema.set('toObject', { virtuals: true, versionKey: false, transform: toPublic });

export const Contact = mongoose.models.Contact ?? mongoose.model('Contact', contactSchema);
