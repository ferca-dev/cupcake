<script setup>
// Contact groups list view. Allows creating, renaming, archiving, and
// deleting groups, plus assigning contacts to a selected group through a
// secondary modal that lists every contact in the tenant directory.
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
  AppTextarea,
} from '../../components/ui/index.js';

const store = useContactsStore();
const { t } = useI18n();

const isFormOpen = ref(false);
const editingGroup = ref(null);
const draft = ref({ name: '', description: '', status: 'active' });
const formError = ref('');
const isSubmitting = ref(false);

const membershipOpen = ref(false);
const membershipGroup = ref(null);
const membershipError = ref('');
const isMembershipBusy = ref(false);

const columns = computed(() => [
  { key: 'name', label: t('contactGroups.list.columns.name') },
  { key: 'description', label: t('contactGroups.list.columns.description') },
  { key: 'contactCount', label: t('contactGroups.list.columns.members') },
  { key: 'status', label: t('contactGroups.list.columns.status') },
  { key: 'actions', label: t('contactGroups.list.columns.actions'), align: 'right' },
]);

const statusOptions = computed(() => [
  { value: 'active', label: t('contactGroups.modal.status.active') },
  { value: 'archived', label: t('contactGroups.modal.status.archived') },
]);

const refresh = async () => {
  try {
    await Promise.all([store.fetchGroups(), store.fetchContacts()]);
  } catch {
    // store.lastError surfaces via the inline AppAlert.
  }
};

onMounted(refresh);

const openCreate = () => {
  editingGroup.value = null;
  draft.value = { name: '', description: '', status: 'active' };
  formError.value = '';
  isFormOpen.value = true;
};

const openEdit = (group) => {
  editingGroup.value = group;
  draft.value = {
    name: group.name,
    description: group.description ?? '',
    status: group.status,
  };
  formError.value = '';
  isFormOpen.value = true;
};

const closeForm = () => {
  if (isSubmitting.value) return;
  isFormOpen.value = false;
  editingGroup.value = null;
};

const submitForm = async () => {
  if (!draft.value.name.trim()) {
    formError.value = t('contactGroups.modal.errors.nameRequired');
    return;
  }
  isSubmitting.value = true;
  formError.value = '';
  try {
    const payload = {
      name: draft.value.name.trim(),
      description: draft.value.description.trim() || null,
      status: draft.value.status,
    };
    if (editingGroup.value?.id) {
      await store.updateGroup(editingGroup.value.id, payload);
    } else {
      await store.createGroup(payload);
    }
    isFormOpen.value = false;
    editingGroup.value = null;
  } catch (err) {
    formError.value = err?.message ?? t('contactGroups.modal.errors.saveFailed');
  } finally {
    isSubmitting.value = false;
  }
};

const removeGroup = async (group) => {
  if (typeof window !== 'undefined') {
    const ok = window.confirm(t('contactGroups.list.confirmDelete', { name: group.name }));
    if (!ok) return;
  }
  await store.deleteGroup(group.id);
};

const openMembership = (group) => {
  membershipGroup.value = group;
  membershipError.value = '';
  membershipOpen.value = true;
};

const closeMembership = () => {
  if (isMembershipBusy.value) return;
  membershipOpen.value = false;
  membershipGroup.value = null;
};

const membersOf = computed(() => {
  if (!membershipGroup.value) return [];
  return store.contacts.filter((c) => (c.groupIds ?? []).includes(membershipGroup.value.id));
});

const isMember = (contact) =>
  Boolean(membershipGroup.value && contact.groupIds?.includes(membershipGroup.value.id));

const toggleMembership = async (contact) => {
  if (!membershipGroup.value) return;
  isMembershipBusy.value = true;
  membershipError.value = '';
  try {
    if (isMember(contact)) {
      await store.removeContactFromGroup(membershipGroup.value.id, contact.id);
    } else {
      await store.addContactToGroup(membershipGroup.value.id, contact.id);
    }
    // Refresh the local view of the group so member counts stay accurate.
    membershipGroup.value =
      store.groups.find((g) => g.id === membershipGroup.value.id) ?? membershipGroup.value;
  } catch (err) {
    membershipError.value = err?.message ?? t('contactGroups.modal.errors.membershipFailed');
  } finally {
    isMembershipBusy.value = false;
  }
};

const statusVariant = (status) => (status === 'active' ? 'success' : 'neutral');
</script>

<template>
  <section class="groups">
    <header class="groups__header">
      <div>
        <h2>{{ t('contactGroups.list.title') }}</h2>
        <p>{{ t('contactGroups.list.subtitle') }}</p>
      </div>
      <AppButton @click="openCreate">{{ t('contactGroups.list.newGroup') }}</AppButton>
    </header>

    <AppAlert v-if="store.lastError" variant="error">{{ store.lastError }}</AppAlert>

    <AppCard padded>
      <template #title>{{ t('contactGroups.list.allGroups') }}</template>
      <AppLoader v-if="store.isLoadingGroups && store.groups.length === 0" />
      <AppTable
        v-else
        :columns="columns"
        :rows="store.groups"
        row-key="id"
        :empty="t('contactGroups.list.empty')"
        max-height="65vh"
      >
        <template #cell:name="{ row }">
          <strong>{{ row.name }}</strong>
        </template>
        <template #cell:description="{ row }">
          {{ row.description || '—' }}
        </template>
        <template #cell:contactCount="{ row }">
          {{ row.contactCount }}
        </template>
        <template #cell:status="{ row }">
          <AppBadge :variant="statusVariant(row.status)">{{ row.status }}</AppBadge>
        </template>
        <template #cell:actions="{ row }">
          <div class="groups__actions">
            <AppButton size="sm" variant="secondary" @click="openMembership(row)">
              {{ t('contactGroups.list.manage') }}
            </AppButton>
            <AppButton size="sm" variant="ghost" @click="openEdit(row)">
              {{ t('common.edit') }}
            </AppButton>
            <AppButton size="sm" variant="danger" @click="removeGroup(row)">
              {{ t('common.delete') }}
            </AppButton>
          </div>
        </template>
      </AppTable>
    </AppCard>

    <AppModal
      v-model="isFormOpen"
      :title="
        editingGroup ? t('contactGroups.modal.editTitle') : t('contactGroups.modal.createTitle')
      "
      @close="closeForm"
    >
      <div class="groups__form">
        <AppAlert v-if="formError" variant="error">{{ formError }}</AppAlert>
        <AppInput v-model="draft.name" :label="t('contactGroups.modal.name')" required />
        <AppTextarea
          v-model="draft.description"
          :label="t('contactGroups.modal.description')"
          :rows="3"
        />
        <AppSelect
          v-model="draft.status"
          :options="statusOptions"
          :label="t('contactGroups.modal.statusLabel')"
        />
      </div>
      <template #footer>
        <AppButton variant="ghost" :disabled="isSubmitting" @click="closeForm">
          {{ t('common.cancel') }}
        </AppButton>
        <AppButton :loading="isSubmitting" @click="submitForm">
          {{ editingGroup ? t('common.save') : t('contactGroups.modal.create') }}
        </AppButton>
      </template>
    </AppModal>

    <AppModal
      v-model="membershipOpen"
      :title="
        membershipGroup ? t('contactGroups.membership.title', { name: membershipGroup.name }) : ''
      "
      size="lg"
      @close="closeMembership"
    >
      <div class="groups__membership">
        <AppAlert v-if="membershipError" variant="error">{{ membershipError }}</AppAlert>
        <p class="groups__hint">
          {{ t('contactGroups.membership.subtitle', { count: membersOf.length }) }}
        </p>

        <div class="groups__members">
          <p v-if="!store.contacts.length" class="groups__hint">
            {{ t('contactGroups.membership.noContacts') }}
          </p>
          <label v-for="contact in store.contacts" :key="contact.id" class="groups__member">
            <input
              type="checkbox"
              :checked="isMember(contact)"
              :disabled="isMembershipBusy"
              @change="toggleMembership(contact)"
            />
            <span>
              <strong>{{
                contact.fullName || contact.email || contact.phone || contact.whatsappPhone || '—'
              }}</strong>
              <small v-if="contact.email">{{ contact.email }}</small>
            </span>
          </label>
        </div>
      </div>
      <template #footer>
        <AppButton variant="ghost" :disabled="isMembershipBusy" @click="closeMembership">
          {{ t('common.close') }}
        </AppButton>
      </template>
    </AppModal>
  </section>
</template>

<style scoped>
.groups {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  max-width: var(--layout-content-max-width);
}

.groups__header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--space-4);
}

.groups__header h2 {
  margin: 0;
}

.groups__header p {
  margin: 0;
  color: var(--color-text-muted);
}

.groups__actions {
  display: inline-flex;
  gap: var(--space-2);
  justify-content: flex-end;
}

.groups__form {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.groups__membership {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.groups__members {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  max-height: 320px;
  overflow-y: auto;
}

.groups__member {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
}

.groups__member span {
  display: flex;
  flex-direction: column;
}

.groups__member small {
  color: var(--color-text-muted);
}

.groups__hint {
  margin: 0;
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
}
</style>
