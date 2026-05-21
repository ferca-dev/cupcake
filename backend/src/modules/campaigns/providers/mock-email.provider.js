import { isValidEmail, normaliseEmail } from '../../contacts/contact.validation.js';

/**
 * Mock email provider used for tests and local development. Predictable
 * behaviour: any recipient whose local part contains `fail` returns a failure
 * so tests can exercise the failure branch without a real provider.
 */
export const createMockEmailProvider = () => ({
  getProviderName() {
    return 'mock-email';
  },

  validateRecipient(contact) {
    if (!contact) return { ready: false, reason: 'missing_email', recipient: null };
    if (contact.status === 'blocked') {
      return { ready: false, reason: 'contact_blocked', recipient: null };
    }
    if (contact.status === 'archived') {
      return { ready: false, reason: 'contact_archived', recipient: null };
    }
    const normalised = normaliseEmail(contact.email ?? null);
    if (!normalised) return { ready: false, reason: 'missing_email', recipient: null };
    if (!isValidEmail(normalised)) {
      return { ready: false, reason: 'invalid_email', recipient: null };
    }
    return { ready: true, reason: null, recipient: normalised };
  },

  async send(payload) {
    const recipient = payload?.recipient ?? '';
    if (/fail/i.test(recipient)) {
      return {
        success: false,
        provider: 'mock-email',
        providerMessageId: null,
        reason: 'mock_failure',
      };
    }
    return {
      success: true,
      provider: 'mock-email',
      providerMessageId: `mock-email-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
      reason: null,
    };
  },
});
