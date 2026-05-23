<script setup>
// Read-only landing page for the Mercado Pago `back_urls`. Mercado Pago
// appends query parameters such as `status`, `payment_id`, and
// `preference_id` that we use to look up our matching internal transaction
// and report its current status to the user. We never trust this query —
// the authoritative status lives on the backend and is updated by the
// webhook handler.
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { billingPaymentsService } from '../../services/billing-payments.service.js';
import { useBillingPaymentsStore } from '../../stores/billing-payments.store.js';
import { useI18n } from '../../i18n/index.js';
import { AppAlert, AppBadge, AppButton, AppCard, AppLoader } from '../../components/ui/index.js';

const props = defineProps({
  outcome: {
    type: String,
    required: true,
    validator: (v) => ['success', 'failure', 'pending'].includes(v),
  },
});

const route = useRoute();
const router = useRouter();
const { t } = useI18n();
const store = useBillingPaymentsStore();
const isLoading = ref(false);
const payment = ref(null);
const lookupError = ref(null);

const paymentReference = computed(
  () => route.query.external_reference ?? route.query.preference_id ?? null,
);

onMounted(async () => {
  // Refresh recent payments so the user sees the up-to-date status, then
  // try to locate the specific transaction associated with the redirect.
  isLoading.value = true;
  try {
    await store.fetchPayments({ limit: 10 });
    const match = store.payments.find(
      (p) =>
        p.externalReference === route.query.external_reference ||
        p.providerPreferenceId === route.query.preference_id,
    );
    if (match) {
      const data = await billingPaymentsService.getPayment(match.id);
      payment.value = data?.payment ?? null;
    }
  } catch (err) {
    lookupError.value = err?.message ?? 'Unable to look up payment';
  } finally {
    isLoading.value = false;
  }
});

const outcomeVariant = computed(() => {
  if (props.outcome === 'success') return 'success';
  if (props.outcome === 'pending') return 'info';
  return 'danger';
});

const goToWallet = () => router.push({ name: 'billing.tokens' });
</script>

<template>
  <section class="payment-status">
    <AppCard padded>
      <template #title>{{ t(`billingPayments.status.${outcome}.title`) }}</template>
      <p>{{ t(`billingPayments.status.${outcome}.message`) }}</p>

      <AppLoader v-if="isLoading" />
      <AppAlert v-else-if="lookupError" variant="error">{{ lookupError }}</AppAlert>
      <div v-else-if="payment" class="payment-status__details">
        <p>
          <strong>{{ t('billingPayments.status.reference') }}:</strong>
          {{ payment.externalReference }}
        </p>
        <p>
          <strong>{{ t('billingPayments.status.statusLabel') }}:</strong>
          <AppBadge :variant="outcomeVariant">{{ payment.status }}</AppBadge>
        </p>
        <p v-if="payment.tokensToCredit">
          <strong>{{ t('billingPayments.status.tokens') }}:</strong>
          {{ payment.tokensToCredit }}
        </p>
      </div>
      <p v-else-if="paymentReference" class="payment-status__hint">
        {{ t('billingPayments.status.lookupHint', { ref: paymentReference }) }}
      </p>

      <div class="payment-status__actions">
        <AppButton @click="goToWallet">{{ t('billingPayments.status.backToWallet') }}</AppButton>
      </div>
    </AppCard>
  </section>
</template>

<style scoped>
.payment-status__details {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  margin-top: var(--space-2);
}

.payment-status__hint {
  color: var(--color-text-muted);
}

.payment-status__actions {
  margin-top: var(--space-3);
}
</style>
