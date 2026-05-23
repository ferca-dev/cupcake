import { defineStore } from 'pinia';

import { teamService } from '../services/team.service.js';

/**
 * Holds the workspace team management state: tenant members, pending
 * invitations, and the in-flight async flags consumed by the team view.
 * Mutations re-fetch the affected list so the UI sees the latest state.
 */
export const useTeamStore = defineStore('team', {
  state: () => ({
    members: [],
    memberPagination: null,
    limits: { maxTeamMembers: null },
    invitations: [],
    invitationPagination: null,
    isLoadingMembers: false,
    isLoadingInvitations: false,
    isMutating: false,
    lastError: null,
    lastSuccess: null,
    lastInviteAcceptUrl: null,
  }),

  getters: {
    activeMembers: (state) => state.members.filter((m) => m.status === 'active'),
    pendingInvitations: (state) => state.invitations.filter((i) => i.status === 'pending'),
  },

  actions: {
    resetMessages() {
      this.lastError = null;
      this.lastSuccess = null;
    },

    async fetchMembers(query = {}) {
      this.isLoadingMembers = true;
      this.resetMessages();
      try {
        const data = await teamService.listMembers(query);
        this.members = data?.items ?? [];
        this.memberPagination = data?.pagination ?? null;
        this.limits = data?.limits ?? { maxTeamMembers: null };
        return data;
      } catch (err) {
        this.lastError = err?.message ?? 'Unable to load team members';
        throw err;
      } finally {
        this.isLoadingMembers = false;
      }
    },

    async fetchInvitations(query = {}) {
      this.isLoadingInvitations = true;
      this.resetMessages();
      try {
        const data = await teamService.listInvitations(query);
        this.invitations = data?.items ?? [];
        this.invitationPagination = data?.pagination ?? null;
        return data;
      } catch (err) {
        this.lastError = err?.message ?? 'Unable to load invitations';
        throw err;
      } finally {
        this.isLoadingInvitations = false;
      }
    },

    async createInvitation(payload) {
      this.isMutating = true;
      this.resetMessages();
      try {
        const data = await teamService.createInvitation(payload);
        this.lastSuccess = 'invitation_created';
        this.lastInviteAcceptUrl = data?.acceptUrl ?? null;
        await this.fetchInvitations();
        return data;
      } catch (err) {
        this.lastError = err?.message ?? 'Unable to send invitation';
        throw err;
      } finally {
        this.isMutating = false;
      }
    },

    async revokeInvitation(id) {
      this.isMutating = true;
      this.resetMessages();
      try {
        const data = await teamService.revokeInvitation(id);
        this.lastSuccess = 'invitation_revoked';
        await this.fetchInvitations();
        return data;
      } catch (err) {
        this.lastError = err?.message ?? 'Unable to revoke invitation';
        throw err;
      } finally {
        this.isMutating = false;
      }
    },

    async resendInvitation(id) {
      this.isMutating = true;
      this.resetMessages();
      try {
        const data = await teamService.resendInvitation(id);
        this.lastSuccess = 'invitation_resent';
        this.lastInviteAcceptUrl = data?.acceptUrl ?? null;
        await this.fetchInvitations();
        return data;
      } catch (err) {
        this.lastError = err?.message ?? 'Unable to resend invitation';
        throw err;
      } finally {
        this.isMutating = false;
      }
    },

    async updateMemberRole(id, role) {
      this.isMutating = true;
      this.resetMessages();
      try {
        const data = await teamService.updateMemberRole(id, { role });
        this.lastSuccess = 'role_updated';
        await this.fetchMembers();
        return data;
      } catch (err) {
        this.lastError = err?.message ?? 'Unable to update role';
        throw err;
      } finally {
        this.isMutating = false;
      }
    },

    async updateMemberStatus(id, status, reason) {
      this.isMutating = true;
      this.resetMessages();
      try {
        const data = await teamService.updateMemberStatus(id, { status, reason });
        this.lastSuccess = 'status_updated';
        await this.fetchMembers();
        return data;
      } catch (err) {
        this.lastError = err?.message ?? 'Unable to update status';
        throw err;
      } finally {
        this.isMutating = false;
      }
    },

    async removeMember(id) {
      this.isMutating = true;
      this.resetMessages();
      try {
        const data = await teamService.removeMember(id);
        this.lastSuccess = 'member_removed';
        await this.fetchMembers();
        return data;
      } catch (err) {
        this.lastError = err?.message ?? 'Unable to remove member';
        throw err;
      } finally {
        this.isMutating = false;
      }
    },

    async transferOwnership(targetUserId) {
      this.isMutating = true;
      this.resetMessages();
      try {
        const data = await teamService.transferOwnership({ targetUserId, confirm: true });
        this.lastSuccess = 'ownership_transferred';
        await this.fetchMembers();
        return data;
      } catch (err) {
        this.lastError = err?.message ?? 'Unable to transfer ownership';
        throw err;
      } finally {
        this.isMutating = false;
      }
    },
  },
});
