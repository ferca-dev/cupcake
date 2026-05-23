import mongoose from 'mongoose';

const { Schema, Types } = mongoose;

// One invoice per authorised subscription payment. Mercado Pago calls these
// "authorized payments" — they have a stable id and a payer email and reflect
// a single charge against a preapproval. We store them so:
//   - tokens get credited exactly once per `mercadoPagoAuthorizedPaymentId`
//     (the unique index is the enforcement),
//   - the client UI can list a full billing history without paginating against
//     Mercado Pago,
//   - failed-payment retry reminders can be scheduled deterministically.

export const INVOICE_STATUSES = Object.freeze([
  'scheduled',
  'processed',
  'recycling',
  'rejected',
  'cancelled',
  'refunded',
]);

const invoiceSchema = new Schema(
  {
    tenantId: { type: Types.ObjectId, ref: 'Tenant', required: true, index: true },
    subscriptionId: {
      type: Types.ObjectId,
      ref: 'TenantSubscription',
      required: true,
      index: true,
    },
    mercadoPagoAuthorizedPaymentId: { type: String, required: true },
    mercadoPagoPaymentId: { type: String, default: null },
    status: { type: String, enum: INVOICE_STATUSES, default: 'scheduled', index: true },
    amountMinor: { type: Number, required: true, min: 0 },
    currency: { type: String, required: true, uppercase: true },
    periodStart: { type: Date, default: null },
    periodEnd: { type: Date, default: null },
    paidAt: { type: Date, default: null },
    tokenCredited: { type: Boolean, default: false },
    tokenLedgerEntryId: { type: Types.ObjectId, ref: 'TokenLedgerEntry', default: null },
    paymentTransactionId: {
      type: Types.ObjectId,
      ref: 'PaymentTransaction',
      default: null,
    },
    failureReason: { type: String, default: null },
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, versionKey: false },
);

invoiceSchema.index(
  { mercadoPagoAuthorizedPaymentId: 1 },
  {
    unique: true,
    partialFilterExpression: { mercadoPagoAuthorizedPaymentId: { $type: 'string' } },
  },
);
invoiceSchema.index({ tenantId: 1, createdAt: -1 });

const toPublic = (_doc, ret) => {
  ret.id = ret._id?.toString();
  delete ret._id;
  return ret;
};

invoiceSchema.set('toJSON', { virtuals: true, versionKey: false, transform: toPublic });
invoiceSchema.set('toObject', { virtuals: true, versionKey: false, transform: toPublic });

export const SubscriptionInvoice =
  mongoose.models.SubscriptionInvoice ?? mongoose.model('SubscriptionInvoice', invoiceSchema);
