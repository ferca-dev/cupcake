import mongoose from 'mongoose';

const { Schema, Types } = mongoose;

export const CONTACT_GROUP_STATUSES = Object.freeze(['active', 'archived']);

/**
 * Tenant-scoped folders/segments used to bulk-target contacts in campaigns.
 * Groups are intentionally lightweight: membership is the reverse-side of the
 * `Contact.groupIds` array — the service layer keeps both sides consistent so
 * the UI can list either direction without an aggregation stage.
 */
const contactGroupSchema = new Schema(
  {
    tenantId: {
      type: Types.ObjectId,
      ref: 'Tenant',
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, default: null, trim: true, maxlength: 500 },
    status: {
      type: String,
      enum: CONTACT_GROUP_STATUSES,
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

contactGroupSchema.index({ tenantId: 1, status: 1 });
contactGroupSchema.index({ tenantId: 1, name: 1 }, { unique: true });

const toPublic = (_doc, ret) => {
  ret.id = ret._id?.toString();
  delete ret._id;
  return ret;
};

contactGroupSchema.set('toJSON', { virtuals: true, versionKey: false, transform: toPublic });
contactGroupSchema.set('toObject', { virtuals: true, versionKey: false, transform: toPublic });

export const ContactGroup =
  mongoose.models.ContactGroup ?? mongoose.model('ContactGroup', contactGroupSchema);
