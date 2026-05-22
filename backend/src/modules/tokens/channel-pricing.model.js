import mongoose from 'mongoose';

const { Schema, Types } = mongoose;

export const CHANNEL_PRICING_CHANNELS = Object.freeze(['email', 'sms', 'whatsapp']);
export const CHANNEL_PRICING_STATUSES = Object.freeze(['active', 'inactive']);

// One document per channel describing how many tokens each recipient costs.
// The active document is the current rate; historical ledger entries record
// the rate they paid in their metadata, so updating the document never
// rewrites past sends.
const channelPricingRuleSchema = new Schema(
  {
    channel: {
      type: String,
      enum: CHANNEL_PRICING_CHANNELS,
      required: true,
      unique: true,
      index: true,
    },
    tokensPerRecipient: {
      type: Number,
      required: true,
      min: 1,
      validate: {
        validator: Number.isInteger,
        message: 'tokensPerRecipient must be a positive integer',
      },
    },
    status: {
      type: String,
      enum: CHANNEL_PRICING_STATUSES,
      default: 'active',
    },
    effectiveFrom: { type: Date, default: () => new Date() },
    updatedBy: { type: Types.ObjectId, ref: 'User', default: null },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

const toPublic = (_doc, ret) => {
  ret.id = ret._id?.toString();
  delete ret._id;
  return ret;
};

channelPricingRuleSchema.set('toJSON', {
  virtuals: true,
  versionKey: false,
  transform: toPublic,
});
channelPricingRuleSchema.set('toObject', {
  virtuals: true,
  versionKey: false,
  transform: toPublic,
});

export const ChannelPricingRule =
  mongoose.models.ChannelPricingRule ??
  mongoose.model('ChannelPricingRule', channelPricingRuleSchema);
