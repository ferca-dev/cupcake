<script setup>
// Campaigns list view. Lists every campaign the current tenant owns and
// surfaces a "New campaign" modal that picks a published survey, the target
// audience (contacts and/or groups), and the channels to send through.
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';

import { useCampaignsStore } from '../../stores/campaigns.store.js';
import { useContactsStore } from '../../stores/contacts.store.js';
import { surveyService } from '../../services/survey.service.js';
import { useI18n } from '../../i18n/index.js';
import {
  AppAlert,
  AppBadge,
  AppButton,
  AppCard,
  AppInput,
  AppLoader,
  AppModal,
  AppTable,
} from '../../components/ui/index.js';

const router = useRouter();
const store = useCampaignsStore();
const contactsStore = useContactsStore();
const { t } = useI18n();

const surveys = ref([]);
const isLoadingSurveys = ref(false);
const isModalOpen = ref(false);
const isSubmitting = ref(false);
const submitError = ref('');

const draft = ref({
  name: '',
  surveyId: '',
  channels: { email: true, sms: false, whatsapp: false },
  contactIds: new Set(),
  groupIds: new Set(),
});

const channelKeys = ['email', 'sms', 'whatsapp'];

const columns = computed(() => [
  { key: 'name', label: t('campaigns.list.columns.name') },
  { key: 'channels', label: t('campaigns.list.columns.channels') },
  { key: 'status', label: t('campaigns.list.columns.status') },
  { key: 'sent', label: t('campaigns.list.columns.sent') },
  { key: 'skipped', label: t('campaigns.list.columns.skipped') },
  { key: 'createdAt', label: t('campaigns.list.columns.createdAt') },
  { key: 'actions', label: t('campaigns.list.columns.actions'), align: 'right' },
]);

const publishedSurveys = computed(() => surveys.value.filter((s) => s.status === 'published'));

const refresh = async () => {
  isLoadingSurveys.value = true;
  try {
    const [surveysData] = await Promise.all([
      surveyService.list({ limit: 100, sort: '-updatedAt' }),
      store.fetchCampaigns(),
      contactsStore.fetchContacts(),
      contactsStore.fetchGroups(),
    ]);
    surveys.value = surveysData?.items ?? [];
  } catch {
    // Error message already surfaced by the store.
  } finally {
    isLoadingSurveys.value = false;
  }
};

onMounted(refresh);

const openCreate = () => {
  draft.value = {
    name: '',
    // Always leave the survey choice empty so the user has to make a
    // deliberate selection — the campaign service locks onto the survey's
    // immutable published version and there is no good default to pick.
    surveyId: '',
    channels: { email: true, sms: false, whatsapp: false },
    contactIds: new Set(),
    groupIds: new Set(),
  };
  submitError.value = '';
  isModalOpen.value = true;
};

const close = () => {
  if (isSubmitting.value) return;
  isModalOpen.value = false;
};

const toggleSet = (set, value) => {
  const next = new Set(set);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
};

const toggleContact = (id) => {
  draft.value.contactIds = toggleSet(draft.value.contactIds, id);
};
const toggleGroup = (id) => {
  draft.value.groupIds = toggleSet(draft.value.groupIds, id);
};

const submit = async () => {
  submitError.value = '';
  const channels = channelKeys.filter((key) => draft.value.channels[key]);
  if (!draft.value.name.trim()) {
    submitError.value = t('campaigns.modal.errors.nameRequired');
    return;
  }
  if (!draft.value.surveyId) {
    submitError.value = t('campaigns.modal.errors.surveyRequired');
    return;
  }
  if (channels.length === 0) {
    submitError.value = t('campaigns.modal.errors.channelsRequired');
    return;
  }
  const contactIds = [...draft.value.contactIds];
  const groupIds = [...draft.value.groupIds];
  if (contactIds.length === 0 && groupIds.length === 0) {
    submitError.value = t('campaigns.modal.errors.targetRequired');
    return;
  }

  isSubmitting.value = true;
  try {
    const campaign = await store.createCampaign({
      name: draft.value.name.trim(),
      surveyId: draft.value.surveyId,
      channels,
      target: { contactIds, groupIds },
    });
    isModalOpen.value = false;
    if (campaign?.id) {
      router.push({ name: 'campaigns.detail', params: { id: campaign.id } });
    }
  } catch (err) {
    submitError.value = err?.message ?? t('campaigns.modal.errors.createFailed');
  } finally {
    isSubmitting.value = false;
  }
};

const open = (id) => {
  router.push({ name: 'campaigns.detail', params: { id } });
};

const formatDate = (value) => {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
};

const statusVariant = (status) => {
  switch (status) {
    case 'completed':
      return 'success';
    case 'completed_with_errors':
      return 'warning';
    case 'failed':
      return 'danger';
    case 'sending':
    case 'queued':
      return 'info';
    default:
      return 'neutral';
  }
};

const surveyTitle = (id) => surveys.value.find((s) => s.id === id)?.title ?? '—';
</script>

<template>
  <section class="campaigns">
    <header class="campaigns__header">
      <div>
        <h2>{{ t('campaigns.list.title') }}</h2>
        <p>{{ t('campaigns.list.subtitle') }}</p>
      </div>
      <AppButton :disabled="isLoadingSurveys" @click="openCreate">
        {{ t('campaigns.list.newCampaign') }}
      </AppButton>
    </header>

    <AppAlert v-if="store.lastError" variant="error">{{ store.lastError }}</AppAlert>

    <AppCard padded>
      <template #title>{{ t('campaigns.list.allCampaigns') }}</template>
      <AppLoader v-if="store.isLoading && store.campaigns.length === 0" />
      <AppTable
        v-else
        :columns="columns"
        :rows="store.campaigns"
        row-key="id"
        :empty="t('campaigns.list.empty')"
        max-height="65vh"
      >
        <template #cell:name="{ row }">
          <strong>{{ row.name }}</strong>
          <div class="campaigns__row-meta">{{ surveyTitle(row.surveyId) }}</div>
        </template>
        <template #cell:channels="{ row }">
          <div class="campaigns__channels">
            <AppBadge v-for="channel in row.channels" :key="channel" variant="info">
              {{ t(`campaigns.channels.${channel}`) }}
            </AppBadge>
          </div>
        </template>
        <template #cell:status="{ row }">
          <AppBadge :variant="statusVariant(row.status)">
            {{ t(`campaigns.statuses.${row.status}`, { defaultValue: row.status }) }}
          </AppBadge>
        </template>
        <template #cell:sent="{ row }">{{ row.summary?.sentCount ?? 0 }}</template>
        <template #cell:skipped="{ row }">{{ row.summary?.skippedCount ?? 0 }}</template>
        <template #cell:createdAt="{ row }">{{ formatDate(row.createdAt) }}</template>
        <template #cell:actions="{ row }">
          <AppButton size="sm" variant="secondary" @click="open(row.id)">
            {{ t('campaigns.list.open') }}
          </AppButton>
        </template>
      </AppTable>
    </AppCard>

    <AppModal v-model="isModalOpen" :title="t('campaigns.modal.createTitle')" @close="close">
      <div class="campaigns__form">
        <AppAlert v-if="submitError" variant="error">{{ submitError }}</AppAlert>
        <AppAlert v-if="publishedSurveys.length === 0" variant="warning">
          {{ t('campaigns.modal.noPublishedSurveys') }}
        </AppAlert>

        <AppInput
          v-model="draft.name"
          :label="t('campaigns.modal.nameLabel')"
          :hint="t('campaigns.modal.nameHint')"
          required
        />

        <label class="campaigns__field">
          <span class="campaigns__field-label">{{ t('campaigns.modal.surveyLabel') }}</span>
          <select v-model="draft.surveyId" class="campaigns__select" required>
            <option value="" disabled>
              {{ t('campaigns.modal.surveyChoosePlaceholder') }}
            </option>
            <option v-for="survey in publishedSurveys" :key="survey.id" :value="survey.id">
              {{ survey.title }}
            </option>
          </select>
          <span class="campaigns__field-hint">{{ t('campaigns.modal.surveyHint') }}</span>
          <span v-if="draft.surveyId" class="campaigns__field-hint campaigns__field-hint--lock">
            {{ t('campaigns.modal.surveyLockNotice') }}
          </span>
        </label>

        <fieldset class="campaigns__fieldset">
          <legend>{{ t('campaigns.modal.channelsLabel') }}</legend>
          <label v-for="channel in channelKeys" :key="channel" class="campaigns__checkbox">
            <input v-model="draft.channels[channel]" type="checkbox" />
            <span>{{ t(`campaigns.channels.${channel}`) }}</span>
          </label>
        </fieldset>

        <fieldset class="campaigns__fieldset">
          <legend>{{ t('campaigns.modal.groupsLabel') }}</legend>
          <label
            v-for="group in contactsStore.activeGroups"
            :key="group.id"
            class="campaigns__checkbox"
          >
            <input
              type="checkbox"
              :checked="draft.groupIds.has(group.id)"
              @change="toggleGroup(group.id)"
            />
            <span>{{ group.name }}</span>
          </label>
        </fieldset>

        <fieldset class="campaigns__fieldset campaigns__contacts">
          <legend>{{ t('campaigns.modal.contactsLabel') }}</legend>
          <label
            v-for="contact in contactsStore.contacts"
            :key="contact.id"
            class="campaigns__checkbox"
          >
            <input
              type="checkbox"
              :checked="draft.contactIds.has(contact.id)"
              @change="toggleContact(contact.id)"
            />
            <span>{{ contact.fullName || contact.email || contact.phone }}</span>
          </label>
        </fieldset>
      </div>
      <template #footer>
        <AppButton variant="ghost" :disabled="isSubmitting" @click="close">
          {{ t('campaigns.modal.cancel') }}
        </AppButton>
        <AppButton :loading="isSubmitting" @click="submit">
          {{ t('campaigns.modal.submit') }}
        </AppButton>
      </template>
    </AppModal>
  </section>
</template>

<style scoped>
.campaigns {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  max-width: var(--layout-content-max-width);
}

.campaigns__header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--space-4);
}

.campaigns__header h2 {
  margin: 0;
}

.campaigns__header p {
  margin: 0;
  color: var(--color-text-muted);
}

.campaigns__row-meta {
  font-size: var(--font-size-sm);
  color: var(--color-text-muted);
}

.campaigns__channels {
  display: flex;
  gap: var(--space-1);
  flex-wrap: wrap;
}

.campaigns__form {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.campaigns__field {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.campaigns__field-label {
  font-weight: 500;
  font-size: var(--font-size-sm);
}

.campaigns__field-hint {
  color: var(--color-text-muted);
  font-size: var(--font-size-xs);
}

.campaigns__field-hint--lock {
  color: var(--color-text);
  background: var(--color-surface-muted, rgba(37, 99, 235, 0.08));
  padding: 0.35rem 0.5rem;
  border-radius: var(--radius-sm);
}

.campaigns__select {
  font: inherit;
  color: var(--color-text);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: 0.5rem 0.75rem;
}

.campaigns__fieldset {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--space-2) var(--space-3);
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.campaigns__fieldset legend {
  padding: 0 var(--space-1);
  font-weight: 500;
  font-size: var(--font-size-sm);
}

.campaigns__checkbox {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
}

.campaigns__contacts {
  max-height: 12rem;
  overflow-y: auto;
}
</style>
