<script setup>
// Mercado Pago token-package purchase view. Lists available packages,
// generates a Checkout Pro preference on click, and either:
//   - mounts the MercadoPago.js Wallet brick when VITE_MERCADOPAGO_PUBLIC_KEY
//     is configured, or
//   - falls back to opening the `init_point` URL in a new tab.
//
// The backend is the single source of truth — this view never writes the
// wallet balance or marks a payment approved. The webhook handler credits
// tokens after Mercado Pago confirms the payment.
import { computed, onMounted, ref, watch } from 'vue';

import { useBillingTokensStore } from '../../stores/billing-tokens.store.js';
import { useBillingPaymentsStore } from '../../stores/billing-payments.store.js';
import { useI18n } from '../../i18n/index.js';
import { loadMercadoPagoSdk } from '../../services/mercadopago-loader.js';
import { MERCADOPAGO_PUBLIC_KEY } from '../../config/env.js';
import { AppAlert, AppButton, AppCard, AppLoader } from '../../components/ui/index.js';

const tokensStore = useBillingTokensStore();
const paymentsStore = useBillingPaymentsStore();
const { t } = useI18n();

const brickContainer = ref(null);
const brickError = ref(null);

onMounted(async () => {
  await tokensStore.fetchPackages();
});

const hasSdk = computed(() => Boolean(MERCADOPAGO_PUBLIC_KEY));

const startCheckout = async (pkg) => {
  brickError.value = null;
  await paymentsStore.createPreference(pkg.id);
  const preference = paymentsStore.latestPreference;
  if (!preference) return;

  if (!hasSdk.value) {
    window.open(preference.initPoint, '_blank', 'noopener');
    return;
  }
  try {
    const mp = await loadMercadoPagoSdk();
    if (!mp || !brickContainer.value) {
      window.open(preference.initPoint, '_blank', 'noopener');
      return;
    }
    brickContainer.value.innerHTML = '';
    const bricks = mp.bricks();
    await bricks.create('wallet', brickContainer.value.id, {
      initialization: { preferenceId: preference.id },
      callbacks: {
        onError: (err) => {
          brickError.value = err?.message ?? String(err);
        },
      },
    });
  } catch (err) {
    brickError.value = err?.message ?? String(err);
    window.open(preference.initPoint, '_blank', 'noopener');
  }
};

const formatCurrency = (minor, currency = 'USD') => {
  const major = (Number(minor) || 0) / 100;
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(major);
  } catch {
    return `${major.toFixed(2)} ${currency}`;
  }
};

// Reset the brick whenever a new preference is generated.
watch(
  () => paymentsStore.latestPreference?.id,
  () => {
    if (brickContainer.value) brickContainer.value.innerHTML = '';
  },
);
</script>

<template>
  <section class="buy-tokens">
    <header class="buy-tokens__header">
      <div>
        <h2>{{ t('billingPayments.buy.title') }}</h2>
        <p>{{ t('billingPayments.buy.subtitle') }}</p>
      </div>
    </header>

    <AppAlert v-if="tokensStore.lastError" variant="error">{{ tokensStore.lastError }}</AppAlert>
    <AppAlert v-if="paymentsStore.lastError" variant="error">{{
      paymentsStore.lastError
    }}</AppAlert>

    <AppCard padded>
      <template #title>{{ t('billingPayments.buy.packages') }}</template>
      <AppLoader v-if="tokensStore.isLoadingPackages" />
      <div v-else class="buy-tokens__packages">
        <article v-for="pkg in tokensStore.packages" :key="pkg.id" class="buy-tokens__package">
          <header>
            <h3>{{ pkg.name }}</h3>
            <p>{{ t('billingPayments.buy.tokensLine', { tokens: pkg.tokens }) }}</p>
          </header>
          <p class="buy-tokens__price">{{ formatCurrency(pkg.priceMinor, pkg.currency) }}</p>
          <p v-if="pkg.description" class="buy-tokens__desc">{{ pkg.description }}</p>
          <AppButton :loading="paymentsStore.isCreatingPreference" @click="startCheckout(pkg)">
            {{ t('billingPayments.buy.checkout') }}
          </AppButton>
        </article>
        <p v-if="!tokensStore.packages.length" class="buy-tokens__empty">
          {{ t('billingPayments.buy.empty') }}
        </p>
      </div>
    </AppCard>

    <AppCard v-if="paymentsStore.latestPreference" padded>
      <template #title>{{ t('billingPayments.buy.checkoutTitle') }}</template>
      <p>
        {{ t('billingPayments.buy.checkoutHint') }}
      </p>
      <p v-if="!hasSdk" class="buy-tokens__fallback">
        <a :href="paymentsStore.latestPreference.initPoint" target="_blank" rel="noopener">
          {{ t('billingPayments.buy.openMercadoPago') }}
        </a>
      </p>
      <div v-else>
        <div id="mp-wallet-brick" ref="brickContainer"></div>
        <p v-if="brickError" class="buy-tokens__error">{{ brickError }}</p>
      </div>
    </AppCard>
  </section>
</template>

<style scoped>
.buy-tokens {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.buy-tokens__header h2 {
  margin: 0 0 var(--space-1) 0;
}

.buy-tokens__header p {
  margin: 0;
  color: var(--color-text-muted);
}

.buy-tokens__packages {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
  gap: var(--space-3);
}

.buy-tokens__package {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--space-3);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.buy-tokens__price {
  font-size: var(--font-size-xl);
  font-weight: 600;
}

.buy-tokens__desc,
.buy-tokens__empty {
  color: var(--color-text-muted);
  margin: 0;
}

.buy-tokens__fallback a {
  color: var(--color-primary);
  text-decoration: underline;
}

.buy-tokens__error {
  color: var(--color-danger);
}
</style>
