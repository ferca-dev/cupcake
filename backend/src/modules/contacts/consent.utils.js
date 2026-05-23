export const CONSENT_CHANNELS = Object.freeze(['email', 'sms', 'whatsapp']);

export const CONTACT_CONSENT_STATUSES = Object.freeze([
  'subscribed',
  'unsubscribed',
  'pending',
  'unknown',
]);

export const CONTACT_CONSENT_SOURCES = Object.freeze([
  'manual',
  'import',
  'email_unsubscribe',
  'twilio',
  'whatsapp',
  'provider',
  'system',
]);

export const CHANNEL_CONSENT_KEYS = Object.freeze({
  email: 'email',
  sms: 'sms',
  whatsapp: 'whatsapp',
});

export const CHANNEL_ADDRESS_FIELDS = Object.freeze({
  email: 'email',
  sms: 'phone',
  whatsapp: 'whatsappPhone',
});

export const defaultConsentState = (source = 'system') => ({
  status: 'subscribed',
  source,
  changedAt: new Date(),
  metadata: {},
});

export const normalizeConsentState = (value, fallbackSource = 'system') => ({
  status: CONTACT_CONSENT_STATUSES.includes(value?.status)
    ? value.status
    : defaultConsentState(fallbackSource).status,
  source:
    typeof value?.source === 'string' && value.source.trim() ? value.source.trim() : fallbackSource,
  changedAt: value?.changedAt instanceof Date ? value.changedAt : (value?.changedAt ?? new Date()),
  metadata: value?.metadata && typeof value.metadata === 'object' ? value.metadata : {},
});

export const normalizeConsentBlock = (consent = {}, fallbackSource = 'system') =>
  Object.fromEntries(
    CONSENT_CHANNELS.map((channel) => [
      channel,
      normalizeConsentState(consent?.[channel], fallbackSource),
    ]),
  );

export const isConsentGranted = (contact, channel) => {
  const key = CHANNEL_CONSENT_KEYS[channel];
  if (!key) return false;
  const state = normalizeConsentState(contact?.consent?.[key]);
  return state.status === 'subscribed';
};

export const consentSkipReason = (channel, contact) => {
  const key = CHANNEL_CONSENT_KEYS[channel];
  const state = normalizeConsentState(contact?.consent?.[key]);
  if (state.status === 'unsubscribed') return `${channel}_consent_opted_out`;
  return `${channel}_consent_missing`;
};
