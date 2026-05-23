import { apiClient } from './apiClient.js';

// Wrapper around the backend `/team/*` endpoints used by the workspace team
// management page. The accept endpoint is the only one that does not require
// authentication — the invitation token is the credential.

const unwrap = (response) => response?.data ?? null;

export const teamService = Object.freeze({
  listMembers: (query) => apiClient.get('/team/members', { query }).then(unwrap),

  getMember: (id) => apiClient.get(`/team/members/${id}`).then(unwrap),

  updateMemberRole: (id, payload) =>
    apiClient.patch(`/team/members/${id}/role`, payload).then(unwrap),

  updateMemberStatus: (id, payload) =>
    apiClient.patch(`/team/members/${id}/status`, payload).then(unwrap),

  removeMember: (id) => apiClient.delete(`/team/members/${id}`).then(unwrap),

  listInvitations: (query) => apiClient.get('/team/invitations', { query }).then(unwrap),

  createInvitation: (payload) => apiClient.post('/team/invitations', payload).then(unwrap),

  resendInvitation: (id) =>
    apiClient.post(`/team/invitations/${id}/resend`, {}).then(unwrap),

  revokeInvitation: (id) =>
    apiClient.post(`/team/invitations/${id}/revoke`, {}).then(unwrap),

  acceptInvitation: (payload) =>
    apiClient.post('/team/invitations/accept', payload, { skipAuth: true }).then(unwrap),

  transferOwnership: (payload) =>
    apiClient.post('/team/owner-transfer', payload).then(unwrap),
});
