<script setup>
// Super-admin plans screen. Lists every plan in the catalogue and exposes an
// inline modal for creating or editing one. The form drives the same payload
// shape the backend accepts; feature/quota definitions are fetched from the
// catalogue endpoint so we never hard-code the list on the frontend.
import { computed, onMounted, reactive, ref } from 'vue';

import { useAdminPlansStore } from '../../stores/admin-plans.store.js';
import { useI18n } from '../../i18n/index.js';
import {
  AppAlert,
  AppBadge,
  AppButton,
  AppCard,
  AppInput,
  AppLoader,
  AppModal,
  AppSelect,
  AppTable,
  AppTextarea,
} from '../../components/ui/index.js';

const store = useAdminPlansStore();
const { t } = useI18n();

const showModal = ref(false);
const editing = ref(null);
const localError = ref('');

const empty = () => ({
  name: '',
  code: '',
  description: '',
  status: 'draft',
  isDefault: false,
  price: { amountMinor: 0, currency: 'USD', intervalUnit: 'months', intervalCount: 1 },
  features: {},
  quotas: {},
  sortOrder: 0,
});

const form = reactive(empty());
const canOpenForm = computed(
  () => Boolean(store.catalogue) && !store.isLoadingDetail && !store.isMutating,
);

const statusOptions = computed(() => [
  { value: 'draft', label: t('plans.admin.statuses.draft') },
  { value: 'active', label: t('plans.admin.statuses.active') },
  { value: 'archived', label: t('plans.admin.statuses.archived') },
]);

const intervalOptions = [
  { value: 'months', label: 'months' },
  { value: 'years', label: 'years' },
];

const columns = computed(() => [
  { key: 'name', label: t('plans.admin.columns.name') },
  { key: 'code', label: t('plans.admin.columns.code') },
  { key: 'price', label: t('plans.admin.columns.price'), align: 'right' },
  { key: 'status', label: t('plans.admin.columns.status') },
  { key: 'default', label: t('plans.admin.columns.default') },
  { key: 'actions', label: t('common.actions'), align: 'right' },
]);

const formatPrice = (plan) => {
  const minor = plan?.price?.amountMinor ?? 0;
  const currency = plan?.price?.currency ?? 'USD';
  const major = Number(minor) / 100;
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(major);
  } catch {
    return `${major.toFixed(2)} ${currency}`;
  }
};

const openCreate = () => {
  localError.value = '';
  editing.value = null;
  Object.assign(form, empty());
  showModal.value = true;
};

const openEdit = async (planRow) => {
  localError.value = '';
  let detail;
  try {
    detail = (await store.fetchPlan(planRow.id)) ?? planRow;
  } catch {
    // The store exposes the load error; keep the editor closed.
    return;
  }
  editing.value = detail;
  Object.assign(form, {
    name: detail?.name ?? '',
    code: detail?.code ?? '',
    description: detail?.description ?? '',
    status: detail?.status ?? 'draft',
    isDefault: Boolean(detail?.isDefault),
    price: { ...(detail?.price ?? empty().price) },
    features: { ...(detail?.features ?? {}) },
    quotas: { ...(detail?.quotas ?? {}) },
    sortOrder: detail?.sortOrder ?? 0,
  });
  showModal.value = true;
};

const close = () => {
  showModal.value = false;
  editing.value = null;
  localError.value = '';
};

const sanitisedPayload = () => {
  // Convert blank quota inputs to `null` so the backend treats them as
  // unlimited; numeric strings get coerced in the validator.
  const quotas = {};
  for (const def of store.quotaDefinitions) {
    const raw = form.quotas[def.key];
    if (raw === '' || raw === null || raw === undefined) {
      quotas[def.key] = null;
    } else {
      quotas[def.key] = Number(raw);
    }
  }
  const features = {};
  for (const def of store.featureDefinitions) {
    features[def.key] = Boolean(form.features[def.key]);
  }
  return {
    name: form.name.trim(),
    code: form.code.trim().toLowerCase(),
    description: form.description.trim() || null,
    status: form.status,
    isDefault: Boolean(form.isDefault),
    price: {
      amountMinor: Math.max(0, Number(form.price.amountMinor) || 0),
      currency: (form.price.currency || 'USD').toUpperCase(),
      intervalUnit: form.price.intervalUnit,
      intervalCount: Math.max(1, Number(form.price.intervalCount) || 1),
    },
    features,
    quotas,
    sortOrder: Number(form.sortOrder) || 0,
  };
};

const save = async () => {
  localError.value = '';
  if (!form.name.trim() || !form.code.trim()) {
    localError.value = t('plans.admin.form.name') + ' / ' + t('plans.admin.form.code');
    return;
  }
  try {
    if (editing.value?.id) {
      await store.updatePlan(editing.value.id, sanitisedPayload());
    } else {
      await store.createPlan(sanitisedPayload());
    }
    close();
  } catch (err) {
    localError.value = err?.message ?? 'Unable to save plan';
  }
};

const archive = (planRow) => store.updatePlanStatus(planRow.id, 'archived');
const activate = (planRow) => store.updatePlanStatus(planRow.id, 'active');

onMounted(async () => {
  await Promise.allSettled([store.fetchCatalogue(), store.fetchPlans()]);
});
</script>

<template>
  <div class="plans-admin">
    <header class="plans-admin__header">
      <div>
        <h1>{{ t('plans.admin.title') }}</h1>
        <p class="muted">{{ t('plans.admin.subtitle') }}</p>
      </div>
      <AppButton variant="primary" :disabled="!canOpenForm" @click="openCreate">
        {{ t('plans.admin.create') }}
      </AppButton>
    </header>

    <AppAlert v-if="store.lastError" variant="error">
      {{ store.lastError }}
    </AppAlert>

    <AppCard>
      <AppLoader v-if="store.isLoadingPlans" />
      <p v-else-if="store.plans.length === 0" class="muted">
        {{ t('plans.admin.empty') }}
      </p>
      <AppTable v-else :columns="columns" :rows="store.plans">
        <template #cell:name="{ row }">
          <strong>{{ row.name }}</strong>
          <div v-if="row.description" class="muted small">{{ row.description }}</div>
        </template>
        <template #cell:code="{ row }">
          <code>{{ row.code }}</code>
        </template>
        <template #cell:price="{ row }">{{ formatPrice(row) }}</template>
        <template #cell:status="{ row }">
          <AppBadge
            :variant="
              row.status === 'active'
                ? 'success'
                : row.status === 'archived'
                  ? 'neutral'
                  : 'warning'
            "
          >
            {{ t(`plans.admin.statuses.${row.status}`) }}
          </AppBadge>
        </template>
        <template #cell:default="{ row }">
          <AppBadge v-if="row.isDefault" variant="info">★</AppBadge>
        </template>
        <template #cell:actions="{ row }">
          <AppButton variant="ghost" size="sm" :disabled="!canOpenForm" @click="openEdit(row)">
            {{ t('plans.admin.actions.edit') }}
          </AppButton>
          <AppButton
            v-if="row.status !== 'active'"
            variant="ghost"
            size="sm"
            @click="activate(row)"
          >
            {{ t('plans.admin.actions.activate') }}
          </AppButton>
          <AppButton
            v-if="row.status !== 'archived'"
            variant="ghost"
            size="sm"
            @click="archive(row)"
          >
            {{ t('plans.admin.actions.archive') }}
          </AppButton>
        </template>
      </AppTable>
    </AppCard>

    <AppModal
      v-model="showModal"
      size="lg"
      :title="editing ? form.name || form.code : t('plans.admin.create')"
      @close="close"
    >
      <div class="plan-form">
        <AppAlert v-if="localError" variant="error">{{ localError }}</AppAlert>

        <div class="grid-2">
          <AppInput v-model="form.name" :label="t('plans.admin.form.name')" required />
          <AppInput v-model="form.code" :label="t('plans.admin.form.code')" required />
        </div>
        <AppTextarea v-model="form.description" :label="t('plans.admin.form.description')" />

        <div class="grid-3">
          <AppSelect
            v-model="form.status"
            :label="t('plans.admin.form.status')"
            :options="statusOptions"
          />
          <AppInput v-model.number="form.sortOrder" type="number" label="Sort order" />
          <label class="checkbox-row">
            <input v-model="form.isDefault" type="checkbox" />
            <span>{{ t('plans.admin.form.isDefault') }}</span>
          </label>
        </div>

        <fieldset class="plan-form__group">
          <legend>{{ t('plans.admin.form.features') }}</legend>
          <div class="grid-2">
            <label v-for="def in store.featureDefinitions" :key="def.key" class="checkbox-row">
              <input v-model="form.features[def.key]" type="checkbox" />
              <span>
                <strong>{{ def.label }}</strong>
                <span class="muted small">{{ def.description }}</span>
              </span>
            </label>
          </div>
        </fieldset>

        <fieldset class="plan-form__group">
          <legend>{{ t('plans.admin.form.quotas') }}</legend>
          <p class="muted small">{{ t('plans.admin.form.quotaHint') }}</p>
          <div class="grid-2">
            <AppInput
              v-for="def in store.quotaDefinitions"
              :key="def.key"
              v-model="form.quotas[def.key]"
              type="number"
              :label="def.label"
              :placeholder="t('plans.admin.form.unlimited')"
            />
          </div>
        </fieldset>

        <fieldset class="plan-form__group">
          <legend>Price</legend>
          <div class="grid-3">
            <AppInput
              v-model.number="form.price.amountMinor"
              type="number"
              :label="t('plans.admin.form.priceMinor')"
              :hint="t('plans.admin.form.priceMinorHint')"
            />
            <AppInput v-model="form.price.currency" :label="t('plans.admin.form.currency')" />
            <AppInput
              v-model.number="form.price.intervalCount"
              type="number"
              :label="t('plans.admin.form.intervalCount')"
            />
          </div>
          <AppSelect
            v-model="form.price.intervalUnit"
            :label="t('plans.admin.form.intervalUnit')"
            :options="intervalOptions"
          />
        </fieldset>
      </div>

      <template #footer>
        <AppButton variant="ghost" @click="close">
          {{ t('plans.admin.form.cancel') }}
        </AppButton>
        <AppButton variant="primary" :loading="store.isMutating" @click="save">
          {{ t('plans.admin.form.save') }}
        </AppButton>
      </template>
    </AppModal>
  </div>
</template>

<style scoped>
.plans-admin {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}
.plans-admin__header {
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
.plan-form {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}
.plan-form__group {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--space-3);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}
.plan-form__group legend {
  font-weight: 600;
  padding: 0 var(--space-2);
}
.grid-2 {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-3);
}
.grid-3 {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--space-3);
}
.checkbox-row {
  display: flex;
  align-items: flex-start;
  gap: var(--space-2);
}

@media (max-width: 640px) {
  .grid-2,
  .grid-3 {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
