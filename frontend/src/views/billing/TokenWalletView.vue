<script setup>
// Client-facing token wallet view. Surfaces the current balance, monthly
// usage, send limits, available packages, ledger history, and outstanding
// purchase requests. The page deliberately uses a single store so the
// balance card and the ledger stay in sync without manual coordination.
import { computed, onMounted } from 'vue';

import { useBillingTokensStore } from '../../stores/billing-tokens.store.js';
import { useI18n } from '../../i18n/index.js';
import {
  AppAlert,
  AppBadge,
  AppButton,
  AppCard,
  AppLoader,
  AppSelect,
  AppTable,
} from '../../components/ui/index.js';

const store = useBillingTokensStore();
const { t } = useI18n();

const channels = ['email', 'sms', 'whatsapp'];

const refresh = async () => {
  await Promise.all([
    store.fetchBalance(),
    store.fetchPackages(),
    store.fetchLedger(),
    store.fetchPurchases({ limit: 25 }),
  ]);
};

onMounted(refresh);

const ledgerColumns = computed(() => [
  { key: 'createdAt', label: t('billingTokens.ledger.columns.date') },
  { key: 'type', label: t('billingTokens.ledger.columns.type') },
  { key: 'channel', label: t('billingTokens.ledger.columns.channel') },
  { key: 'amount', label: t('billingTokens.ledger.columns.amount'), align: 'right' },
  { key: 'balanceAfter', label: t('billingTokens.ledger.columns.balance'), align: 'right' },
  { key: 'description', label: t('billingTokens.ledger.columns.description') },
]);

const purchaseColumns = computed(() => [
  { key: 'createdAt', label: t('billingTokens.purchases.columns.date') },
  { key: 'packageName', label: t('billingTokens.purchases.columns.package') },
  { key: 'tokens', label: t('billingTokens.purchases.columns.tokens'), align: 'right' },
  { key: 'price', label: t('billingTokens.purchases.columns.price'), align: 'right' },
  { key: 'status', label: t('billingTokens.purchases.columns.status') },
]);

const ledgerTypeOptions = computed(() => [
  { value: '', label: t('billingTokens.ledger.filters.allTypes') },
  { value: 'debit', label: t('billingTokens.ledger.types.debit') },
  { value: 'credit', label: t('billingTokens.ledger.types.credit') },
  { value: 'refund', label: t('billingTokens.ledger.types.refund') },
  { value: 'adjustment_credit', label: t('billingTokens.ledger.types.adjustment_credit') },
  { value: 'adjustment_debit', label: t('billingTokens.ledger.types.adjustment_debit') },
  { value: 'purchase', label: t('billingTokens.ledger.types.purchase') },
]);

const channelOptions = computed(() => [
  { value: '', label: t('billingTokens.ledger.filters.allChannels') },
  ...channels.map((c) => ({ value: c, label: t(`campaigns.channels.${c}`) })),
]);

const formatDate = (value) => {
  if (!value) return '';
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
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

const ledgerVariant = (type) => {
  switch (type) {
    case 'credit':
    case 'adjustment_credit':
    case 'purchase':
      return 'success';
    case 'refund':
      return 'info';
    case 'debit':
      return 'neutral';
    case 'adjustment_debit':
      return 'warning';
    default:
      return 'neutral';
  }
};

const purchaseVariant = (status) => {
  switch (status) {
    case 'pending':
      return 'info';
    case 'approved':
    case 'completed':
      return 'success';
    case 'rejected':
    case 'cancelled':
      return 'danger';
    default:
      return 'neutral';
  }
};

const requestPackage = async (pkg) => {
  if (!window.confirm(t('billingTokens.packages.confirm', { name: pkg.name }))) return;
  await store.requestPurchase(pkg.id, null);
  await Promise.all([store.fetchBalance(), store.fetchPurchases({ limit: 25 })]);
};

const onLedgerTypeChange = (value) => {
  store.setLedgerFilter('type', value);
  store.fetchLedger();
};

const onLedgerChannelChange = (value) => {
  store.setLedgerFilter('channel', value);
  store.fetchLedger();
};
</script>

<template>
  <section class="token-wallet">
    <header class="token-wallet__header">
      <div>
        <h2>{{ t('billingTokens.title') }}</h2>
        <p>{{ t('billingTokens.subtitle') }}</p>
      </div>
      <AppButton variant="secondary" @click="refresh">{{ t('common.search') }}</AppButton>
    </header>

    <AppAlert v-if="store.lastError" variant="error">{{ store.lastError }}</AppAlert>

    <!-- Balance + pricing summary --------------------------------------- -->
    <AppCard padded>
      <template #title>{{ t('billingTokens.balance.title') }}</template>
      <AppLoader v-if="store.isLoadingBalance && !store.wallet" />
      <div v-else class="token-wallet__balance-grid">
        <div class="token-wallet__kpi">
          <span>{{ t('billingTokens.balance.current') }}</span>
          <strong>{{ store.wallet?.balance ?? 0 }}</strong>
        </div>
        <div class="token-wallet__kpi">
          <span>{{ t('billingTokens.balance.lifetimeCredited') }}</span>
          <strong>{{ store.wallet?.lifetimeCredited ?? 0 }}</strong>
        </div>
        <div class="token-wallet__kpi">
          <span>{{ t('billingTokens.balance.lifetimeDebited') }}</span>
          <strong>{{ store.wallet?.lifetimeDebited ?? 0 }}</strong>
        </div>
        <div class="token-wallet__kpi">
          <span>{{ t('billingTokens.balance.lifetimeRefunded') }}</span>
          <strong>{{ store.wallet?.lifetimeRefunded ?? 0 }}</strong>
        </div>
      </div>
      <div class="token-wallet__pricing">
        <h4>{{ t('billingTokens.balance.channelCost') }}</h4>
        <ul>
          <li v-for="channel in channels" :key="channel">
            <strong>{{ t(`campaigns.channels.${channel}`) }}:</strong>
            {{ t('billingTokens.balance.tokensPerRecipient', { value: store.pricing?.[channel] ?? '—' }) }}
          </li>
        </ul>
      </div>
      <div v-if="store.usage" class="token-wallet__usage">
        <h4>{{ t('billingTokens.usage.title') }}</h4>
        <p>
          {{ t('billingTokens.usage.summary', {
            month: store.usage.yearMonth,
            total: store.usage.total,
          }) }}
        </p>
        <ul>
          <li v-for="channel in channels" :key="channel">
            <strong>{{ t(`campaigns.channels.${channel}`) }}:</strong>
            {{ store.usage.perChannel?.[channel] ?? 0 }}
            <template v-if="store.limits?.monthlyPerChannel?.[channel] !== null">
              / {{ store.limits.monthlyPerChannel[channel] }}
            </template>
          </li>
        </ul>
      </div>
    </AppCard>

    <!-- Packages -------------------------------------------------------- -->
    <AppCard padded>
      <template #title>{{ t('billingTokens.packages.title') }}</template>
      <p>{{ t('billingTokens.packages.subtitle') }}</p>
      <AppLoader v-if="store.isLoadingPackages" />
      <div v-else class="token-wallet__packages">
        <div v-for="pkg in store.packages" :key="pkg.id" class="token-wallet__package">
          <div class="token-wallet__package-name">{{ pkg.name }}</div>
          <div class="token-wallet__package-tokens">
            {{ t('billingTokens.packages.tokens', { tokens: pkg.tokens }) }}
          </div>
          <div class="token-wallet__package-price">
            {{ formatCurrency(pkg.priceMinor, pkg.currency) }}
          </div>
          <p v-if="pkg.description" class="token-wallet__package-desc">{{ pkg.description }}</p>
          <AppButton size="sm" :loading="store.isRequesting" @click="requestPackage(pkg)">
            {{ t('billingTokens.packages.request') }}
          </AppButton>
        </div>
        <p v-if="!store.packages.length" class="token-wallet__empty">
          {{ t('billingTokens.packages.empty') }}
        </p>
      </div>
    </AppCard>

    <!-- Purchase requests ----------------------------------------------- -->
    <AppCard padded>
      <template #title>{{ t('billingTokens.purchases.title') }}</template>
      <AppLoader v-if="store.isLoadingPurchases" />
      <AppTable
        v-else
        :columns="purchaseColumns"
        :rows="store.purchases"
        row-key="id"
        :empty="t('billingTokens.purchases.empty')"
      >
        <template #cell:createdAt="{ row }">{{ formatDate(row.createdAt) }}</template>
        <template #cell:price="{ row }">{{ formatCurrency(row.priceMinor, row.currency) }}</template>
        <template #cell:status="{ row }">
          <AppBadge :variant="purchaseVariant(row.status)">
            {{ t(`billingTokens.purchases.statuses.${row.status}`, { defaultValue: row.status }) }}
          </AppBadge>
        </template>
      </AppTable>
    </AppCard>

    <!-- Ledger ---------------------------------------------------------- -->
    <AppCard padded>
      <template #title>{{ t('billingTokens.ledger.title') }}</template>
      <div class="token-wallet__filters">
        <AppSelect
          :model-value="store.ledgerFilters.type"
          :options="ledgerTypeOptions"
          :label="t('billingTokens.ledger.filters.type')"
          @update:model-value="onLedgerTypeChange"
        />
        <AppSelect
          :model-value="store.ledgerFilters.channel"
          :options="channelOptions"
          :label="t('billingTokens.ledger.filters.channel')"
          @update:model-value="onLedgerChannelChange"
        />
      </div>
      <AppLoader v-if="store.isLoadingLedger" />
      <AppTable
        v-else
        :columns="ledgerColumns"
        :rows="store.ledger"
        row-key="id"
        :empty="t('billingTokens.ledger.empty')"
        max-height="60vh"
      >
        <template #cell:createdAt="{ row }">{{ formatDate(row.createdAt) }}</template>
        <template #cell:type="{ row }">
          <AppBadge :variant="ledgerVariant(row.type)">
            {{ t(`billingTokens.ledger.types.${row.type}`, { defaultValue: row.type }) }}
          </AppBadge>
        </template>
        <template #cell:channel="{ row }">
          <span v-if="row.channel">{{ t(`campaigns.channels.${row.channel}`) }}</span>
          <span v-else>—</span>
        </template>
      </AppTable>
    </AppCard>
  </section>
</template>

<style scoped>
.token-wallet {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.token-wallet__header {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: var(--space-4);
}

.token-wallet__header h2 {
  margin: 0 0 var(--space-1) 0;
}

.token-wallet__header p {
  margin: 0;
  color: var(--color-text-muted);
}

.token-wallet__balance-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr));
  gap: var(--space-3);
  margin-bottom: var(--space-3);
}

.token-wallet__kpi {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  padding: var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
}

.token-wallet__kpi span {
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
}

.token-wallet__kpi strong {
  font-size: var(--font-size-xl);
}

.token-wallet__pricing ul,
.token-wallet__usage ul {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
}

.token-wallet__pricing h4,
.token-wallet__usage h4 {
  margin: var(--space-2) 0 var(--space-1);
}

.token-wallet__packages {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
  gap: var(--space-3);
  margin-top: var(--space-2);
}

.token-wallet__package {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--space-3);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.token-wallet__package-name {
  font-weight: 600;
  font-size: var(--font-size-lg);
}

.token-wallet__package-tokens {
  color: var(--color-text-muted);
}

.token-wallet__package-price {
  font-size: var(--font-size-xl);
  font-weight: 600;
}

.token-wallet__package-desc {
  color: var(--color-text-muted);
  margin: 0;
}

.token-wallet__filters {
  display: flex;
  gap: var(--space-3);
  margin-bottom: var(--space-3);
  flex-wrap: wrap;
}

.token-wallet__empty {
  color: var(--color-text-muted);
}
</style>
