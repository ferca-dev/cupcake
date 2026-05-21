import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

import { useAuthStore, __testing as authTesting } from '../stores/auth.store.js';
import { setAuthProvider, setRefreshHandler } from '../services/apiClient.js';

const buildJsonResponse = (body, init = {}) =>
  new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
  });

const fakeUser = {
  id: 'user-1',
  email: 'demo@cupcake.local',
  name: 'Demo User',
  role: 'client_admin',
};

const fakeTenant = { id: 'tenant-1', name: 'Demo Tenant', slug: 'demo' };

describe('auth store', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    setAuthProvider(null);
    setRefreshHandler(null);
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  it('starts unauthenticated and exposes guard-friendly defaults', () => {
    const auth = useAuthStore();
    expect(auth.isAuthenticated).toBe(false);
    expect(auth.role).toBeNull();
    expect(auth.hasRole(['client_admin'])).toBe(false);
    expect(auth.hasPermission('surveys.view')).toBe(false);
  });

  it('persists tokens after login and exposes role/permissions', async () => {
    const auth = useAuthStore();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url) => {
        if (url.toString().endsWith('/auth/login')) {
          return buildJsonResponse({
            success: true,
            data: {
              user: fakeUser,
              tenant: fakeTenant,
              accessToken: 'access-1',
              refreshToken: 'refresh-1',
              permissions: ['surveys.view'],
            },
          });
        }
        throw new Error(`Unexpected fetch ${url}`);
      }),
    );

    auth.bindHttpClient();
    await auth.login({ email: 'demo@cupcake.local', password: 'ChangeMe123!' });

    expect(auth.isAuthenticated).toBe(true);
    expect(auth.accessToken).toBe('access-1');
    expect(auth.refreshToken).toBe('refresh-1');
    expect(auth.hasPermission('surveys.view')).toBe(true);

    const persisted = JSON.parse(window.localStorage.getItem(authTesting.STORAGE_KEY));
    expect(persisted).toMatchObject({ accessToken: 'access-1', refreshToken: 'refresh-1' });
  });

  it('clears the session on logout', async () => {
    const auth = useAuthStore();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => buildJsonResponse({ success: true, data: null })),
    );
    auth.bindHttpClient();
    auth.setSession({
      user: fakeUser,
      tenant: fakeTenant,
      accessToken: 'a',
      refreshToken: 'b',
      permissions: ['surveys.view'],
    });

    await auth.logout();
    expect(auth.isAuthenticated).toBe(false);
    expect(auth.accessToken).toBeNull();
    expect(window.localStorage.getItem(authTesting.STORAGE_KEY)).toBeNull();
  });

  it('refreshes the access token transparently on a 401', async () => {
    const auth = useAuthStore();
    const fetchMock = vi.fn(async (url) => {
      const path = url.toString();
      if (path.endsWith('/auth/me') && fetchMock.mock.calls.length === 1) {
        return buildJsonResponse(
          {
            success: false,
            error: { code: 'AUTHENTICATION_ERROR', message: 'Token expired' },
          },
          { status: 401 },
        );
      }
      if (path.endsWith('/auth/refresh')) {
        return buildJsonResponse({
          success: true,
          data: {
            user: fakeUser,
            tenant: fakeTenant,
            accessToken: 'access-2',
            refreshToken: 'refresh-2',
            permissions: ['surveys.view'],
          },
        });
      }
      if (path.endsWith('/auth/me')) {
        return buildJsonResponse({
          success: true,
          data: {
            user: fakeUser,
            tenant: fakeTenant,
            permissions: ['surveys.view'],
            isSuperAdmin: false,
          },
        });
      }
      throw new Error(`Unexpected fetch ${path}`);
    });

    vi.stubGlobal('fetch', fetchMock);

    auth.setSession({
      user: fakeUser,
      tenant: fakeTenant,
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
      permissions: ['surveys.view'],
    });
    auth.bindHttpClient();

    const result = await auth.fetchCurrentUser();
    expect(result.user.email).toBe('demo@cupcake.local');
    expect(auth.accessToken).toBe('access-2');
    expect(auth.refreshToken).toBe('refresh-2');
  });

  it('clears the session when refresh fails', async () => {
    const auth = useAuthStore();
    auth.setSession({
      user: fakeUser,
      tenant: fakeTenant,
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
      permissions: [],
    });

    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        buildJsonResponse(
          { success: false, error: { code: 'AUTHENTICATION_ERROR', message: 'invalid' } },
          { status: 401 },
        ),
      ),
    );

    const ok = await auth.refreshSession();
    expect(ok).toBe(false);
    expect(auth.isAuthenticated).toBe(false);
    expect(window.localStorage.getItem(authTesting.STORAGE_KEY)).toBeNull();
  });
});
