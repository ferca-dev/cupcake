import { isValidPhoneLike, normalisePhone } from '../../contacts/contact.validation.js';

/**
 * Mock SMS provider. Recipients whose digits end with `0000` trigger a
 * deterministic failure, mirroring the email provider's `fail` heuristic.
 */
export const createMockSmsProvider = () => ({
  getProviderName() {
    return 'mock-sms';
  },

  validateRecipient(contact) {
    if (!contact) return { ready: false, reason: 'missing_phone', recipient: null };
    if (contact.status === 'blocked') {
      return { ready: false, reason: 'contact_blocked', recipient: null };
    }
    if (contact.status === 'archived') {
      return { ready: false, reason: 'contact_archived', recipient: null };
    }
    const normalised = normalisePhone(contact.phone ?? null);
    if (!normalised) return { ready: false, reason: 'missing_phone', recipient: null };
    if (!isValidPhoneLike(normalised)) {
      return { ready: false, reason: 'invalid_phone', recipient: null };
    }
    return { ready: true, reason: null, recipient: normalised };
  },

  async send(payload) {
    const recipient = payload?.recipient ?? '';
    if (/0000$/.test(recipient)) {
      return {
        success: false,
        provider: 'mock-sms',
        providerMessageId: null,
        reason: 'mock_failure',
      };
    }
    return {
      success: true,
      provider: 'mock-sms',
      providerMessageId: `mock-sms-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
      reason: null,
    };
  },
});
