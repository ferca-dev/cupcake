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
  AppModal,
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
const pageError = ref('');
const isImportModalOpen = ref(false);
const importFile = ref(null);
const importJob = ref(null);
const importMapping = ref({});
const importDedupeKeys = ref(['email', 'phone', 'whatsappPhone']);
const importUpdateExisting = ref(true);
const importError = ref('');

const importFields = Object.freeze([
  { key: 'fullName', labelKey: 'contacts.importExport.fields.fullName' },
  { key: 'firstName', labelKey: 'contacts.importExport.fields.firstName' },
  { key: 'lastName', labelKey: 'contacts.importExport.fields.lastName' },
  { key: 'email', labelKey: 'contacts.importExport.fields.email' },
  { key: 'phone', labelKey: 'contacts.importExport.fields.phone' },
  { key: 'whatsappPhone', labelKey: 'contacts.importExport.fields.whatsappPhone' },
  { key: 'tags', labelKey: 'contacts.importExport.fields.tags' },
  { key: 'groups', labelKey: 'contacts.importExport.fields.groups' },
  { key: 'metadata', labelKey: 'contacts.importExport.fields.metadata' },
  { key: 'status', labelKey: 'contacts.importExport.fields.status' },
  { key: 'emailConsent', labelKey: 'contacts.importExport.fields.emailConsent' },
  { key: 'smsConsent', labelKey: 'contacts.importExport.fields.smsConsent' },
  { key: 'whatsappConsent', labelKey: 'contacts.importExport.fields.whatsappConsent' },
]);

const dedupeOptions = Object.freeze([
  { key: 'email', labelKey: 'contacts.importExport.fields.email' },
  { key: 'phone', labelKey: 'contacts.importExport.fields.phone' },
  { key: 'whatsappPhone', labelKey: 'contacts.importExport.fields.whatsappPhone' },
]);

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
const mappingOptions = computed(() => [
  { value: '', label: t('contacts.importExport.notMapped') },
  ...(importJob.value?.headers ?? []).map((header) => ({ value: header, label: header })),
]);
const importCounts = computed(() => importJob.value?.counts ?? {});

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

const openImport = () => {
  importFile.value = null;
  importJob.value = null;
  importMapping.value = {};
  importDedupeKeys.value = ['email', 'phone', 'whatsappPhone'];
  importUpdateExisting.value = true;
  importError.value = '';
  isImportModalOpen.value = true;
};

const closeImport = () => {
  if (store.isImportingContacts) return;
  isImportModalOpen.value = false;
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

const setImportFile = (event) => {
  importFile.value = event.target.files?.[0] ?? null;
};

const uploadImport = async () => {
  if (!importFile.value) return;
  importError.value = '';
  try {
    const job = await store.uploadContactImport(importFile.value);
    importJob.value = job;
    importMapping.value = { ...(job?.suggestedMapping ?? {}) };
    importDedupeKeys.value = job?.dedupeKeys?.length
      ? [...job.dedupeKeys]
      : ['email', 'phone', 'whatsappPhone'];
    importUpdateExisting.value = job?.updateExisting !== false;
  } catch (err) {
    importError.value = err?.message ?? t('contacts.importExport.uploadFailed');
  }
};

const confirmImport = async () => {
  if (!importJob.value?.id) return;
  importError.value = '';
  try {
    const dedupeKeys = importDedupeKeys.value.length ? importDedupeKeys.value : ['email'];
    await store.saveContactImportMapping(importJob.value.id, {
      mapping: importMapping.value,
      dedupeKeys,
      updateExisting: importUpdateExisting.value,
    });
    importJob.value = await store.confirmContactImport(importJob.value.id);
  } catch (err) {
    importError.value = err?.message ?? t('contacts.importExport.confirmFailed');
  }
};

const downloadImportErrors = async () => {
  if (!importJob.value?.id) return;
  await store.downloadContactImportErrors(importJob.value.id);
};

const exportContacts = async (format) => {
  pageError.value = '';
  try {
    await store.downloadContacts(format);
  } catch (err) {
    pageError.value = err?.message ?? t('contacts.importExport.exportFailed');
  }
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
      <div class="contacts__header-actions">
        <AppButton
          variant="secondary"
          :loading="store.isExportingContacts"
          @click="exportContacts('csv')"
        >
          {{ t('contacts.importExport.exportCsv') }}
        </AppButton>
        <AppButton
          variant="secondary"
          :loading="store.isExportingContacts"
          @click="exportContacts('xlsx')"
        >
          {{ t('contacts.importExport.exportXlsx') }}
        </AppButton>
        <AppButton variant="secondary" @click="openImport">
          {{ t('contacts.importExport.import') }}
        </AppButton>
        <AppButton @click="openCreate">{{ t('contacts.list.newContact') }}</AppButton>
      </div>
    </header>

    <AppAlert v-if="store.lastError" variant="error">{{ store.lastError }}</AppAlert>
    <AppAlert v-if="pageError" variant="error">{{ pageError }}</AppAlert>

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

    <AppModal
      v-model="isImportModalOpen"
      :title="t('contacts.importExport.importTitle')"
      size="lg"
      @close="closeImport"
    >
      <div class="contacts__import">
        <AppAlert v-if="importError" variant="error">{{ importError }}</AppAlert>

        <div class="contacts__upload-row">
          <label class="contacts__file-field">
            <span>{{ t('contacts.importExport.fileLabel') }}</span>
            <input
              type="file"
              accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              @change="setImportFile"
            />
          </label>
          <AppButton
            variant="secondary"
            :disabled="!importFile"
            :loading="store.isImportingContacts && !importJob"
            @click="uploadImport"
          >
            {{ t('contacts.importExport.preview') }}
          </AppButton>
        </div>

        <template v-if="importJob">
          <div class="contacts__import-summary">
            <AppBadge variant="info">{{ importJob.status }}</AppBadge>
            <span>{{
              t('contacts.importExport.totalRows', { count: importCounts.totalRows ?? 0 })
            }}</span>
            <span v-if="importJob.file?.originalName">{{ importJob.file.originalName }}</span>
          </div>

          <div v-if="importJob.sampleRows?.length" class="contacts__sample">
            <table>
              <thead>
                <tr>
                  <th v-for="header in importJob.headers" :key="header">{{ header }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(sample, index) in importJob.sampleRows" :key="index">
                  <td v-for="header in importJob.headers" :key="header">
                    {{ sample[header] || '—' }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div class="contacts__mapping">
            <AppSelect
              v-for="field in importFields"
              :key="field.key"
              v-model="importMapping[field.key]"
              :label="t(field.labelKey)"
              :options="mappingOptions"
            />
          </div>

          <div class="contacts__import-options">
            <label>
              <input v-model="importUpdateExisting" type="checkbox" />
              {{ t('contacts.importExport.updateExisting') }}
            </label>
            <div class="contacts__dedupe">
              <span>{{ t('contacts.importExport.dedupeBy') }}</span>
              <label v-for="option in dedupeOptions" :key="option.key">
                <input v-model="importDedupeKeys" type="checkbox" :value="option.key" />
                {{ t(option.labelKey) }}
              </label>
            </div>
          </div>

          <div v-if="importJob.status === 'completed'" class="contacts__import-result">
            <span>{{
              t('contacts.importExport.created', { count: importCounts.createdRows ?? 0 })
            }}</span>
            <span>{{
              t('contacts.importExport.updated', { count: importCounts.updatedRows ?? 0 })
            }}</span>
            <span>{{
              t('contacts.importExport.rejected', { count: importCounts.rejectedRows ?? 0 })
            }}</span>
          </div>
        </template>
      </div>

      <template #footer>
        <AppButton variant="ghost" @click="closeImport">{{ t('common.close') }}</AppButton>
        <AppButton
          v-if="importJob?.errorReportAvailable"
          variant="secondary"
          @click="downloadImportErrors"
        >
          {{ t('contacts.importExport.downloadErrors') }}
        </AppButton>
        <AppButton
          :disabled="!importJob || importJob.status === 'completed'"
          :loading="store.isImportingContacts && Boolean(importJob)"
          @click="confirmImport"
        >
          {{ t('contacts.importExport.confirm') }}
        </AppButton>
      </template>
    </AppModal>
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

.contacts__header-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: var(--space-2);
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

.contacts__import {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.contacts__upload-row,
.contacts__import-summary,
.contacts__import-options,
.contacts__import-result,
.contacts__dedupe {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-3);
}

.contacts__file-field {
  display: flex;
  flex: 1 1 16rem;
  flex-direction: column;
  gap: var(--space-1);
  font-size: var(--font-size-sm);
  font-weight: 500;
}

.contacts__file-field input {
  color: var(--color-text);
}

.contacts__sample {
  max-height: 12rem;
  overflow: auto;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
}

.contacts__sample table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--font-size-sm);
}

.contacts__sample th,
.contacts__sample td {
  padding: var(--space-2);
  border-bottom: 1px solid var(--color-border);
  text-align: left;
  white-space: nowrap;
}

.contacts__mapping {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
  gap: var(--space-3);
}

.contacts__import-options label,
.contacts__dedupe label {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
}

@media (max-width: 720px) {
  .contacts__header {
    align-items: stretch;
    flex-direction: column;
  }

  .contacts__header-actions {
    justify-content: flex-start;
  }
}
</style>
