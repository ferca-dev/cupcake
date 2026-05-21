import mongoose from 'mongoose';

const { Schema, Types } = mongoose;

export const TEMPLATE_STATUSES = Object.freeze(['active', 'inactive']);

export const TEMPLATE_CATEGORIES = Object.freeze([
  'customer_satisfaction',
  'employee_feedback',
  'event_registration',
  'product_feedback',
  'nps',
  'contact_info',
  'post_service',
  'lead_capture',
  'other',
]);

const templateSchema = new Schema(
  {
    // tenantId is intentionally optional: `null` marks a system template that
    // every tenant can see and instantiate. Tenant-owned templates carry an
    // actual ObjectId and are scoped to that tenant only.
    tenantId: {
      type: Types.ObjectId,
      ref: 'Tenant',
      default: null,
    },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, default: '', trim: true, maxlength: 1000 },
    category: {
      type: String,
      enum: TEMPLATE_CATEGORIES,
      default: 'other',
      required: true,
    },
    schema: { type: Schema.Types.Mixed, required: true },
    isSystemTemplate: { type: Boolean, default: false, required: true, index: true },
    status: {
      type: String,
      enum: TEMPLATE_STATUSES,
      default: 'active',
      required: true,
      index: true,
    },
    createdBy: { type: Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: Types.ObjectId, ref: 'User', default: null },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

templateSchema.index({ tenantId: 1, status: 1 });
templateSchema.index({ tenantId: 1, createdAt: -1 });
templateSchema.index({ isSystemTemplate: 1, status: 1 });

const toPublic = (_doc, ret) => {
  ret.id = ret._id?.toString();
  delete ret._id;
  return ret;
};

templateSchema.set('toJSON', { virtuals: true, versionKey: false, transform: toPublic });
templateSchema.set('toObject', { virtuals: true, versionKey: false, transform: toPublic });

export const Template = mongoose.models.Template ?? mongoose.model('Template', templateSchema);
