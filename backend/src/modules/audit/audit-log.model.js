import mongoose from 'mongoose';

const { Schema, Types } = mongoose;

const auditLogSchema = new Schema(
  {
    tenantId: { type: Types.ObjectId, ref: 'Tenant', default: null, index: true },
    userId: { type: Types.ObjectId, ref: 'User', default: null, index: true },
    action: { type: String, required: true, index: true },
    entityType: { type: String, required: true },
    entityId: { type: String, default: null },
    metadata: { type: Schema.Types.Mixed, default: {} },
    ip: { type: String, default: null },
    userAgent: { type: String, default: null },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    versionKey: false,
  },
);

// Tenant audit feeds (recent activity widgets) read by tenant in time order.
auditLogSchema.index({ tenantId: 1, createdAt: -1 });

auditLogSchema.set('toJSON', {
  virtuals: true,
  versionKey: false,
  transform: (_doc, ret) => {
    ret.id = ret._id?.toString();
    delete ret._id;
    return ret;
  },
});

export const AuditLog = mongoose.models.AuditLog ?? mongoose.model('AuditLog', auditLogSchema);
