<script setup>
import { computed, reactive, watch } from 'vue';

import { AppButton, AppCard, AppInput, AppSelect } from '../../components/ui/index.js';
import { useI18n } from '../../i18n/index.js';

const props = defineProps({
  filters: { type: Object, required: true },
  versions: { type: Array, default: () => [] },
});

const emit = defineEmits(['apply', 'reset']);
const { t } = useI18n();

// Local copy so the form can be edited without mutating the store directly;
// the parent decides when to commit by listening to `apply`. We coerce nulls
// into empty strings so the native inputs render the placeholder option.
const normalise = (value) => ({
  from: value?.from ?? '',
  to: value?.to ?? '',
  channel: value?.channel ?? '',
  campaignId: value?.campaignId ?? '',
  surveyVersionId: value?.surveyVersionId ?? '',
  completionStatus: value?.completionStatus ?? 'all',
});

const local = reactive(normalise(props.filters));

watch(
  () => props.filters,
  (value) => {
    Object.assign(local, normalise(value));
  },
  { deep: true },
);

const channelOptions = computed(() => [
  { value: '', label: t('reports.filters.channelAny') },
  { value: 'email', label: t('reports.filters.channelEmail') },
  { value: 'sms', label: t('reports.filters.channelSms') },
  { value: 'whatsapp', label: t('reports.filters.channelWhatsapp') },
  { value: 'public_link', label: t('reports.filters.channelPublic') },
]);

const versionOptions = computed(() => [
  { value: '', label: t('reports.filters.versionAny') },
  ...props.versions.map((version) => ({
    value: version.id,
    label: t('reports.filters.versionLabel', {
      number: version.versionNumber,
      count: version.responseCount,
    }),
  })),
]);

const onApply = () => {
  emit('apply', { ...local });
};

const onReset = () => {
  Object.assign(local, {
    from: null,
    to: null,
    channel: null,
    campaignId: null,
    surveyVersionId: null,
    completionStatus: 'all',
  });
  emit('reset');
};
</script>

<template>
  <AppCard padded>
    <template #title>{{ t('reports.filters.title') }}</template>
    <form class="report-filters" @submit.prevent="onApply">
      <div class="report-filters__grid">
        <AppInput v-model="local.from" type="date" :label="t('reports.filters.from')" />
        <AppInput v-model="local.to" type="date" :label="t('reports.filters.to')" />
        <AppSelect
          v-model="local.channel"
          :label="t('reports.filters.channel')"
          :options="channelOptions"
        />
        <AppSelect
          v-model="local.surveyVersionId"
          :label="t('reports.filters.version')"
          :options="versionOptions"
        />
      </div>
      <div class="report-filters__actions">
        <AppButton type="button" variant="ghost" @click="onReset">
          {{ t('reports.filters.reset') }}
        </AppButton>
        <AppButton type="submit">{{ t('reports.filters.apply') }}</AppButton>
      </div>
    </form>
  </AppCard>
</template>

<style scoped>
.report-filters {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.report-filters__grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
  gap: var(--space-3);
}

.report-filters__actions {
  display: flex;
  gap: var(--space-2);
  justify-content: flex-end;
}
</style>
