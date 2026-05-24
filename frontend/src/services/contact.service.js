import { apiClient } from './apiClient.js';

// Thin wrappers around the backend `/contacts` and `/contact-groups`
// endpoints. Each helper unwraps the API success envelope so call sites
// consume plain objects. Errors propagate as `ApiError` instances from the
// shared client.

const unwrap = (response) => response?.data ?? null;

export const contactService = Object.freeze({
  list: (query) => apiClient.get('/contacts', { query }).then(unwrap),

  get: (id) => apiClient.get(`/contacts/${id}`).then(unwrap),

  create: (payload) => apiClient.post('/contacts', payload).then(unwrap),

  update: (id, payload) => apiClient.put(`/contacts/${id}`, payload).then(unwrap),

  updateConsent: (id, payload) => apiClient.patch(`/contacts/${id}/consent`, payload).then(unwrap),

  remove: (id, { hard = false } = {}) =>
    apiClient.delete(`/contacts/${id}`, { query: { hard } }).then(unwrap),

  createImport: (file) => {
    const formData = new FormData();
    formData.append('file', file);
    return apiClient.post('/contacts/imports', formData).then(unwrap);
  },

  getImport: (id) => apiClient.get(`/contacts/imports/${id}`).then(unwrap),

  previewImport: (id) => apiClient.post(`/contacts/imports/${id}/preview`, {}).then(unwrap),

  updateImportMapping: (id, payload) =>
    apiClient.put(`/contacts/imports/${id}/mapping`, payload).then(unwrap),

  confirmImport: (id) => apiClient.post(`/contacts/imports/${id}/confirm`, {}).then(unwrap),

  downloadImportErrors: (id) => apiClient.download(`/contacts/imports/${id}/errors`),

  exportContacts: (query) => apiClient.download('/contacts/export', { query }),
});

export const contactGroupService = Object.freeze({
  list: (query) => apiClient.get('/contact-groups', { query }).then(unwrap),

  get: (id) => apiClient.get(`/contact-groups/${id}`).then(unwrap),

  create: (payload) => apiClient.post('/contact-groups', payload).then(unwrap),

  update: (id, payload) => apiClient.put(`/contact-groups/${id}`, payload).then(unwrap),

  remove: (id) => apiClient.delete(`/contact-groups/${id}`).then(unwrap),

  addContact: (id, contactId) =>
    apiClient.post(`/contact-groups/${id}/contacts`, { contactId }).then(unwrap),

  removeContact: (id, contactId) =>
    apiClient.delete(`/contact-groups/${id}/contacts/${contactId}`).then(unwrap),
});
