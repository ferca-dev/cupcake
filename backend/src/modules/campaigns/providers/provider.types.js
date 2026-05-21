/**
 * Shape every messaging provider must implement. The campaign send service
 * never reads provider-specific fields from contacts — it always goes through
 * `validateRecipient` so a future Twilio/SES/WhatsApp Business adapter can be
 * dropped in by registering a different factory in `provider.factory.js`.
 *
 * @typedef {Object} MessagePayload
 * @property {string} channel - 'email' | 'sms' | 'whatsapp'
 * @property {string} recipient - Address validated for the channel.
 * @property {string} submissionToken - Per-recipient submission token.
 * @property {string} publicUrl - Public URL for the recipient.
 * @property {{ id: string|null, fullName: string|null }} contact
 * @property {{ id: string, name: string }} campaign
 * @property {{ id: string, title: string, slug: string }} survey
 *
 * @typedef {Object} SendResult
 * @property {boolean} success
 * @property {string} provider
 * @property {string|null} providerMessageId
 * @property {string|null} reason - Failure reason when `success` is false.
 *
 * @typedef {Object} RecipientValidation
 * @property {boolean} ready
 * @property {string|null} reason - Stable skip reason when not ready.
 * @property {string|null} recipient - Normalised address when ready.
 *
 * @typedef {Object} MessagingProvider
 * @property {() => string} getProviderName
 * @property {(contact: object) => RecipientValidation} validateRecipient
 * @property {(payload: MessagePayload) => Promise<SendResult>} send
 */

export {};
