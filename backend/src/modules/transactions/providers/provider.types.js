/**
 * Payment provider contract.
 *
 * No real provider is wired up yet — this file documents the interface a
 * future Stripe, MercadoPago, or other adapter must implement so the
 * transactions module can stay provider-agnostic.
 *
 * A provider is plugged in through `provider.factory.js` (created when the
 * first real adapter ships). The transactions service never imports a
 * concrete provider directly — it goes through the factory so swapping the
 * underlying SDK never reaches business logic.
 *
 * ```js
 * {
 *   getProviderName(): string,
 *
 *   // Create a payment intent / order on the remote system. Should return
 *   // a stable `providerReference` so reconciliation can locate the
 *   // transaction without ambiguity.
 *   createCharge({
 *     tenantId, amount, currency, description, planCode, metadata
 *   }): Promise<{ providerReference, status, paidAt, raw }>,
 *
 *   // Refund a previous charge. Returns the new transaction's reference
 *   // (refunds remain linked to the original payment via the audit log).
 *   refundCharge({ providerReference, amount, reason }):
 *     Promise<{ providerReference, status, raw }>,
 *
 *   // Translate a remote webhook payload into our canonical status. Lets
 *   // each adapter normalise vendor-specific event names to one of the
 *   // statuses defined by the Transaction model.
 *   normalizeStatus(rawStatus): 'pending' | 'paid' | 'failed' | 'refunded' | 'cancelled',
 * }
 * ```
 *
 * Until a real adapter exists the seeders create transactions directly with
 * `provider: null` so the UI can render history without implying any
 * external processing happened.
 */
