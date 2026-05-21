import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

import { authGuard, permissionGuard, roleGuard } from '../router/guards.js';
import { useAuthStore } from '../stores/auth.store.js';

const buildRoute = (overrides = {}) => ({
  name: 'target',
  fullPath: '/app',
  meta: {},
  ...overrides,
});

describe('navigation guards', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('redirects anonymous users from auth-required routes', () => {
    const route = buildRoute({ meta: { requiresAuth: true }, fullPath: '/app/surveys' });
    const result = authGuard(route);
    expect(result).toMatchObject({
      name: 'auth.login',
      query: { redirect: '/app/surveys' },
    });
  });

  it('blocks authenticated users from guest-only routes', () => {
    const auth = useAuthStore();
    auth.setSession({
      user: { id: '1', role: 'client_admin', name: 'Demo' },
      tenant: { id: 't1', name: 'Demo' },
      accessToken: 'a',
      refreshToken: 'b',
      permissions: ['surveys.view'],
    });
    const result = authGuard(buildRoute({ meta: { requiresGuest: true } }));
    expect(result).toMatchObject({ name: 'dashboard.home' });
  });

  it('lets matching roles through', () => {
    const auth = useAuthStore();
    auth.setSession({
      user: { id: '1', role: 'client_admin', name: 'Demo' },
      tenant: null,
      accessToken: 'a',
      refreshToken: 'b',
      permissions: [],
    });
    const result = roleGuard(buildRoute({ meta: { roles: ['client_admin', 'super_admin'] } }));
    expect(result).toBe(true);
  });

  it('routes to /forbidden when the role does not match', () => {
    const auth = useAuthStore();
    auth.setSession({
      user: { id: '1', role: 'client_member', name: 'Demo' },
      tenant: null,
      accessToken: 'a',
      refreshToken: 'b',
      permissions: [],
    });
    const result = roleGuard(buildRoute({ meta: { roles: ['super_admin'] } }));
    expect(result).toMatchObject({ name: 'forbidden' });
  });

  it('checks required permissions individually', () => {
    const auth = useAuthStore();
    auth.setSession({
      user: { id: '1', role: 'client_admin', name: 'Demo' },
      tenant: null,
      accessToken: 'a',
      refreshToken: 'b',
      permissions: ['surveys.view'],
    });
    expect(permissionGuard(buildRoute({ meta: { permissions: ['surveys.view'] } }))).toBe(true);
    expect(permissionGuard(buildRoute({ meta: { permissions: ['users.manage'] } }))).toMatchObject({
      name: 'forbidden',
    });
  });

  it('treats super admin as having every permission and role', () => {
    const auth = useAuthStore();
    auth.setSession({
      user: { id: '1', role: 'super_admin', name: 'Root' },
      tenant: null,
      accessToken: 'a',
      refreshToken: 'b',
      permissions: [],
      isSuperAdmin: true,
    });
    expect(roleGuard(buildRoute({ meta: { roles: ['client_admin'] } }))).toBe(true);
    expect(permissionGuard(buildRoute({ meta: { permissions: ['users.manage'] } }))).toBe(true);
  });
});
