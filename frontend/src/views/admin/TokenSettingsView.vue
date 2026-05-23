<script setup>
// Super-admin token configuration screen. The view is split into four cards
// so the operator can scan everything on one page: packages, channel
// pricing, pending purchases, and a per-tenant inspection panel for
// limits + manual adjustments.
import { computed, onMounted, reactive, ref } from 'vue';

import { useAdminTokensStore } from '../../stores/admin-tokens.store.js';
import { useI18n } from '../../i18n/index.js';
import {
  AppAlert,
  AppBadge,
  AppButton,
  AppCard,
  AppInput,
  AppLoader,
  AppSelect,
  AppTable,
  AppTextarea,
} from '../../components/ui/index.js';

const store = useAdminTokensStore();
const { t } = useI18n();

const channels = ['email', 'sms', 'whatsapp'];

const newPackage = reactive({
  name: '',
  tokens: 500,
  priceMinor: 4900,
  currency: 'USD',
  description: '',
});

const pricingDraft = reactive({ email: null, sms: null, whatsapp: null });
const tenantIdInput = ref('');
const limitsDraft = reactive({
  monthlyTotal: null,
  monthlyPerChannel: { email: null, sms: null, whatsapp: null },
  enforcement: 'hard',
  notes: '',
});
const adjustmentDraft = reactive({ direction: 'credit', amount: 100, reason: '' });
const localError = ref('');

const packageColumns = computed(() => [
  { key: 'name', label: t('adminTokens.packages.columns.name') },
  { key: 'tokens', label: t('adminTokens.packages.columns.tokens'), align: 'right' },
  { key: 'price', label: t('adminTokens.packages.columns.price'), align: 'right' },
  { key: 'status', label: t('adminTokens.packages.columns.status') },
  { key: 'actions', label: t('common.actions'), align: 'right' },
]);

const pendingColumns = computed(() => [
  { key: 'createdAt', label: t('adminTokens.purchases.columns.requestedAt') },
  { key: 'packageName', label: t('adminTokens.purchases.columns.package') },
  { key: 'tokens', label: t('adminTokens.purchases.columns.tokens'), align: 'right' },
  { key: 'price', label: t('adminTokens.purchases.columns.price'), align: 'right' },
  { key: 'tenantId', label: t('adminTokens.purchases.columns.tenant') },
  { key: 'actions', label: t('common.actions'), align: 'right' },
]);

const formatCurrency = (minor, currency = 'USD') => {
  const major = (Number(minor) || 0) / 100;
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(major);
  } catch {
    return `${major.toFixed(2)} ${currency}`;
  }
};

const formatDate = (value) => {
  if (!value) return '';
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
};

const enforcementOptions = computed(() => [
  { value: 'hard', label: t('adminTokens.limits.enforcement.hard') },
  { value: 'soft', label: t('adminTokens.limits.enforcement.soft') },
]);

const directionOptions = computed(() => [
  { value: 'credit', label: t('adminTokens.adjustments.directions.credit') },
  { value: 'debit', label: t('adminTokens.adjustments.directions.debit') },
]);

const refresh = async () => {
  await Promise.all([
    store.fetchPackages(),
    store.fetchChannelPricing(),
    store.fetchPendingPurchases(),
  ]);
  for (const row of store.channelPricing) {
    pricingDraft[row.channel] = row.tokensPerRecipient;
  }
};

onMounted(refresh);

const createPackage = async () => {
  localError.value = '';
  if (!newPackage.name.trim() || newPackage.tokens < 1) {
    localError.value = t('adminTokens.packages.errors.invalid');
    return;
  }
  try {
    await store.createPackage({
      name: newPackage.name.trim(),
      description: newPackage.description.trim() || null,
      tokens: Number(newPackage.tokens),
      priceMinor: Number(newPackage.priceMinor),
      currency: newPackage.currency.trim().toUpperCase() || 'USD',
    });
    newPackage.name = '';
    newPackage.description = '';
  } catch (err) {
    localError.value = err?.message ?? t('adminTokens.packages.errors.saveFailed');
  }
};

const togglePackage = async (pkg) => {
  await store.togglePackageStatus(pkg.id, pkg.status === 'active' ? 'inactive' : 'active');
};

const saveChannelPricing = async (channel) => {
  const value = Number(pricingDraft[channel]);
  if (!Number.isFinite(value) || value < 1) return;
  await store.updateChannelPricing({ channel, tokensPerRecipient: value });
};

const loadTenant = async () => {
  const id = tenantIdInput.value.trim();
  if (!id) return;
  await store.fetchTenantWalletData(id);
  if (store.tenantLimits) {
    limitsDraft.monthlyTotal = store.tenantLimits.monthlyTotal;
    limitsDraft.monthlyPerChannel = {
      email: store.tenantLimits.monthlyPerChannel?.email ?? null,
      sms: store.tenantLimits.monthlyPerChannel?.sms ?? null,
      whatsapp: store.tenantLimits.monthlyPerChannel?.whatsapp ?? null,
    };
    limitsDraft.enforcement = store.tenantLimits.enforcement ?? 'hard';
    limitsDraft.notes = store.tenantLimits.notes ?? '';
  }
};

const saveLimits = async () => {
  if (!tenantIdInput.value) return;
  await store.updateTenantSendLimits(tenantIdInput.value.trim(), {
    monthlyTotal: limitsDraft.monthlyTotal === null || limitsDraft.monthlyTotal === ''
      ? null
      : Number(limitsDraft.monthlyTotal),
    monthlyPerChannel: {
      email: limitsDraft.monthlyPerChannel.email === '' || limitsDraft.monthlyPerChannel.email === null
        ? null
        : Number(limitsDraft.monthlyPerChannel.email),
      sms: limitsDraft.monthlyPerChannel.sms === '' || limitsDraft.monthlyPerChannel.sms === null
        ? null
        : Number(limitsDraft.monthlyPerChannel.sms),
      whatsapp:
        limitsDraft.monthlyPerChannel.whatsapp === '' || limitsDraft.monthlyPerChannel.whatsapp === null
          ? null
          : Number(limitsDraft.monthlyPerChannel.whatsapp),
    },
    enforcement: limitsDraft.enforcement,
    notes: limitsDraft.notes || null,
  });
};

const submitAdjustment = async () => {
  if (!tenantIdInput.value || !adjustmentDraft.reason.trim()) return;
  await store.adjustTenantWallet(tenantIdInput.value.trim(), {
    direction: adjustmentDraft.direction,
    amount: Number(adjustmentDraft.amount),
    reason: adjustmentDraft.reason.trim(),
  });
  adjustmentDraft.reason = '';
};

const approvePurchase = async (purchase) => {
  await store.approvePurchase(purchase.id, null);
};

const rejectPurchase = async (purchase) => {
  const notes = window.prompt(t('adminTokens.purchases.rejectPrompt')) ?? null;
  await store.rejectPurchase(purchase.id, notes);
};
</script>

<template>
  <section class="token-settings">
    <header class="token-settings__header">
      <div>
        <h2>{{ t('adminTokens.title') }}</h2>
        <p>{{ t('adminTokens.subtitle') }}</p>
      </div>
      <AppButton variant="secondary" @click="refresh">{{ t('common.search') }}</AppButton>
    </header>

    <AppAlert v-if="store.lastError" variant="error">{{ store.lastError }}</AppAlert>
    <AppAlert v-if="localError" variant="error">{{ localError }}</AppAlert>

    <!-- Token packages --------------------------------------------------- -->
    <AppCard padded>
      <template #title>{{ t('adminTokens.packages.title') }}</template>
      <div class="token-settings__new-package">
        <AppInput
          v-model="newPackage.name"
          :label="t('adminTokens.packages.fields.name')"
          required
        />
        <AppInput
          v-model.number="newPackage.tokens"
          type="number"
          :label="t('adminTokens.packages.fields.tokens')"
          required
        />
        <AppInput
          v-model.number="newPackage.priceMinor"
          type="number"
          :label="t('adminTokens.packages.fields.priceMinor')"
          :hint="t('adminTokens.packages.fields.priceMinorHint')"
        />
        <AppInput
          v-model="newPackage.currency"
          :label="t('adminTokens.packages.fields.currency')"
        />
        <AppInput
          v-model="newPackage.description"
          :label="t('adminTokens.packages.fields.description')"
        />
        <div class="token-settings__form-actions">
          <AppButton :loading="store.isMutating" @click="createPackage">
            {{ t('adminTokens.packages.create') }}
          </AppButton>
        </div>
      </div>

      <AppLoader v-if="store.isLoadingPackages" />
      <AppTable
        v-else
        :columns="packageColumns"
        :rows="store.packages"
        row-key="id"
        :empty="t('adminTokens.packages.empty')"
      >
        <template #cell:price="{ row }">{{ formatCurrency(row.priceMinor, row.currency) }}</template>
        <template #cell:status="{ row }">
          <AppBadge :variant="row.status === 'active' ? 'success' : 'neutral'">
            {{ t(`adminTokens.packages.statuses.${row.status}`) }}
          </AppBadge>
        </template>
        <template #cell:actions="{ row }">
          <AppButton variant="ghost" size="sm" @click="togglePackage(row)">
            {{
              row.status === 'active'
                ? t('adminTokens.packages.deactivate')
                : t('adminTokens.packages.activate')
            }}
          </AppButton>
        </template>
      </AppTable>
    </AppCard>

    <!-- Channel pricing ------------------------------------------------- -->
    <AppCard padded>
      <template #title>{{ t('adminTokens.channelPricing.title') }}</template>
      <p>{{ t('adminTokens.channelPricing.subtitle') }}</p>
      <div class="token-settings__pricing-grid">
        <div v-for="channel in channels" :key="channel" class="token-settings__pricing-card">
          <h4>{{ t(`campaigns.channels.${channel}`) }}</h4>
          <AppInput
            v-model.number="pricingDraft[channel]"
            type="number"
            :label="t('adminTokens.channelPricing.tokensPerRecipient')"
          />
          <AppButton size="sm" :loading="store.isMutating" @click="saveChannelPricing(channel)">
            {{ t('common.save') }}
          </AppButton>
        </div>
      </div>
    </AppCard>

    <!-- Tenant inspection panel ----------------------------------------- -->
    <AppCard padded>
      <template #title>{{ t('adminTokens.tenant.title') }}</template>
      <p>{{ t('adminTokens.tenant.subtitle') }}</p>
      <div class="token-settings__tenant-row">
        <AppInput
          v-model="tenantIdInput"
          :label="t('adminTokens.tenant.tenantIdLabel')"
          :placeholder="t('adminTokens.tenant.tenantIdPlaceholder')"
        />
        <AppButton variant="secondary" @click="loadTenant">{{ t('adminTokens.tenant.load') }}</AppButton>
      </div>
      <div v-if="store.tenantWallet" class="token-settings__tenant-data">
        <div class="token-settings__kpis">
          <div class="token-settings__kpi">
            <span>{{ t('adminTokens.tenant.balance') }}</span>
            <strong>{{ store.tenantWallet.balance }}</strong>
          </div>
          <div class="token-settings__kpi">
            <span>{{ t('adminTokens.tenant.lifetimeCredited') }}</span>
            <strong>{{ store.tenantWallet.lifetimeCredited }}</strong>
          </div>
          <div class="token-settings__kpi">
            <span>{{ t('adminTokens.tenant.lifetimeDebited') }}</span>
            <strong>{{ store.tenantWallet.lifetimeDebited }}</strong>
          </div>
          <div class="token-settings__kpi">
            <span>{{ t('adminTokens.tenant.lifetimeRefunded') }}</span>
            <strong>{{ store.tenantWallet.lifetimeRefunded }}</strong>
          </div>
        </div>
        <div class="token-settings__usage">
          <h4>{{ t('adminTokens.tenant.monthlyUsage') }}</h4>
          <p>
            {{ store.tenantUsage?.yearMonth ?? '—' }} ·
            {{ t('adminTokens.tenant.usageTotal', { total: store.tenantUsage?.total ?? 0 }) }}
          </p>
          <ul>
            <li v-for="channel in channels" :key="channel">
              <strong>{{ t(`campaigns.channels.${channel}`) }}:</strong>
              {{ store.tenantUsage?.perChannel?.[channel] ?? 0 }}
            </li>
          </ul>
        </div>

        <h4>{{ t('adminTokens.limits.title') }}</h4>
        <div class="token-settings__limits-grid">
          <AppInput
            v-model.number="limitsDraft.monthlyTotal"
            type="number"
            :label="t('adminTokens.limits.monthlyTotal')"
            :placeholder="t('adminTokens.limits.unlimited')"
          />
          <AppInput
            v-for="channel in channels"
            :key="channel"
            v-model.number="limitsDraft.monthlyPerChannel[channel]"
            type="number"
            :label="t(`adminTokens.limits.${channel}`)"
            :placeholder="t('adminTokens.limits.unlimited')"
          />
          <AppSelect
            v-model="limitsDraft.enforcement"
            :label="t('adminTokens.limits.enforcement.label')"
            :options="enforcementOptions"
          />
          <AppTextarea
            v-model="limitsDraft.notes"
            :label="t('adminTokens.limits.notes')"
            rows="2"
          />
          <div class="token-settings__form-actions">
            <AppButton :loading="store.isMutating" @click="saveLimits">{{ t('common.save') }}</AppButton>
          </div>
        </div>

        <h4>{{ t('adminTokens.adjustments.title') }}</h4>
        <div class="token-settings__limits-grid">
          <AppSelect
            v-model="adjustmentDraft.direction"
            :label="t('adminTokens.adjustments.directionLabel')"
            :options="directionOptions"
          />
          <AppInput
            v-model.number="adjustmentDraft.amount"
            type="number"
            :label="t('adminTokens.adjustments.amount')"
          />
          <AppTextarea
            v-model="adjustmentDraft.reason"
            :label="t('adminTokens.adjustments.reason')"
            rows="2"
            required
          />
          <div class="token-settings__form-actions">
            <AppButton :loading="store.isMutating" @click="submitAdjustment">
              {{ t('adminTokens.adjustments.submit') }}
            </AppButton>
          </div>
        </div>
      </div>
    </AppCard>

    <!-- Pending purchases ------------------------------------------------ -->
    <AppCard padded>
      <template #title>{{ t('adminTokens.purchases.title') }}</template>
      <AppLoader v-if="store.isLoadingPurchases" />
      <AppTable
        v-else
        :columns="pendingColumns"
        :rows="store.pendingPurchases"
        row-key="id"
        :empty="t('adminTokens.purchases.empty')"
      >
        <template #cell:createdAt="{ row }">{{ formatDate(row.createdAt) }}</template>
        <template #cell:price="{ row }">{{ formatCurrency(row.priceMinor, row.currency) }}</template>
        <template #cell:actions="{ row }">
          <AppButton size="sm" :loading="store.isMutating" @click="approvePurchase(row)">
            {{ t('adminTokens.purchases.approve') }}
          </AppButton>
          <AppButton variant="ghost" size="sm" @click="rejectPurchase(row)">
            {{ t('adminTokens.purchases.reject') }}
          </AppButton>
        </template>
      </AppTable>
    </AppCard>
  </section>
</template>

<style scoped>
.token-settings {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.token-settings__header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--space-4);
}

.token-settings__header h2 {
  margin: 0 0 var(--space-1) 0;
}

.token-settings__header p {
  margin: 0;
  color: var(--color-text-muted);
}

.token-settings__new-package {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
  gap: var(--space-3);
  margin-bottom: var(--space-3);
  align-items: end;
}

.token-settings__form-actions {
  align-self: end;
}

.token-settings__pricing-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
  gap: var(--space-3);
  margin-top: var(--space-2);
}

.token-settings__pricing-card {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
}

.token-settings__pricing-card h4 {
  margin: 0;
}

.token-settings__tenant-row {
  display: flex;
  gap: var(--space-3);
  align-items: flex-end;
  margin-bottom: var(--space-3);
}

.token-settings__tenant-data {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.token-settings__kpis {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr));
  gap: var(--space-2);
}

.token-settings__kpi {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--space-3);
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.token-settings__kpi span {
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
}

.token-settings__kpi strong {
  font-size: var(--font-size-xl);
}

.token-settings__usage ul {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
}

.token-settings__limits-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
  gap: var(--space-3);
  align-items: end;
}
</style>
