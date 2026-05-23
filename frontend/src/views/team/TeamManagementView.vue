<script setup>
import { computed, onMounted, ref } from 'vue';

import { useTeamStore } from '../../stores/team.store.js';
import { useAuthStore } from '../../stores/auth.store.js';
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

const store = useTeamStore();
const auth = useAuthStore();
const { t } = useI18n();

const inviteForm = ref({ email: '', name: '', role: 'client_member' });
const inviteError = ref('');
const transferTarget = ref('');
const showAcceptLink = ref(false);

const roleOptions = computed(() => [
  { value: 'client_admin', label: t('team.roles.client_admin') },
  { value: 'client_member', label: t('team.roles.client_member') },
  { value: 'surveyor', label: t('team.roles.surveyor') },
]);

const memberColumns = computed(() => [
  { key: 'name', label: t('team.members.columns.name') },
  { key: 'email', label: t('team.members.columns.email') },
  { key: 'role', label: t('team.members.columns.role') },
  { key: 'status', label: t('team.members.columns.status') },
  { key: 'actions', label: t('team.members.columns.actions'), align: 'right' },
]);

const invitationColumns = computed(() => [
  { key: 'email', label: t('team.invitations.columns.email') },
  { key: 'role', label: t('team.invitations.columns.role') },
  { key: 'status', label: t('team.invitations.columns.status') },
  { key: 'expiresAt', label: t('team.invitations.columns.expires'), align: 'right' },
  { key: 'actions', label: t('team.invitations.columns.actions'), align: 'right' },
]);

const isOwner = computed(() => {
  const me = auth.user;
  const ownerRow = store.members.find((m) => m.isOwner);
  return Boolean(me && ownerRow && ownerRow.id === me.id);
});

const isAdmin = computed(() => auth.user?.role === 'client_admin');

const transferTargets = computed(() =>
  store.members
    .filter((m) => m.status === 'active' && !m.isOwner && m.id !== auth.user?.id)
    .map((m) => ({ value: m.id, label: `${m.name} (${m.email})` })),
);

const refresh = async () => {
  await Promise.all([store.fetchMembers(), store.fetchInvitations()]);
};

const submitInvite = async () => {
  inviteError.value = '';
  if (!inviteForm.value.email) {
    inviteError.value = t('team.invitations.errors.emailRequired');
    return;
  }
  try {
    showAcceptLink.value = false;
    const data = await store.createInvitation({
      email: inviteForm.value.email.trim().toLowerCase(),
      name: inviteForm.value.name?.trim() || undefined,
      role: inviteForm.value.role,
    });
    inviteForm.value = { email: '', name: '', role: 'client_member' };
    if (data?.acceptUrl) showAcceptLink.value = true;
  } catch (err) {
    inviteError.value = err?.message ?? t('team.invitations.errors.createFailed');
  }
};

const confirmAndCall = async (key, fn) => {
  if (typeof window !== 'undefined' && !window.confirm(t(`team.confirm.${key}`))) return;
  await fn();
};

const onRoleChange = async (row, role) => {
  if (role === row.role) return;
  await confirmAndCall('changeRole', () => store.updateMemberRole(row.id, role));
};

const onDisable = (row) =>
  confirmAndCall('disable', () => store.updateMemberStatus(row.id, 'inactive'));

const onReactivate = (row) =>
  confirmAndCall('reactivate', () => store.updateMemberStatus(row.id, 'active'));

const onRemove = (row) =>
  confirmAndCall('remove', () => store.removeMember(row.id));

const onRevokeInvitation = (row) =>
  confirmAndCall('revokeInvitation', () => store.revokeInvitation(row.id));

const onResendInvitation = (row) =>
  confirmAndCall('resendInvitation', () => store.resendInvitation(row.id));

const onTransfer = async () => {
  if (!transferTarget.value) return;
  if (
    typeof window !== 'undefined' &&
    !window.confirm(t('team.confirm.transferOwnership'))
  ) {
    return;
  }
  await store.transferOwnership(transferTarget.value);
  transferTarget.value = '';
};

const statusVariant = (status) => {
  if (status === 'active' || status === 'accepted') return 'success';
  if (status === 'pending') return 'warning';
  if (status === 'inactive' || status === 'revoked' || status === 'expired') return 'neutral';
  return 'neutral';
};

const formatDate = (value) => {
  if (!value) return '';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString();
};

const copyAcceptUrl = async () => {
  if (!store.lastInviteAcceptUrl || typeof navigator === 'undefined') return;
  try {
    await navigator.clipboard.writeText(store.lastInviteAcceptUrl);
  } catch {
    // Clipboard unavailable — surface a clear hint instead of failing silently.
    window.prompt(t('team.invitations.copyLink'), store.lastInviteAcceptUrl);
  }
};

onMounted(refresh);
</script>

<template>
  <section class="team-page">
    <header class="team-page__header">
      <div>
        <h2>{{ t('team.title') }}</h2>
        <p>{{ t('team.subtitle') }}</p>
      </div>
      <div v-if="store.limits.maxTeamMembers" class="team-page__limit">
        {{
          t('team.seatLimit', {
            total: store.memberPagination?.total ?? 0,
            max: store.limits.maxTeamMembers,
          })
        }}
      </div>
    </header>

    <AppAlert v-if="store.lastError" variant="error">{{ store.lastError }}</AppAlert>
    <AppAlert v-if="store.lastSuccess === 'invitation_created'" variant="success">
      {{ t('team.invitations.created') }}
    </AppAlert>
    <AppAlert v-if="store.lastSuccess === 'invitation_revoked'" variant="success">
      {{ t('team.invitations.revoked') }}
    </AppAlert>
    <AppAlert v-if="store.lastSuccess === 'invitation_resent'" variant="success">
      {{ t('team.invitations.resent') }}
    </AppAlert>
    <AppAlert v-if="store.lastSuccess === 'ownership_transferred'" variant="success">
      {{ t('team.ownership.transferred') }}
    </AppAlert>

    <AppCard v-if="isAdmin" padded>
      <template #title>{{ t('team.invitations.formTitle') }}</template>
      <form class="team-page__invite" @submit.prevent="submitInvite">
        <AppInput
          v-model="inviteForm.email"
          :label="t('team.invitations.emailField')"
          type="email"
          required
        />
        <AppInput
          v-model="inviteForm.name"
          :label="t('team.invitations.nameField')"
          :hint="t('team.invitations.nameHint')"
        />
        <AppSelect
          v-model="inviteForm.role"
          :label="t('team.invitations.roleField')"
          :options="roleOptions"
        />
        <div class="team-page__invite-actions">
          <AppButton type="submit" :loading="store.isMutating">
            {{ t('team.invitations.submit') }}
          </AppButton>
        </div>
        <AppAlert v-if="inviteError" variant="error">{{ inviteError }}</AppAlert>
        <AppAlert v-if="showAcceptLink && store.lastInviteAcceptUrl" variant="info">
          <div class="team-page__accept-link">
            <span>{{ t('team.invitations.acceptHint') }}</span>
            <code>{{ store.lastInviteAcceptUrl }}</code>
            <AppButton type="button" variant="ghost" size="sm" @click="copyAcceptUrl">
              {{ t('common.copy') }}
            </AppButton>
          </div>
        </AppAlert>
      </form>
    </AppCard>

    <AppCard padded>
      <template #title>{{ t('team.members.title') }}</template>
      <AppLoader v-if="store.isLoadingMembers && store.members.length === 0" />
      <AppTable
        v-else
        :columns="memberColumns"
        :rows="store.members"
        row-key="id"
        :empty="t('team.members.empty')"
      >
        <template #cell:role="{ row }">
          <template v-if="row.isOwner">
            <AppBadge variant="success">{{ t('team.members.owner') }}</AppBadge>
          </template>
          <template v-else-if="isAdmin && row.id !== auth.user?.id">
            <AppSelect
              :model-value="row.role"
              :options="roleOptions"
              size="sm"
              @update:model-value="(value) => onRoleChange(row, value)"
            />
          </template>
          <template v-else>
            {{ t(`team.roles.${row.role}`) }}
          </template>
        </template>
        <template #cell:status="{ row }">
          <AppBadge :variant="statusVariant(row.status)">{{ row.status }}</AppBadge>
        </template>
        <template #cell:actions="{ row }">
          <div class="team-page__row-actions">
            <template v-if="isAdmin && !row.isOwner && row.id !== auth.user?.id">
              <AppButton
                v-if="row.status === 'active'"
                variant="secondary"
                size="sm"
                @click="onDisable(row)"
              >
                {{ t('team.members.disable') }}
              </AppButton>
              <AppButton v-else variant="secondary" size="sm" @click="onReactivate(row)">
                {{ t('team.members.reactivate') }}
              </AppButton>
              <AppButton variant="danger" size="sm" @click="onRemove(row)">
                {{ t('team.members.remove') }}
              </AppButton>
            </template>
          </div>
        </template>
      </AppTable>
    </AppCard>

    <AppCard padded>
      <template #title>{{ t('team.invitations.title') }}</template>
      <AppLoader v-if="store.isLoadingInvitations && store.invitations.length === 0" />
      <AppTable
        v-else
        :columns="invitationColumns"
        :rows="store.invitations"
        row-key="id"
        :empty="t('team.invitations.empty')"
      >
        <template #cell:role="{ row }">{{ t(`team.roles.${row.role}`) }}</template>
        <template #cell:status="{ row }">
          <AppBadge :variant="statusVariant(row.status)">{{ row.status }}</AppBadge>
        </template>
        <template #cell:expiresAt="{ row }">{{ formatDate(row.expiresAt) }}</template>
        <template #cell:actions="{ row }">
          <div v-if="isAdmin && row.status === 'pending'" class="team-page__row-actions">
            <AppButton variant="ghost" size="sm" @click="onResendInvitation(row)">
              {{ t('team.invitations.resend') }}
            </AppButton>
            <AppButton variant="danger" size="sm" @click="onRevokeInvitation(row)">
              {{ t('team.invitations.revokeAction') }}
            </AppButton>
          </div>
        </template>
      </AppTable>
    </AppCard>

    <AppCard v-if="isOwner && transferTargets.length > 0" padded>
      <template #title>{{ t('team.ownership.title') }}</template>
      <p>{{ t('team.ownership.description') }}</p>
      <div class="team-page__transfer">
        <AppSelect
          v-model="transferTarget"
          :label="t('team.ownership.targetField')"
          :options="transferTargets"
        />
        <AppButton
          variant="danger"
          :disabled="!transferTarget"
          :loading="store.isMutating"
          @click="onTransfer"
        >
          {{ t('team.ownership.submit') }}
        </AppButton>
      </div>
    </AppCard>
  </section>
</template>

<style scoped>
.team-page {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}
.team-page__header {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: var(--space-3);
}
.team-page__header h2 {
  margin: 0 0 var(--space-1) 0;
}
.team-page__header p {
  margin: 0;
  color: var(--color-text-muted);
}
.team-page__limit {
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
}
.team-page__invite {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: var(--space-3);
  align-items: end;
}
.team-page__invite-actions {
  grid-column: 1 / -1;
  display: flex;
  justify-content: flex-end;
}
.team-page__accept-link {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  align-items: center;
}
.team-page__accept-link code {
  font-size: var(--font-size-sm);
  word-break: break-all;
}
.team-page__row-actions {
  display: flex;
  gap: var(--space-2);
  justify-content: flex-end;
}
.team-page__transfer {
  display: flex;
  gap: var(--space-3);
  align-items: end;
  flex-wrap: wrap;
}
@media (max-width: 720px) {
  .team-page__invite {
    grid-template-columns: 1fr;
  }
}
</style>
