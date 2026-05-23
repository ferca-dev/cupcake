import mongoose from 'mongoose';

const { Schema, Types } = mongoose;

/**
 * Immutable history of which plan a tenant was on at any point in time. Each
 * change creates a new row; the previous row is closed by stamping
 * `replacedAt` so we can query "what plan was active for tenant X at date D"
 * by selecting the row whose `[assignedAt, replacedAt]` window contains D.
 *
 * Snapshots of the plan name, code, features, and quotas are kept on the
 * assignment so that downgrades or plan deletions never rewrite history.
 */
const assignmentSchema = new Schema(
  {
    tenantId: { type: Types.ObjectId, ref: 'Tenant', required: true, index: true },
    planId: { type: Types.ObjectId, ref: 'Plan', default: null },

    // Snapshots are required even when the plan was the built-in fallback so
    // the audit trail is self-contained.
    planCodeSnapshot: { type: String, required: true },
    planNameSnapshot: { type: String, required: true },
    featuresSnapshot: { type: Schema.Types.Mixed, default: () => ({}) },
    quotasSnapshot: { type: Schema.Types.Mixed, default: () => ({}) },

    assignedAt: { type: Date, default: () => new Date() },
    replacedAt: { type: Date, default: null },

    assignedByUserId: { type: Types.ObjectId, ref: 'User', default: null },
    reason: { type: String, default: null, trim: true, maxlength: 500 },
    subscriptionId: { type: Types.ObjectId, ref: 'TenantSubscription', default: null },
    source: {
      type: String,
      enum: ['admin', 'subscription', 'system'],
      default: 'admin',
    },
  },
  { timestamps: true, versionKey: false },
);

assignmentSchema.index({ tenantId: 1, assignedAt: -1 });
assignmentSchema.index({ tenantId: 1, replacedAt: 1 });

const toPublic = (_doc, ret) => {
  ret.id = ret._id?.toString();
  delete ret._id;
  return ret;
};

assignmentSchema.set('toJSON', { virtuals: true, versionKey: false, transform: toPublic });
assignmentSchema.set('toObject', { virtuals: true, versionKey: false, transform: toPublic });

export const PlanAssignment =
  mongoose.models.PlanAssignment ?? mongoose.model('PlanAssignment', assignmentSchema);
