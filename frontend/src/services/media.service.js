import { apiClient } from './apiClient.js';

const unwrap = (response) => response?.data ?? null;

const buildHeaders = (tenantId) =>
  tenantId
    ? {
        'x-impersonate-tenant': tenantId,
      }
    : undefined;

export const mediaService = Object.freeze({
  uploadImage: ({ file, purpose = 'general', tenantId } = {}) => {
    const formData = new FormData();
    formData.append('image', file);
    formData.append('purpose', purpose);
    return apiClient
      .post('/media/images', formData, { headers: buildHeaders(tenantId) })
      .then(unwrap);
  },

  listImages: (query) => apiClient.get('/media/images', { query }).then(unwrap),

  getImage: (id) => apiClient.get(`/media/images/${id}`).then(unwrap),

  getImageUrl: (id) => apiClient.get(`/media/images/${id}/url`).then(unwrap),

  deleteImage: (id) => apiClient.delete(`/media/images/${id}`).then(unwrap),
});
