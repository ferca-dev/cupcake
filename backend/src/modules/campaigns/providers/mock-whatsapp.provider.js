import { isValidPhoneLike, normalisePhone } from '../../contacts/contact.validation.js';

/**
 * Mock WhatsApp provider. Mirrors the SMS heuristic so tests can target a
 * predictable failure path without touching the recipient validation logic.
 */
export const createMockWhatsappProvider = () => ({
  getProviderName() {
    return 'mock-whatsapp';
  },

  validateRecipient(contact) {
    if (!contact) {
      return { ready: false, reason: 'missing_whatsapp_phone', recipient: null };
    }
    if (contact.status === 'blocked') {
      return { ready: false, reason: 'contact_blocked', recipient: null };
    }
    if (contact.status === 'archived') {
      return { ready: false, reason: 'contact_archived', recipient: null };
    }
    const normalised = normalisePhone(contact.whatsappPhone ?? null);
    if (!normalised) {
      return { ready: false, reason: 'missing_whatsapp_phone', recipient: null };
    }
    if (!isValidPhoneLike(normalised)) {
      return { ready: false, reason: 'invalid_whatsapp_phone', recipient: null };
    }
    return { ready: true, reason: null, recipient: normalised };
  },

  async send(payload) {
    const recipient = payload?.recipient ?? '';
    if (/0000$/.test(recipient)) {
      return {
        success: false,
        provider: 'mock-whatsapp',
        providerMessageId: null,
        reason: 'mock_failure',
      };
    }
    return {
      success: true,
      provider: 'mock-whatsapp',
      providerMessageId: `mock-whatsapp-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
      reason: null,
    };
  },
});
