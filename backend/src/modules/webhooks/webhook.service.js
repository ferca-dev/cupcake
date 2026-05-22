import { CampaignRecipient } from '../campaigns/campaign-recipient.model.js';

/**
 * Status transitions for Twilio MessageStatus values. We promote a recipient
 * forward only — once a message is delivered or has been opened/clicked we
 * never regress to `sent`. Unknown statuses are ignored so a future Twilio
 * status code does not corrupt the report.
 */
const TWILIO_STATUS_MAP = {
  queued: { status: 'pending', timestampField: null },
  sending: { status: 'pending', timestampField: null },
  sent: { status: 'sent', timestampField: 'sentAt' },
  delivered: { status: 'delivered', timestampField: 'deliveredAt' },
  read: { status: 'opened', timestampField: 'openedAt' },
  undelivered: { status: 'failed', timestampField: null },
  failed: { status: 'failed', timestampField: null },
};

const STATUS_RANK = {
  pending: 0,
  sent: 1,
  failed: 1,
  skipped: 1,
  delivered: 2,
  opened: 3,
  clicked: 4,
};

const canPromote = (current, next) => (STATUS_RANK[next] ?? 0) >= (STATUS_RANK[current] ?? 0);

export const recordTwilioStatusEvent = async ({ messageSid, messageStatus, errorCode = null }) => {
  if (!messageSid || !messageStatus) return null;
  const mapping = TWILIO_STATUS_MAP[messageStatus];
  if (!mapping) return null;

  const recipient = await CampaignRecipient.findOne({ providerMessageId: messageSid });
  if (!recipient) return null;
  if (!canPromote(recipient.status, mapping.status)) return recipient;

  recipient.status = mapping.status;
  if (mapping.timestampField && !recipient[mapping.timestampField]) {
    recipient[mapping.timestampField] = new Date();
  }
  if (mapping.status === 'failed') {
    recipient.failureReason = errorCode ? `twilio_${errorCode}` : 'twilio_delivery_failed';
  }
  await recipient.save();
  return recipient;
};

const SENDGRID_EVENT_MAP = {
  delivered: { status: 'delivered', timestampField: 'deliveredAt' },
  open: { status: 'opened', timestampField: 'openedAt' },
  click: { status: 'clicked', timestampField: 'clickedAt' },
  bounce: { status: 'failed', timestampField: null, failureReason: 'sendgrid_bounce' },
  dropped: { status: 'failed', timestampField: null, failureReason: 'sendgrid_dropped' },
  deferred: { status: 'pending', timestampField: null },
  processed: { status: 'sent', timestampField: 'sentAt' },
};

const findRecipientForSendGridEvent = async (event) => {
  if (event?.submissionToken) {
    const byToken = await CampaignRecipient.findOne({ submissionToken: event.submissionToken });
    if (byToken) return byToken;
  }
  if (event?.sg_message_id) {
    return CampaignRecipient.findOne({ providerMessageId: event.sg_message_id });
  }
  return null;
};

export const recordSendGridEvent = async (event) => {
  if (!event?.event) return null;
  const mapping = SENDGRID_EVENT_MAP[event.event];
  if (!mapping) return null;

  const recipient = await findRecipientForSendGridEvent(event);
  if (!recipient) return null;
  if (!canPromote(recipient.status, mapping.status)) return recipient;

  recipient.status = mapping.status;
  if (mapping.timestampField && !recipient[mapping.timestampField]) {
    recipient[mapping.timestampField] = new Date();
  }
  if (mapping.failureReason) {
    recipient.failureReason = mapping.failureReason;
  }
  await recipient.save();
  return recipient;
};

export const __testing = {
  TWILIO_STATUS_MAP,
  SENDGRID_EVENT_MAP,
  canPromote,
};
