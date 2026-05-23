<script setup>
// Tenant subscriptions view. Lists available plans, the current
// subscription state, invoice history, and exposes cancel/resume buttons.
// Creating a subscription redirects the user to Mercado Pago's preapproval
// authorisation URL — the backend mirrors the resulting state on the
// `preapproval` webhook so this page never assumes activation locally.
import { computed, onMounted } from 'vue';

import { useBillingPaymentsStore } from '../../stores/billing-payments.store.js';
import { useI18n } from '../../i18n/index.js';
import {
  AppAlert,
  AppBadge,
  AppButton,
  AppCard,
  AppLoader,
  AppTable,
} from '../../components/ui/index.js';

const store = useBillingPaymentsStore();
const { t } = useI18n();

onMounted(async () => {
  await Promise.all([store.fetchPlans(), store.fetchSubscriptions(), store.fetchInvoices()]);
});

const planColumns = computed(() => [
  { key: 'name', label: t('billingPayments.subscriptions.columns.plan') },
  { key: 'price', label: t('billingPayments.subscriptions.columns.price'), align: 'right' },
  { key: 'tokens', label: t('billingPayments.subscriptions.columns.tokens'), align: 'right' },
  { key: 'action', label: '', align: 'right' },
]);

const invoiceColumns = computed(() => [
  { key: 'createdAt', label: t('billingPayments.invoices.columns.date') },
  {
    key: 'amount',
    label: t('billingPayments.invoices.columns.amount'),
    align: 'right',
  },
  { key: 'status', label: t('billingPayments.invoices.columns.status') },
  { key: 'reference', label: t('billingPayments.invoices.columns.reference') },
]);

const formatCurrency = (minor, currency = 'USD') => {
  const major = (Number(minor) || 0) / 100;
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(major);
  } catch {
    return `${major.toFixed(2)} ${currency}`;
  }
};

const subscribe = async (plan) => {
  if (!window.confirm(t('billingPayments.subscriptions.confirm', { plan: plan.name }))) return;
  const result = await store.createSubscription(plan.id);
  if (result?.preapproval?.initPoint) {
    window.open(result.preapproval.initPoint, '_blank', 'noopener');
  }
};

const cancel = async (sub) => {
  if (!window.confirm(t('billingPayments.subscriptions.cancelConfirm'))) return;
  await store.cancelSubscription(sub.id);
};

const resume = async (sub) => {
  await store.resumeSubscription(sub.id);
};

const formatDate = (value) => (value ? new Date(value).toLocaleString() : '');

const statusVariant = (status) => {
  switch (status) {
    case 'authorized':
    case 'processed':
      return 'success';
    case 'pending':
    case 'scheduled':
    case 'recycling':
      return 'info';
    case 'paused':
      return 'warning';
    case 'rejected':
    case 'failed':
    case 'cancelled':
    case 'refunded':
      return 'danger';
    default:
      return 'neutral';
  }
};
</script>

<template>
  <section class="subscriptions">
    <header class="subscriptions__header">
      <div>
        <h2>{{ t('billingPayments.subscriptions.title') }}</h2>
        <p>{{ t('billingPayments.subscriptions.subtitle') }}</p>
      </div>
    </header>

    <AppAlert v-if="store.lastError" variant="error">{{ store.lastError }}</AppAlert>

    <AppCard padded>
      <template #title>{{ t('billingPayments.subscriptions.activeTitle') }}</template>
      <AppLoader v-if="store.isLoadingSubscriptions" />
      <div v-else-if="!store.activeSubscription" class="subscriptions__empty">
        {{ t('billingPayments.subscriptions.none') }}
      </div>
      <article v-else class="subscriptions__active">
        <p>
          <strong>{{ t('billingPayments.subscriptions.plan') }}:</strong>
          {{ store.activeSubscription.planNameSnapshot }}
        </p>
        <p>
          <strong>{{ t('billingPayments.subscriptions.status') }}:</strong>
          <AppBadge :variant="statusVariant(store.activeSubscription.status)">
            {{ store.activeSubscription.status }}
          </AppBadge>
        </p>
        <p>
          <strong>{{ t('billingPayments.subscriptions.price') }}:</strong>
          {{
            formatCurrency(
              store.activeSubscription.priceMinor,
              store.activeSubscription.currency,
            )
          }}
        </p>
        <p v-if="store.activeSubscription.nextChargeAt">
          <strong>{{ t('billingPayments.subscriptions.nextCharge') }}:</strong>
          {{ formatDate(store.activeSubscription.nextChargeAt) }}
        </p>
        <div class="subscriptions__actions">
          <AppButton
            v-if="store.activeSubscription.status === 'authorized'"
            variant="secondary"
            :loading="store.isMutatingSubscription"
            @click="cancel(store.activeSubscription)"
          >
            {{ t('billingPayments.subscriptions.cancel') }}
          </AppButton>
          <AppButton
            v-if="store.activeSubscription.status === 'paused'"
            :loading="store.isMutatingSubscription"
            @click="resume(store.activeSubscription)"
          >
            {{ t('billingPayments.subscriptions.resume') }}
          </AppButton>
          <a
            v-if="
              store.activeSubscription.status === 'pending' &&
              store.activeSubscription.initPoint
            "
            :href="store.activeSubscription.initPoint"
            target="_blank"
            rel="noopener"
            class="subscriptions__auth-link"
          >
            {{ t('billingPayments.subscriptions.authorize') }}
          </a>
        </div>
      </article>
    </AppCard>

    <AppCard padded>
      <template #title>{{ t('billingPayments.subscriptions.plansTitle') }}</template>
      <AppLoader v-if="store.isLoadingPlans" />
      <AppTable
        v-else
        :columns="planColumns"
        :rows="store.plans"
        row-key="id"
        :empty="t('billingPayments.subscriptions.plansEmpty')"
      >
        <template #cell:price="{ row }">
          {{ formatCurrency(row.priceMinor, row.currency) }} /
          {{ row.intervalCount }} {{ row.intervalUnit }}
        </template>
        <template #cell:tokens="{ row }">{{ row.includedTokens }}</template>
        <template #cell:action="{ row }">
          <AppButton
            size="sm"
            :disabled="Boolean(store.activeSubscription)"
            :loading="store.isCreatingSubscription"
            @click="subscribe(row)"
          >
            {{ t('billingPayments.subscriptions.subscribe') }}
          </AppButton>
        </template>
      </AppTable>
    </AppCard>

    <AppCard padded>
      <template #title>{{ t('billingPayments.invoices.title') }}</template>
      <AppLoader v-if="store.isLoadingInvoices" />
      <AppTable
        v-else
        :columns="invoiceColumns"
        :rows="store.invoices"
        row-key="id"
        :empty="t('billingPayments.invoices.empty')"
      >
        <template #cell:createdAt="{ row }">{{ formatDate(row.createdAt) }}</template>
        <template #cell:amount="{ row }">{{
          formatCurrency(row.amountMinor, row.currency)
        }}</template>
        <template #cell:status="{ row }">
          <AppBadge :variant="statusVariant(row.status)">{{ row.status }}</AppBadge>
        </template>
        <template #cell:reference="{ row }">{{
          row.mercadoPagoAuthorizedPaymentId
        }}</template>
      </AppTable>
    </AppCard>
  </section>
</template>

<style scoped>
.subscriptions {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.subscriptions__header h2 {
  margin: 0 0 var(--space-1) 0;
}

.subscriptions__header p {
  margin: 0;
  color: var(--color-text-muted);
}

.subscriptions__empty {
  color: var(--color-text-muted);
}

.subscriptions__active {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.subscriptions__actions {
  display: flex;
  gap: var(--space-2);
  margin-top: var(--space-2);
}

.subscriptions__auth-link {
  align-self: center;
  color: var(--color-primary);
  text-decoration: underline;
}
</style>
