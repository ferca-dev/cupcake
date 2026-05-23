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

  requestImport: (payload) => apiClient.post('/contacts/import', payload ?? {}).then(unwrap),

  getImportReport: (id) => apiClient.get(`/contacts/imports/${id}/report`).then(unwrap),
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
