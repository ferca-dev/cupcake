<script setup>
// Tenant-facing plan summary. Shows the active plan, what is included, the
// current usage meters, and an "available plans" section the user can click
// into when they want to upgrade.
import { computed, onMounted, ref } from 'vue';

import { useBillingPlansStore } from '../../stores/billing-plans.store.js';
import { useI18n } from '../../i18n/index.js';
import {
  AppAlert,
  AppBadge,
  AppButton,
  AppCard,
  AppLoader,
} from '../../components/ui/index.js';

const store = useBillingPlansStore();
const { t } = useI18n();

const showUpgrades = ref(false);

const isLoading = computed(() => store.isLoadingPlan || store.isLoadingUsage);

const formatPrice = (price) => {
  if (!price || !price.amountMinor) return t('plans.client.planCard.free');
  const major = Number(price.amountMinor) / 100;
  const currency = price.currency || 'USD';
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(major);
  } catch {
    return `${major.toFixed(2)} ${currency}`;
  }
};

const includedFeatures = computed(() => {
  const catalogue = store.catalogue?.features ?? [];
  return catalogue.filter((def) => Boolean(store.plan?.features?.[def.key]));
});

const blockedFeatures = computed(() => {
  const catalogue = store.catalogue?.features ?? [];
  return catalogue.filter((def) => !store.plan?.features?.[def.key]);
});

const refresh = async () => {
  await Promise.all([store.fetchPlan(), store.fetchUsage(), store.fetchCatalogue()]);
};

const onUpgradeClicked = async () => {
  showUpgrades.value = true;
  if (!store.availablePlans.length) {
    await store.fetchAvailablePlans();
  }
};

onMounted(refresh);
</script>

<template>
  <div class="plan-view">
    <header class="plan-view__header">
      <div>
        <h1>{{ t('plans.client.title') }}</h1>
        <p class="muted">{{ t('plans.client.subtitle') }}</p>
      </div>
      <AppButton variant="primary" @click="onUpgradeClicked">
        {{ t('plans.client.upgrade.cta') }}
      </AppButton>
    </header>

    <AppAlert v-if="store.lastError" variant="danger">{{ store.lastError }}</AppAlert>

    <AppLoader v-if="isLoading && !store.plan" />

    <section v-if="store.plan" class="plan-view__summary">
      <AppCard>
        <template #title>
          {{ store.plan.name }}
          <AppBadge :variant="store.plan.status === 'active' ? 'success' : 'warning'">
            {{ store.plan.status }}
          </AppBadge>
        </template>
        <template #actions>
          <strong>{{ formatPrice(store.plan.price) }}</strong>
        </template>
        <p v-if="store.plan.description" class="muted">{{ store.plan.description }}</p>

        <div class="plan-grid">
          <div>
            <h4>{{ t('plans.client.planCard.included') }}</h4>
            <ul class="feature-list">
              <li v-for="def in includedFeatures" :key="def.key">
                <span aria-hidden="true">✓</span>
                <span>
                  <strong>{{ def.label }}</strong>
                  <span class="muted small">{{ def.description }}</span>
                </span>
              </li>
              <li v-if="!includedFeatures.length" class="muted">—</li>
            </ul>
          </div>
          <div>
            <h4>{{ t('plans.client.planCard.notIncluded') }}</h4>
            <ul class="feature-list muted">
              <li v-for="def in blockedFeatures" :key="def.key">
                <span aria-hidden="true">×</span>
                <span>{{ def.label }}</span>
              </li>
              <li v-if="!blockedFeatures.length">—</li>
            </ul>
          </div>
        </div>
      </AppCard>
    </section>

    <section>
      <h2>{{ t('plans.client.usageTitle') }}</h2>
      <AppLoader v-if="store.isLoadingUsage && store.quotas.length === 0" />
      <div v-else class="quota-grid">
        <AppCard v-for="row in store.quotas" :key="row.key" padded>
          <header class="quota-card__head">
            <strong>{{ row.label }}</strong>
            <AppBadge v-if="row.exhausted" variant="danger">{{ t('plans.usage.exhausted') }}</AppBadge>
            <AppBadge v-else-if="row.warning" variant="warning">{{ t('plans.usage.warning') }}</AppBadge>
            <AppBadge v-else-if="row.unlimited" variant="info">{{ t('plans.usage.unlimited') }}</AppBadge>
          </header>
          <div class="quota-bar" :class="{ 'is-warning': row.warning, 'is-exhausted': row.exhausted }">
            <div
              class="quota-bar__fill"
              :style="{ width: row.unlimited ? '12%' : `${row.percentUsed ?? 0}%` }"
            />
          </div>
          <div class="quota-meta muted small">
            <span>{{ t('plans.usage.used') }}: {{ row.used }}</span>
            <span v-if="row.unlimited">{{ t('plans.usage.unlimited') }}</span>
            <span v-else>{{ t('plans.usage.label') }}: {{ row.limit }}</span>
            <span v-if="!row.unlimited && row.remaining !== null">
              {{ t('plans.usage.remaining') }}: {{ row.remaining }}
            </span>
          </div>
        </AppCard>
      </div>
    </section>

    <section v-if="showUpgrades">
      <h2>{{ t('plans.client.upgrade.availableTitle') }}</h2>
      <AppLoader v-if="store.isLoadingAvailable" />
      <p v-else-if="!store.availablePlans.length" class="muted">
        {{ t('plans.client.upgrade.noUpgrades') }}
      </p>
      <div v-else class="plan-list">
        <AppCard v-for="option in store.availablePlans" :key="option.id">
          <template #title>{{ option.name }}</template>
          <template #actions>
            <strong>{{ formatPrice(option.price) }}</strong>
          </template>
          <p v-if="option.description" class="muted">{{ option.description }}</p>
          <ul class="feature-list small">
            <li
              v-for="def in store.catalogue?.features ?? []"
              :key="def.key"
              :class="{ muted: !option.features?.[def.key] }"
            >
              <span aria-hidden="true">{{ option.features?.[def.key] ? '✓' : '×' }}</span>
              {{ def.label }}
            </li>
          </ul>
        </AppCard>
      </div>
    </section>
  </div>
</template>

<style scoped>
.plan-view {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}
.plan-view__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
}
.muted {
  color: var(--color-text-secondary);
}
.small {
  font-size: var(--font-size-xs);
}
.plan-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: var(--space-4);
  margin-top: var(--space-3);
}
.feature-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}
.feature-list li {
  display: flex;
  align-items: flex-start;
  gap: var(--space-2);
}
.quota-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: var(--space-3);
}
.quota-card__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--space-2);
}
.quota-bar {
  height: 8px;
  border-radius: 4px;
  background: var(--color-surface-muted);
  overflow: hidden;
}
.quota-bar__fill {
  height: 100%;
  background: var(--color-primary);
  transition: width 0.3s ease;
}
.quota-bar.is-warning .quota-bar__fill {
  background: var(--color-warning, #f59e0b);
}
.quota-bar.is-exhausted .quota-bar__fill {
  background: var(--color-danger, #dc2626);
}
.quota-meta {
  display: flex;
  gap: var(--space-3);
  margin-top: var(--space-2);
}
.plan-list {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: var(--space-3);
}
</style>
