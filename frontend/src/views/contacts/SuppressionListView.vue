<script setup>
import { computed, onMounted, reactive, ref } from 'vue';

import { useSuppressionStore } from '../../stores/suppression.store.js';
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
} from '../../components/ui/index.js';

const store = useSuppressionStore();
const { t } = useI18n();

const form = reactive({
  channel: 'email',
  value: '',
  reason: 'manual',
});
const formError = ref('');

const columns = computed(() => [
  { key: 'value', label: t('suppression.columns.value'), minWidth: '180px' },
  { key: 'channel', label: t('suppression.columns.channel') },
  { key: 'reason', label: t('suppression.columns.reason') },
  { key: 'source', label: t('suppression.columns.source') },
  { key: 'status', label: t('suppression.columns.status') },
  { key: 'protected', label: t('suppression.columns.protected') },
  { key: 'createdAt', label: t('suppression.columns.createdAt') },
  { key: 'actions', label: t('suppression.columns.actions'), align: 'right' },
]);

const channelOptions = computed(() => [
  { value: '', label: t('suppression.filters.allChannels') },
  { value: 'email', label: t('suppression.channels.email') },
  { value: 'sms', label: t('suppression.channels.sms') },
  { value: 'whatsapp', label: t('suppression.channels.whatsapp') },
]);

const formChannelOptions = computed(() => channelOptions.value.filter((option) => option.value));

const statusOptions = computed(() => [
  { value: '', label: t('suppression.filters.allStatuses') },
  { value: 'active', label: t('suppression.statuses.active') },
  { value: 'inactive', label: t('suppression.statuses.inactive') },
]);

const reasonValues = [
  'manual',
  'unsubscribe',
  'sms_stop',
  'whatsapp_opt_out',
  'provider',
  'legal',
  'bounce',
  'complaint',
  'other',
];

const sourceValues = [
  'manual',
  'email_unsubscribe',
  'twilio',
  'sendgrid',
  'whatsapp',
  'provider',
  'import',
  'system',
];

const reasonOptions = computed(() => [
  { value: '', label: t('suppression.filters.allReasons') },
  ...reasonValues.map((value) => ({
    value,
    label: t(`suppression.reasons.${value}`, { defaultValue: value }),
  })),
]);

const formReasonOptions = computed(() => reasonOptions.value.filter((option) => option.value));

const sourceOptions = computed(() => [
  { value: '', label: t('suppression.filters.allSources') },
  ...sourceValues.map((value) => ({
    value,
    label: t(`suppression.sources.${value}`, { defaultValue: value }),
  })),
]);

const refresh = () => store.fetchEntries().catch(() => {});

onMounted(refresh);

const onFilterChange = (key, value) => {
  store.setFilters({ [key]: value });
  refresh();
};

const createEntry = async () => {
  formError.value = '';
  if (!form.channel || !form.value.trim()) {
    formError.value = t('suppression.create.invalid');
    return;
  }
  try {
    await store.createEntry({
      channel: form.channel,
      value: form.value.trim(),
      reason: form.reason,
    });
    form.value = '';
  } catch (err) {
    formError.value = err?.message ?? t('suppression.saveFailed');
  }
};

const release = async (entry) => {
  if (typeof window !== 'undefined') {
    const ok = window.confirm(t('suppression.releaseConfirm'));
    if (!ok) return;
  }
  try {
    await store.releaseEntry(entry.id);
  } catch (err) {
    store.lastError = err?.message ?? t('suppression.releaseFailed');
  }
};

const statusVariant = (status) => (status === 'active' ? 'danger' : 'neutral');

const protectedVariant = (value) => (value ? 'warning' : 'neutral');

const formatDate = (value) => {
  if (!value) return '—';
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
};
</script>

<template>
  <section class="suppression">
    <header class="suppression__header">
      <div>
        <h2>{{ t('suppression.title') }}</h2>
        <p>{{ t('suppression.subtitle') }}</p>
      </div>
      <AppButton variant="secondary" @click="refresh">{{ t('common.refresh') }}</AppButton>
    </header>

    <AppAlert v-if="store.lastError" variant="error">{{ store.lastError }}</AppAlert>

    <AppCard padded>
      <template #title>{{ t('suppression.create.title') }}</template>
      <div class="suppression__form">
        <AppSelect
          v-model="form.channel"
          :options="formChannelOptions"
          :label="t('suppression.filters.channel')"
        />
        <AppInput v-model="form.value" :label="t('suppression.create.address')" />
        <AppSelect
          v-model="form.reason"
          :options="formReasonOptions"
          :label="t('suppression.filters.reason')"
        />
        <AppButton :loading="store.isSaving" @click="createEntry">
          {{ t('suppression.create.submit') }}
        </AppButton>
      </div>
      <AppAlert v-if="formError" variant="error">{{ formError }}</AppAlert>
    </AppCard>

    <AppCard padded>
      <template #title>{{ t('suppression.filters.title') }}</template>
      <div class="suppression__filters">
        <AppInput
          :model-value="store.filters.search"
          :label="t('common.search')"
          @update:model-value="(value) => onFilterChange('search', value)"
        />
        <AppSelect
          :model-value="store.filters.channel"
          :options="channelOptions"
          :label="t('suppression.filters.channel')"
          @update:model-value="(value) => onFilterChange('channel', value)"
        />
        <AppSelect
          :model-value="store.filters.status"
          :options="statusOptions"
          :label="t('suppression.filters.status')"
          @update:model-value="(value) => onFilterChange('status', value)"
        />
        <AppSelect
          :model-value="store.filters.reason"
          :options="reasonOptions"
          :label="t('suppression.filters.reason')"
          @update:model-value="(value) => onFilterChange('reason', value)"
        />
        <AppSelect
          :model-value="store.filters.source"
          :options="sourceOptions"
          :label="t('suppression.filters.source')"
          @update:model-value="(value) => onFilterChange('source', value)"
        />
      </div>
    </AppCard>

    <AppCard padded>
      <template #title>{{ t('suppression.title') }}</template>
      <AppLoader v-if="store.isLoading && !store.entries.length" />
      <AppTable
        v-else
        :columns="columns"
        :rows="store.entries"
        row-key="id"
        :empty="t('suppression.empty')"
        max-height="65vh"
      >
        <template #cell:channel="{ row }">
          <AppBadge variant="info">
            {{ t(`suppression.channels.${row.channel}`, { defaultValue: row.channel }) }}
          </AppBadge>
        </template>
        <template #cell:reason="{ row }">
          {{ t(`suppression.reasons.${row.reason}`, { defaultValue: row.reason }) }}
        </template>
        <template #cell:source="{ row }">
          {{ t(`suppression.sources.${row.source}`, { defaultValue: row.source }) }}
        </template>
        <template #cell:status="{ row }">
          <AppBadge :variant="statusVariant(row.status)">
            {{ t(`suppression.statuses.${row.status}`, { defaultValue: row.status }) }}
          </AppBadge>
        </template>
        <template #cell:protected="{ row }">
          <AppBadge :variant="protectedVariant(row.protected)">
            {{ row.protected ? t('suppression.protectedYes') : t('suppression.protectedNo') }}
          </AppBadge>
        </template>
        <template #cell:createdAt="{ row }">{{ formatDate(row.createdAt) }}</template>
        <template #cell:actions="{ row }">
          <AppButton
            v-if="row.status === 'active'"
            size="sm"
            variant="secondary"
            @click="release(row)"
          >
            {{ t('suppression.release') }}
          </AppButton>
          <span v-else>—</span>
        </template>
      </AppTable>
    </AppCard>
  </section>
</template>

<style scoped>
.suppression {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.suppression__header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--space-4);
}

.suppression__header h2 {
  margin: 0;
}

.suppression__header p {
  margin: 0;
  color: var(--color-text-muted);
}

.suppression__form,
.suppression__filters {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: var(--space-3);
  align-items: end;
}
</style>
