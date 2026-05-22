<script setup>
// Billing transaction history view. Lists the calling tenant's transactions
// — or, for super admins with an impersonated tenant header, the targeted
// tenant's history. The view never advertises a real payment provider since
// no provider is wired up yet; records are surfaced as plain history.
import { computed, onMounted } from 'vue';

import { useTransactionsStore } from '../../stores/transactions.store.js';
import { useAuthStore } from '../../stores/auth.store.js';
import { useI18n } from '../../i18n/index.js';
import {
  AppAlert,
  AppBadge,
  AppCard,
  AppLoader,
  AppSelect,
  AppTable,
} from '../../components/ui/index.js';

const store = useTransactionsStore();
const auth = useAuthStore();
const { t } = useI18n();

const STATUS_OPTIONS = ['', 'pending', 'paid', 'failed', 'refunded', 'cancelled'];
const TYPE_OPTIONS = ['', 'payment', 'refund', 'credit', 'adjustment'];

const columns = computed(() => [
  { key: 'createdAt', label: t('billing.transactions.columns.date') },
  { key: 'description', label: t('billing.transactions.columns.description') },
  { key: 'type', label: t('billing.transactions.columns.type') },
  { key: 'amount', label: t('billing.transactions.columns.amount'), align: 'right' },
  { key: 'status', label: t('billing.transactions.columns.status') },
  { key: 'provider', label: t('billing.transactions.columns.provider') },
]);

const statusOptions = computed(() =>
  STATUS_OPTIONS.map((value) => ({
    value,
    label: value
      ? t(`billing.transactions.statuses.${value}`)
      : t('billing.transactions.filters.allStatuses'),
  })),
);

const typeOptions = computed(() =>
  TYPE_OPTIONS.map((value) => ({
    value,
    label: value
      ? t(`billing.transactions.types.${value}`)
      : t('billing.transactions.filters.allTypes'),
  })),
);

const refresh = () => {
  store.fetchTransactions().catch(() => {
    // store.lastError is surfaced via the alert
  });
};

onMounted(refresh);

const onStatusChange = (value) => {
  store.setFilter('status', value);
  refresh();
};

const onTypeChange = (value) => {
  store.setFilter('type', value);
  refresh();
};

const statusVariant = (status) => {
  switch (status) {
    case 'paid':
      return 'success';
    case 'pending':
      return 'info';
    case 'refunded':
      return 'warning';
    case 'failed':
    case 'cancelled':
      return 'danger';
    default:
      return 'neutral';
  }
};

const typeVariant = (type) => {
  switch (type) {
    case 'payment':
      return 'info';
    case 'refund':
      return 'warning';
    case 'credit':
      return 'success';
    case 'adjustment':
      return 'neutral';
    default:
      return 'neutral';
  }
};

// Backend stores amount as integer minor units (cents). Convert to the
// major unit with Intl.NumberFormat so currency symbols/decimal separators
// follow the user's locale.
const formatAmount = (row) => {
  const minor = Number(row?.amount ?? 0);
  const currency = (row?.currency || 'USD').toUpperCase();
  const major = minor / 100;
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
    }).format(major);
  } catch {
    // Fallback for unsupported currency codes
    return `${major.toFixed(2)} ${currency}`;
  }
};

const formatDate = (value) => {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
};

const providerLabel = (row) =>
  row?.provider?.trim() || t('billing.transactions.providers.internal');

const isSuperAdmin = computed(() => Boolean(auth.isSuperAdmin));
</script>

<template>
  <section class="transactions">
    <header class="transactions__header">
      <div>
        <h2>{{ t('billing.transactions.title') }}</h2>
        <p>{{ t('billing.transactions.subtitle') }}</p>
      </div>
      <div v-if="isSuperAdmin" class="transactions__scope">
        <AppBadge variant="info">{{ t('billing.transactions.adminScope') }}</AppBadge>
      </div>
    </header>

    <AppAlert v-if="store.lastError" variant="error">{{ store.lastError }}</AppAlert>

    <AppCard padded>
      <template #title>{{ t('billing.transactions.history') }}</template>

      <div class="transactions__filters">
        <div class="transactions__filter">
          <AppSelect
            :model-value="store.filters.status"
            :options="statusOptions"
            :label="t('billing.transactions.filters.status')"
            @update:model-value="onStatusChange"
          />
        </div>
        <div class="transactions__filter">
          <AppSelect
            :model-value="store.filters.type"
            :options="typeOptions"
            :label="t('billing.transactions.filters.type')"
            @update:model-value="onTypeChange"
          />
        </div>
        <div class="transactions__count">
          {{ t('billing.transactions.total', { count: store.totalCount }) }}
        </div>
      </div>

      <AppLoader v-if="store.isLoading && store.items.length === 0" />
      <AppTable
        v-else
        :columns="columns"
        :rows="store.items"
        row-key="id"
        :empty="t('billing.transactions.empty')"
        max-height="65vh"
      >
        <template #cell:createdAt="{ row }">
          <div>{{ formatDate(row.paidAt ?? row.createdAt) }}</div>
          <div v-if="row.paidAt && row.paidAt !== row.createdAt" class="transactions__meta">
            {{ t('billing.transactions.created', { date: formatDate(row.createdAt) }) }}
          </div>
        </template>
        <template #cell:description="{ row }">
          <strong>{{ row.description || t('billing.transactions.noDescription') }}</strong>
          <div v-if="row.planCode" class="transactions__meta">
            {{ t('billing.transactions.plan', { plan: row.planCode }) }}
          </div>
          <div v-if="row.providerReference" class="transactions__meta">
            {{ t('billing.transactions.reference', { reference: row.providerReference }) }}
          </div>
        </template>
        <template #cell:type="{ row }">
          <AppBadge :variant="typeVariant(row.type)">
            {{ t(`billing.transactions.types.${row.type}`, { defaultValue: row.type }) }}
          </AppBadge>
        </template>
        <template #cell:amount="{ row }">{{ formatAmount(row) }}</template>
        <template #cell:status="{ row }">
          <AppBadge :variant="statusVariant(row.status)">
            {{ t(`billing.transactions.statuses.${row.status}`, { defaultValue: row.status }) }}
          </AppBadge>
        </template>
        <template #cell:provider="{ row }">
          <span class="transactions__provider">{{ providerLabel(row) }}</span>
        </template>
      </AppTable>
    </AppCard>
  </section>
</template>

<style scoped>
.transactions {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  max-width: var(--layout-content-max-width);
}

.transactions__header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--space-4);
}

.transactions__header h2 {
  margin: 0;
}

.transactions__header p {
  margin: 0;
  color: var(--color-text-muted);
}

.transactions__scope {
  align-self: flex-start;
}

.transactions__filters {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: var(--space-3);
  margin-bottom: var(--space-3);
}

.transactions__filter {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  min-width: 12rem;
}

.transactions__count {
  margin-left: auto;
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
}

.transactions__meta {
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
}

.transactions__provider {
  text-transform: capitalize;
}
</style>
