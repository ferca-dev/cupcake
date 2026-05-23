<script setup>
// Contacts list view. Wraps the contacts Pinia store so the page handles
// filtering, pagination, create/edit through the contact form modal, and
// archive/delete actions. Channel readiness from the backend is surfaced as
// status pills so users can spot incomplete records before scheduling a
// campaign.
import { computed, onMounted, ref } from 'vue';

import { useContactsStore } from '../../stores/contacts.store.js';
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
import ContactFormModal from './ContactFormModal.vue';

const store = useContactsStore();
const { t } = useI18n();

const isModalOpen = ref(false);
const editingContact = ref(null);
const isSubmitting = ref(false);
const serverError = ref('');
const serverDetails = ref([]);

const columns = computed(() => [
  { key: 'fullName', label: t('contacts.list.columns.name') },
  { key: 'email', label: t('contacts.list.columns.email') },
  { key: 'phone', label: t('contacts.list.columns.phone') },
  { key: 'whatsappPhone', label: t('contacts.list.columns.whatsapp') },
  { key: 'channels', label: t('contacts.list.columns.channels') },
  { key: 'consent', label: t('contacts.list.columns.consent') },
  { key: 'status', label: t('contacts.list.columns.status') },
  { key: 'actions', label: t('contacts.list.columns.actions'), align: 'right' },
]);

const statusOptions = computed(() => [
  { value: '', label: t('contacts.list.filters.allStatuses') },
  { value: 'active', label: t('contacts.modal.status.active') },
  { value: 'archived', label: t('contacts.modal.status.archived') },
  { value: 'blocked', label: t('contacts.modal.status.blocked') },
]);

const channelOptions = computed(() => [
  { value: '', label: t('contacts.list.filters.allChannels') },
  { value: 'email', label: t('contacts.list.filters.channelEmail') },
  { value: 'phone', label: t('contacts.list.filters.channelPhone') },
  { value: 'whatsapp', label: t('contacts.list.filters.channelWhatsapp') },
]);

const groupOptions = computed(() => [
  { value: '', label: t('contacts.list.filters.allGroups') },
  ...store.groups.map((group) => ({ value: group.id, label: group.name })),
]);

const rows = computed(() => store.contacts);

const refresh = async () => {
  try {
    await Promise.all([store.fetchContacts(), store.fetchGroups()]);
  } catch {
    // The store keeps `lastError` populated so the alert below shows the message.
  }
};

onMounted(refresh);

const onFilterChange = (key, value) => {
  store.setFilters({ [key]: value });
  store.fetchContacts().catch(() => {});
};

const openCreate = () => {
  editingContact.value = null;
  serverError.value = '';
  serverDetails.value = [];
  isModalOpen.value = true;
};

const openEdit = (contact) => {
  editingContact.value = contact;
  serverError.value = '';
  serverDetails.value = [];
  isModalOpen.value = true;
};

const closeModal = () => {
  if (isSubmitting.value) return;
  isModalOpen.value = false;
  editingContact.value = null;
};

const handleSubmit = async (payload) => {
  isSubmitting.value = true;
  serverError.value = '';
  serverDetails.value = [];
  try {
    if (editingContact.value?.id) {
      await store.updateContact(editingContact.value.id, payload);
    } else {
      await store.createContact(payload);
    }
    isModalOpen.value = false;
    editingContact.value = null;
    await store.fetchContacts();
  } catch (err) {
    serverError.value = err?.message ?? t('contacts.errors.saveFailed');
    serverDetails.value = (err?.details ?? []).map((detail) => detail?.message ?? '');
  } finally {
    isSubmitting.value = false;
  }
};

const archive = async (contact) => {
  await store.archiveContact(contact.id);
};

const hardDelete = async (contact) => {
  if (typeof window !== 'undefined') {
    const ok = window.confirm(t('contacts.list.confirmDelete'));
    if (!ok) return;
  }
  await store.deleteContactHard(contact.id);
};

const statusVariant = (status) => {
  switch (status) {
    case 'active':
      return 'success';
    case 'archived':
      return 'neutral';
    case 'blocked':
      return 'danger';
    default:
      return 'info';
  }
};

const channelLabel = (channel, info) => {
  if (info?.ready) return t(`contacts.channels.${channel}.ready`);
  return t(`contacts.channels.${channel}.${info?.reason ?? 'unknown'}`, {
    defaultValue: info?.reason ?? '',
  });
};

const isReady = (info) => Boolean(info?.ready);

const consentVariant = (status) => {
  switch (status) {
    case 'subscribed':
      return 'success';
    case 'pending':
    case 'unknown':
      return 'warning';
    case 'unsubscribed':
      return 'danger';
    default:
      return 'neutral';
  }
};
</script>

<template>
  <section class="contacts">
    <header class="contacts__header">
      <div>
        <h2>{{ t('contacts.list.title') }}</h2>
        <p>{{ t('contacts.list.subtitle') }}</p>
      </div>
      <AppButton @click="openCreate">{{ t('contacts.list.newContact') }}</AppButton>
    </header>

    <AppAlert v-if="store.lastError" variant="error">{{ store.lastError }}</AppAlert>

    <AppCard padded>
      <template #title>{{ t('contacts.list.filters.title') }}</template>
      <div class="contacts__filters">
        <AppInput
          :model-value="store.filters.search"
          :label="t('common.search')"
          @update:model-value="(value) => onFilterChange('search', value)"
        />
        <AppSelect
          :model-value="store.filters.status"
          :options="statusOptions"
          :label="t('contacts.list.filters.status')"
          @update:model-value="(value) => onFilterChange('status', value)"
        />
        <AppSelect
          :model-value="store.filters.channel"
          :options="channelOptions"
          :label="t('contacts.list.filters.channel')"
          @update:model-value="(value) => onFilterChange('channel', value)"
        />
        <AppSelect
          :model-value="store.filters.groupId"
          :options="groupOptions"
          :label="t('contacts.list.filters.group')"
          @update:model-value="(value) => onFilterChange('groupId', value)"
        />
        <AppInput
          :model-value="store.filters.tag"
          :label="t('contacts.list.filters.tag')"
          @update:model-value="(value) => onFilterChange('tag', value)"
        />
      </div>
    </AppCard>

    <AppCard padded>
      <template #title>{{ t('contacts.list.allContacts') }}</template>
      <AppLoader v-if="store.isLoadingContacts && rows.length === 0" />
      <AppTable
        v-else
        :columns="columns"
        :rows="rows"
        row-key="id"
        :empty="t('contacts.list.empty')"
        max-height="65vh"
      >
        <template #cell:fullName="{ row }">
          <strong>{{
            row.fullName || `${row.firstName ?? ''} ${row.lastName ?? ''}`.trim() || '—'
          }}</strong>
          <div v-if="row.tags && row.tags.length" class="contacts__tags">
            <AppBadge v-for="tag in row.tags" :key="tag" variant="info">{{ tag }}</AppBadge>
          </div>
        </template>
        <template #cell:email="{ row }">
          {{ row.email || '—' }}
        </template>
        <template #cell:phone="{ row }">
          {{ row.phone || '—' }}
        </template>
        <template #cell:whatsappPhone="{ row }">
          {{ row.whatsappPhone || '—' }}
        </template>
        <template #cell:channels="{ row }">
          <div class="contacts__channels">
            <AppBadge
              v-for="key in ['email', 'phone', 'whatsapp_phone']"
              :key="key"
              :variant="isReady(row.channels?.[key]) ? 'success' : 'warning'"
              :title="channelLabel(key, row.channels?.[key])"
            >
              {{ t(`contacts.channels.${key}.short`) }}
            </AppBadge>
          </div>
        </template>
        <template #cell:consent="{ row }">
          <div class="contacts__channels">
            <AppBadge
              v-for="key in ['email', 'sms', 'whatsapp']"
              :key="key"
              :variant="consentVariant(row.consent?.[key]?.status)"
              :title="`${row.consent?.[key]?.source ?? ''} ${row.consent?.[key]?.changedAt ?? ''}`"
            >
              {{ t(`contacts.consent.short.${key}`) }}:
              {{ t(`contacts.consent.statuses.${row.consent?.[key]?.status ?? 'unknown'}`) }}
            </AppBadge>
          </div>
        </template>
        <template #cell:status="{ row }">
          <AppBadge :variant="statusVariant(row.status)">{{ row.status }}</AppBadge>
        </template>
        <template #cell:actions="{ row }">
          <div class="contacts__actions">
            <AppButton size="sm" variant="secondary" @click="openEdit(row)">
              {{ t('common.edit') }}
            </AppButton>
            <AppButton
              v-if="row.status !== 'archived'"
              size="sm"
              variant="ghost"
              @click="archive(row)"
            >
              {{ t('contacts.list.archive') }}
            </AppButton>
            <AppButton size="sm" variant="danger" @click="hardDelete(row)">
              {{ t('common.delete') }}
            </AppButton>
          </div>
        </template>
      </AppTable>
    </AppCard>

    <ContactFormModal
      v-model="isModalOpen"
      :contact="editingContact"
      :available-groups="store.activeGroups"
      :is-submitting="isSubmitting"
      :server-error="serverError"
      :server-details="serverDetails"
      @submit="handleSubmit"
      @close="closeModal"
    />
  </section>
</template>

<style scoped>
.contacts {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.contacts__header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--space-4);
}

.contacts__header h2 {
  margin: 0;
}

.contacts__header p {
  margin: 0;
  color: var(--color-text-muted);
}

.contacts__filters {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: var(--space-3);
}

.contacts__tags {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1);
  margin-top: var(--space-1);
}

.contacts__channels {
  display: flex;
  gap: var(--space-1);
  flex-wrap: wrap;
}

.contacts__actions {
  display: inline-flex;
  gap: var(--space-2);
  justify-content: flex-end;
}
</style>
