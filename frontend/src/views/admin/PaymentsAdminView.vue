<script setup>
// Admin Mercado Pago inspector. Aggregates the payment ledger, webhook
// delivery log, and subscription roster on a single page so operators can:
//   - confirm a payment landed and tokens were credited,
//   - replay a webhook for reconciliation when a delivery was lost,
//   - sync a subscription's state from Mercado Pago when local mirrors drift,
//   - trigger the renewal and low-balance reminder jobs manually.
import { onMounted, ref } from 'vue';

import { adminPaymentsService } from '../../services/billing-payments.service.js';
import { apiClient } from '../../services/apiClient.js';
import { useI18n } from '../../i18n/index.js';
import {
  AppAlert,
  AppBadge,
  AppButton,
  AppCard,
  AppInput,
  AppLoader,
  AppTable,
} from '../../components/ui/index.js';

const { t } = useI18n();

const isLoading = ref(false);
const lastError = ref(null);
const payments = ref([]);
const webhookEvents = ref([]);
const subscriptions = ref([]);
const reconcilePaymentId = ref('');
const lastReconcileResult = ref(null);

const refresh = async () => {
  isLoading.value = true;
  lastError.value = null;
  try {
    const [paymentsRes, eventsRes, subsRes] = await Promise.all([
      adminPaymentsService.listPayments({ limit: 50 }),
      adminPaymentsService.listWebhookEvents({ limit: 50 }),
      adminPaymentsService.listSubscriptions({ limit: 50 }),
    ]);
    payments.value = paymentsRes?.items ?? [];
    webhookEvents.value = eventsRes?.items ?? [];
    subscriptions.value = subsRes?.items ?? [];
  } catch (err) {
    lastError.value = err?.message ?? 'Unable to load payments admin data';
  } finally {
    isLoading.value = false;
  }
};

onMounted(refresh);

const formatDate = (value) => (value ? new Date(value).toLocaleString() : '');

const formatCurrency = (minor, currency = 'USD') => {
  const major = (Number(minor) || 0) / 100;
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(major);
  } catch {
    return `${major.toFixed(2)} ${currency}`;
  }
};

const statusVariant = (status) => {
  if (['approved', 'processed', 'authorized'].includes(status)) return 'success';
  if (['pending', 'in_process', 'scheduled', 'recycling'].includes(status)) return 'info';
  if (['failed', 'rejected', 'refunded', 'charged_back', 'cancelled'].includes(status)) {
    return 'danger';
  }
  return 'neutral';
};

const paymentColumns = [
  { key: 'createdAt', label: 'Created' },
  { key: 'tenant', label: 'Tenant' },
  { key: 'purpose', label: 'Purpose' },
  { key: 'amount', label: 'Amount', align: 'right' },
  { key: 'status', label: 'Status' },
  { key: 'externalReference', label: 'External ref' },
  { key: 'providerPaymentId', label: 'MP payment id' },
];

const webhookColumns = [
  { key: 'createdAt', label: 'Created' },
  { key: 'provider', label: 'Provider' },
  { key: 'eventType', label: 'Event' },
  { key: 'resourceId', label: 'Resource id' },
  { key: 'status', label: 'Status' },
  { key: 'processedAt', label: 'Processed' },
  { key: 'processingError', label: 'Error' },
];

const subscriptionColumns = [
  { key: 'createdAt', label: 'Created' },
  { key: 'tenant', label: 'Tenant' },
  { key: 'planCode', label: 'Plan' },
  { key: 'status', label: 'Status' },
  { key: 'preapproval', label: 'Preapproval' },
  { key: 'actions', label: '', align: 'right' },
];

const syncSubscription = async (sub) => {
  try {
    await adminPaymentsService.syncSubscription(sub.id);
    await refresh();
  } catch (err) {
    lastError.value = err?.message ?? 'Sync failed';
  }
};

const cancelSubscription = async (sub) => {
  if (!window.confirm('Cancel this subscription in Mercado Pago?')) return;
  try {
    await adminPaymentsService.cancelSubscription(sub.id);
    await refresh();
  } catch (err) {
    lastError.value = err?.message ?? 'Cancel failed';
  }
};

const pauseSubscription = async (sub) => {
  if (!window.confirm('Pause this subscription in Mercado Pago?')) return;
  try {
    await adminPaymentsService.pauseSubscription(sub.id);
    await refresh();
  } catch (err) {
    lastError.value = err?.message ?? 'Pause failed';
  }
};

const reconcile = async () => {
  if (!reconcilePaymentId.value.trim()) return;
  try {
    lastReconcileResult.value = await adminPaymentsService.reconcile(
      reconcilePaymentId.value.trim(),
    );
    await refresh();
  } catch (err) {
    lastError.value = err?.message ?? 'Reconciliation failed';
  }
};

const triggerReminders = async (kind) => {
  try {
    const url =
      kind === 'low-balance'
        ? '/admin/payments/reminders/low-balance'
        : '/admin/payments/reminders/renewals';
    await apiClient.post(url, {});
    await refresh();
  } catch (err) {
    lastError.value = err?.message ?? 'Reminder trigger failed';
  }
};
</script>

<template>
  <section class="admin-payments">
    <header class="admin-payments__header">
      <div>
        <h2>{{ t('adminPayments.title') }}</h2>
        <p>{{ t('adminPayments.subtitle') }}</p>
      </div>
      <AppButton variant="secondary" @click="refresh">{{ t('common.refresh') }}</AppButton>
    </header>

    <AppAlert v-if="lastError" variant="error">{{ lastError }}</AppAlert>

    <AppCard padded>
      <template #title>{{ t('adminPayments.payments') }}</template>
      <AppLoader v-if="isLoading" />
      <AppTable
        v-else
        :columns="paymentColumns"
        :rows="payments"
        row-key="id"
        :empty="t('adminPayments.empty')"
      >
        <template #cell:createdAt="{ row }">{{ formatDate(row.createdAt) }}</template>
        <template #cell:tenant="{ row }">{{ row.tenantId }}</template>
        <template #cell:amount="{ row }">{{
          formatCurrency(row.amountMinor, row.currency)
        }}</template>
        <template #cell:status="{ row }">
          <AppBadge :variant="statusVariant(row.status)">{{ row.status }}</AppBadge>
        </template>
      </AppTable>
    </AppCard>

    <AppCard padded>
      <template #title>{{ t('adminPayments.webhooks') }}</template>
      <AppLoader v-if="isLoading" />
      <AppTable
        v-else
        :columns="webhookColumns"
        :rows="webhookEvents"
        row-key="id"
        :empty="t('adminPayments.webhooksEmpty')"
      >
        <template #cell:createdAt="{ row }">{{ formatDate(row.createdAt) }}</template>
        <template #cell:processedAt="{ row }">{{ formatDate(row.processedAt) }}</template>
        <template #cell:status="{ row }">
          <AppBadge :variant="statusVariant(row.status)">{{ row.status }}</AppBadge>
        </template>
      </AppTable>
    </AppCard>

    <AppCard padded>
      <template #title>{{ t('adminPayments.subscriptions') }}</template>
      <AppLoader v-if="isLoading" />
      <AppTable
        v-else
        :columns="subscriptionColumns"
        :rows="subscriptions"
        row-key="id"
        :empty="t('adminPayments.subscriptionsEmpty')"
      >
        <template #cell:createdAt="{ row }">{{ formatDate(row.createdAt) }}</template>
        <template #cell:tenant="{ row }">{{ row.tenantId }}</template>
        <template #cell:status="{ row }">
          <AppBadge :variant="statusVariant(row.status)">{{ row.status }}</AppBadge>
        </template>
        <template #cell:preapproval="{ row }">{{ row.mercadoPagoPreapprovalId ?? '—' }}</template>
        <template #cell:actions="{ row }">
          <AppButton size="sm" variant="secondary" @click="syncSubscription(row)">
            {{ t('adminPayments.sync') }}
          </AppButton>
          <AppButton
            size="sm"
            variant="secondary"
            :disabled="row.status !== 'authorized'"
            @click="pauseSubscription(row)"
          >
            {{ t('adminPayments.pause') }}
          </AppButton>
          <AppButton
            size="sm"
            variant="secondary"
            :disabled="row.status === 'cancelled'"
            @click="cancelSubscription(row)"
          >
            {{ t('adminPayments.cancel') }}
          </AppButton>
        </template>
      </AppTable>
    </AppCard>

    <AppCard padded>
      <template #title>{{ t('adminPayments.reconcile') }}</template>
      <p>{{ t('adminPayments.reconcileHint') }}</p>
      <div class="admin-payments__reconcile">
        <AppInput
          v-model="reconcilePaymentId"
          :label="t('adminPayments.paymentIdLabel')"
          placeholder="123456789"
        />
        <AppButton @click="reconcile">{{ t('adminPayments.run') }}</AppButton>
      </div>
      <pre v-if="lastReconcileResult" class="admin-payments__pre">{{
        JSON.stringify(lastReconcileResult, null, 2)
      }}</pre>
    </AppCard>

    <AppCard padded>
      <template #title>{{ t('adminPayments.reminders') }}</template>
      <p>{{ t('adminPayments.remindersHint') }}</p>
      <div class="admin-payments__reminders">
        <AppButton @click="triggerReminders('low-balance')">
          {{ t('adminPayments.runLowBalance') }}
        </AppButton>
        <AppButton @click="triggerReminders('renewals')">
          {{ t('adminPayments.runRenewals') }}
        </AppButton>
      </div>
    </AppCard>
  </section>
</template>

<style scoped>
.admin-payments {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.admin-payments__header {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: var(--space-3);
}

.admin-payments__header h2 {
  margin: 0 0 var(--space-1) 0;
}

.admin-payments__header p {
  margin: 0;
  color: var(--color-text-muted);
}

.admin-payments__reconcile,
.admin-payments__reminders {
  display: flex;
  gap: var(--space-2);
  align-items: flex-end;
  flex-wrap: wrap;
}

.admin-payments__pre {
  background: var(--color-bg-muted);
  padding: var(--space-2);
  border-radius: var(--radius-md);
  overflow: auto;
  max-height: 16rem;
}
</style>
