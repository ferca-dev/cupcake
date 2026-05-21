<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { useAdminStore } from '../../stores/admin.store.js';
import { useI18n } from '../../i18n/index.js';
import {
  AppAlert,
  AppBadge,
  AppButton,
  AppCard,
  AppInput,
  AppLoader,
  AppTable,
} from '../../components/ui/index.js';

const route = useRoute();
const router = useRouter();
const store = useAdminStore();
const { t } = useI18n();

const tenantId = computed(() => route.params.id);
const tenant = computed(() => store.selectedTenant);
const users = computed(() => store.selectedUsers);
const isLoading = computed(() => store.isLoadingDetail);
const isMutating = computed(() => store.isMutating);

const errorMessage = ref('');
const successMessage = ref('');
const statusReason = ref('');

const form = reactive({
  name: '',
  slug: '',
  timezone: '',
  locale: '',
});

const refresh = async () => {
  try {
    const [doc] = await Promise.all([
      store.fetchTenant(tenantId.value),
      store.fetchTenantUsers(tenantId.value),
    ]);
    if (doc) {
      form.name = doc.name ?? '';
      form.slug = doc.slug ?? '';
      form.timezone = doc.settings?.timezone ?? '';
      form.locale = doc.settings?.locale ?? '';
    }
  } catch (err) {
    errorMessage.value = err?.message ?? t('adminPanel.detail.updateError');
  }
};

const goBack = () => router.push({ name: 'admin.tenants.list' });

const formatDate = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString();
};

const statusVariant = (status) => {
  switch (status) {
    case 'active':
      return 'success';
    case 'suspended':
      return 'warning';
    case 'cancelled':
      return 'danger';
    default:
      return 'neutral';
  }
};

const userColumns = computed(() => [
  { key: 'name', label: t('adminPanel.detail.userColumns.name') },
  { key: 'email', label: t('adminPanel.detail.userColumns.email') },
  { key: 'role', label: t('adminPanel.detail.userColumns.role') },
  { key: 'status', label: t('adminPanel.detail.userColumns.status') },
  { key: 'lastLoginAt', label: t('adminPanel.detail.userColumns.lastLoginAt'), align: 'right' },
]);

const buildUpdatePayload = () => {
  const payload = {};
  if (!tenant.value) return payload;
  if (form.name && form.name !== tenant.value.name) payload.name = form.name.trim();
  if (form.slug && form.slug !== tenant.value.slug) payload.slug = form.slug.trim();
  const nextTimezone = form.timezone.trim();
  const nextLocale = form.locale.trim();
  const currentTimezone = tenant.value.settings?.timezone ?? '';
  const currentLocale = tenant.value.settings?.locale ?? '';
  if (nextTimezone !== currentTimezone || nextLocale !== currentLocale) {
    payload.settings = {};
    if (nextTimezone !== currentTimezone) payload.settings.timezone = nextTimezone;
    if (nextLocale !== currentLocale) payload.settings.locale = nextLocale;
  }
  return payload;
};

const saveChanges = async () => {
  errorMessage.value = '';
  successMessage.value = '';
  const payload = buildUpdatePayload();
  if (Object.keys(payload).length === 0) return;
  try {
    await store.updateTenant(tenantId.value, payload);
    successMessage.value = t('adminPanel.detail.statusChanged');
  } catch (err) {
    errorMessage.value = err?.message ?? t('adminPanel.detail.updateError');
  }
};

const changeStatus = async (status) => {
  if (!tenant.value) return;
  const confirmKey =
    status === 'cancelled'
      ? 'adminPanel.detail.confirmCancel'
      : status === 'suspended'
        ? 'adminPanel.detail.confirmSuspend'
        : 'adminPanel.detail.confirmActivate';
  const message = t(confirmKey, { name: tenant.value.name });
  const confirmed = typeof window === 'undefined' ? true : window.confirm(message);
  if (!confirmed) return;

  errorMessage.value = '';
  successMessage.value = '';
  try {
    await store.updateTenantStatus(tenantId.value, {
      status,
      reason: statusReason.value.trim() || undefined,
    });
    statusReason.value = '';
    successMessage.value = t('adminPanel.detail.statusChanged');
    await store.fetchTenantUsers(tenantId.value);
  } catch (err) {
    errorMessage.value = err?.message ?? t('adminPanel.detail.updateError');
  }
};

watch(tenantId, () => {
  refresh();
});

onMounted(refresh);
</script>

<template>
  <section class="tenant-detail">
    <header class="tenant-detail__header">
      <AppButton variant="ghost" size="sm" @click="goBack">
        {{ t('adminPanel.detail.backToList') }}
      </AppButton>
      <h2 v-if="tenant">{{ tenant.name }}</h2>
      <AppBadge v-if="tenant" :variant="statusVariant(tenant.status)">
        {{ t(`adminPanel.tenants.statuses.${tenant.status}`) }}
      </AppBadge>
    </header>

    <AppAlert v-if="errorMessage" variant="error">{{ errorMessage }}</AppAlert>
    <AppAlert v-if="successMessage" variant="success">{{ successMessage }}</AppAlert>

    <AppLoader v-if="isLoading && !tenant" />

    <template v-else-if="tenant">
      <AppCard padded>
        <template #title>{{ t('adminPanel.detail.sectionGeneral') }}</template>
        <form class="tenant-detail__form" @submit.prevent="saveChanges">
          <AppInput v-model="form.name" :label="t('adminPanel.create.nameField')" />
          <AppInput
            v-model="form.slug"
            :label="t('adminPanel.create.slugField')"
            :hint="t('adminPanel.create.slugHint')"
          />
          <div class="tenant-detail__row">
            <AppInput v-model="form.timezone" :label="t('adminPanel.create.timezoneField')" />
            <AppInput v-model="form.locale" :label="t('adminPanel.create.localeField')" />
          </div>
          <div class="tenant-detail__actions">
            <AppButton type="submit" :loading="isMutating">
              {{ t('adminPanel.detail.saveChanges') }}
            </AppButton>
          </div>
        </form>
      </AppCard>

      <AppCard padded>
        <template #title>{{ t('adminPanel.detail.sectionStatus') }}</template>
        <div class="tenant-detail__status">
          <p>
            {{ t('adminPanel.detail.currentStatus') }}:
            <AppBadge :variant="statusVariant(tenant.status)">
              {{ t(`adminPanel.tenants.statuses.${tenant.status}`) }}
            </AppBadge>
          </p>
          <AppInput
            v-model="statusReason"
            :label="t('adminPanel.detail.statusReasonLabel')"
            :hint="t('adminPanel.detail.statusReasonHint')"
          />
          <div class="tenant-detail__status-actions">
            <AppButton
              v-if="tenant.status !== 'active'"
              variant="primary"
              :loading="isMutating"
              @click="changeStatus('active')"
            >
              {{ t('adminPanel.detail.activate') }}
            </AppButton>
            <AppButton
              v-if="tenant.status !== 'suspended'"
              variant="secondary"
              :loading="isMutating"
              @click="changeStatus('suspended')"
            >
              {{ t('adminPanel.detail.suspend') }}
            </AppButton>
            <AppButton
              v-if="tenant.status !== 'cancelled'"
              variant="danger"
              :loading="isMutating"
              @click="changeStatus('cancelled')"
            >
              {{ t('adminPanel.detail.cancel') }}
            </AppButton>
          </div>
        </div>
      </AppCard>

      <AppCard padded>
        <template #title>{{ t('adminPanel.detail.sectionOwner') }}</template>
        <p v-if="!tenant.owner">{{ t('adminPanel.detail.ownerNone') }}</p>
        <ul v-else class="tenant-detail__owner">
          <li>
            <strong>{{ tenant.owner.name }}</strong>
          </li>
          <li>{{ tenant.owner.email }}</li>
          <li>
            <AppBadge :variant="tenant.owner.status === 'active' ? 'success' : 'warning'">
              {{ tenant.owner.status }}
            </AppBadge>
          </li>
        </ul>
      </AppCard>

      <AppCard>
        <template #title>{{ t('adminPanel.detail.sectionUsers') }}</template>
        <AppTable
          :columns="userColumns"
          :rows="users"
          row-key="id"
          :empty="t('adminPanel.detail.noUsers')"
        >
          <template #cell:status="{ row }">
            <AppBadge :variant="row.status === 'active' ? 'success' : 'neutral'">
              {{ row.status }}
            </AppBadge>
          </template>
          <template #cell:lastLoginAt="{ row }">
            {{
              row.lastLoginAt ? formatDate(row.lastLoginAt) : t('adminPanel.detail.neverLoggedIn')
            }}
          </template>
        </AppTable>
      </AppCard>
    </template>
  </section>
</template>

<style scoped>
.tenant-detail {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  max-width: 64rem;
}

.tenant-detail__header {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  flex-wrap: wrap;
}

.tenant-detail__header h2 {
  margin: 0;
}

.tenant-detail__form,
.tenant-detail__status {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.tenant-detail__row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-3);
}

.tenant-detail__actions,
.tenant-detail__status-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-2);
}

.tenant-detail__owner {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

@media (max-width: 720px) {
  .tenant-detail__row {
    grid-template-columns: 1fr;
  }
}
</style>
