import { API_BASE_URL } from '../config/env.js';

// Centralised HTTP client. Built on `fetch` to avoid an extra runtime
// dependency and to keep cold-start cost low. Every request goes through
// `request()` so:
//   - the API base URL is applied once
//   - the bearer token is injected when an auth provider is registered
//   - non-2xx responses are normalised into the shared error envelope
//   - 401 responses trigger a single-flight refresh and one transparent retry
//
// The auth store registers a provider with `setAuthProvider()` during
// bootstrap so the client never imports the store directly (which would
// introduce a circular dependency).

const JSON_CONTENT_TYPE = 'application/json';

let authProvider = null;
let refreshHandler = null;
let refreshInFlight = null;

export const setAuthProvider = (provider) => {
  authProvider = provider;
};

export const setRefreshHandler = (handler) => {
  refreshHandler = handler;
};

export class ApiError extends Error {
  constructor({ status, code, message, details, isNetwork = false }) {
    super(message || 'Request failed');
    this.name = 'ApiError';
    this.status = status ?? 0;
    this.code = code || 'INTERNAL_ERROR';
    this.details = Array.isArray(details) ? details : [];
    this.isNetwork = isNetwork;
  }

  get isValidation() {
    return this.code === 'VALIDATION_ERROR' || this.status === 422;
  }

  get isAuth() {
    return this.code === 'AUTHENTICATION_ERROR' || this.status === 401;
  }

  get isForbidden() {
    return this.code === 'AUTHORIZATION_ERROR' || this.status === 403;
  }

  get isRateLimited() {
    return this.code === 'RATE_LIMITED' || this.status === 429;
  }
}

const buildUrl = (path, query) => {
  const isAbsolute = /^https?:\/\//i.test(path);
  const base = isAbsolute ? path : `${API_BASE_URL}${path.startsWith('/') ? '' : '/'}${path}`;
  if (!query) return base;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) {
      for (const entry of value) params.append(key, String(entry));
    } else {
      params.append(key, String(value));
    }
  }
  const qs = params.toString();
  return qs ? `${base}${base.includes('?') ? '&' : '?'}${qs}` : base;
};

const isJsonBody = (body) =>
  body && typeof body === 'object' && !(body instanceof FormData) && !(body instanceof Blob);

const parseResponse = async (response) => {
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    try {
      return await response.json();
    } catch {
      return null;
    }
  }
  if (response.status === 204) return null;
  try {
    const text = await response.text();
    return text ? { raw: text } : null;
  } catch {
    return null;
  }
};

const ensureRefresh = async () => {
  if (!refreshHandler) return false;
  if (!refreshInFlight) {
    refreshInFlight = Promise.resolve()
      .then(() => refreshHandler())
      .finally(() => {
        refreshInFlight = null;
      });
  }
  try {
    return await refreshInFlight;
  } catch {
    return false;
  }
};

const performRequest = async (method, path, options = {}) => {
  const { body, query, headers = {}, skipAuth = false, signal, _retry = false } = options;

  const finalHeaders = new Headers();
  for (const [key, value] of Object.entries(headers)) {
    if (value !== undefined && value !== null) finalHeaders.set(key, String(value));
  }

  let payload;
  if (body !== undefined && body !== null) {
    if (isJsonBody(body)) {
      if (!finalHeaders.has('content-type')) finalHeaders.set('content-type', JSON_CONTENT_TYPE);
      payload = JSON.stringify(body);
    } else {
      payload = body;
    }
  }

  if (!skipAuth && authProvider) {
    const token = authProvider.getAccessToken?.();
    if (token) finalHeaders.set('authorization', `Bearer ${token}`);
  }

  if (!finalHeaders.has('accept')) finalHeaders.set('accept', JSON_CONTENT_TYPE);

  let response;
  try {
    response = await fetch(buildUrl(path, query), {
      method,
      headers: finalHeaders,
      body: payload,
      signal,
    });
  } catch (err) {
    if (err?.name === 'AbortError') throw err;
    throw new ApiError({
      status: 0,
      code: 'NETWORK_ERROR',
      message: 'Network error',
      isNetwork: true,
    });
  }

  if (response.status === 401 && !skipAuth && !_retry && refreshHandler) {
    const refreshed = await ensureRefresh();
    if (refreshed) {
      return performRequest(method, path, { ...options, _retry: true });
    }
    authProvider?.onUnauthorized?.();
  }

  const parsed = await parseResponse(response);

  if (!response.ok) {
    const errorBody = parsed && typeof parsed === 'object' ? parsed.error || {} : {};
    throw new ApiError({
      status: response.status,
      code: errorBody.code,
      message: errorBody.message || response.statusText || 'Request failed',
      details: errorBody.details || [],
    });
  }

  return parsed;
};

export const apiClient = Object.freeze({
  get: (path, options) => performRequest('GET', path, options),
  post: (path, body, options = {}) => performRequest('POST', path, { ...options, body }),
  put: (path, body, options = {}) => performRequest('PUT', path, { ...options, body }),
  patch: (path, body, options = {}) => performRequest('PATCH', path, { ...options, body }),
  delete: (path, options) => performRequest('DELETE', path, options),
});
