import { isDisabledDeploymentRoute } from '../config/env.js';
import { useAuthStore } from '../stores/auth.store.js';

// Route-level guards. The router installs these as a single `beforeEach`
// hook from `router/index.js`. They inspect per-route meta fields:
//   - `requiresAuth: true`         → block anonymous users
//   - `requiresGuest: true`        → block authenticated users (e.g. /login)
//   - `roles: [...]`               → allow only listed roles
//   - `permissions: [...]`         → require every listed permission

const redirectToLogin = (to) => ({
  name: 'auth.login',
  query: to.fullPath && to.fullPath !== '/' ? { redirect: to.fullPath } : undefined,
});

export const authGuard = (to) => {
  const auth = useAuthStore();
  if (to.meta?.requiresAuth && !auth.isAuthenticated) {
    return redirectToLogin(to);
  }
  if (to.meta?.requiresGuest && auth.isAuthenticated) {
    return { name: 'dashboard.home' };
  }
  return true;
};

export const roleGuard = (to) => {
  const required = to.meta?.roles;
  if (!required || required.length === 0) return true;
  const auth = useAuthStore();
  if (!auth.isAuthenticated) return redirectToLogin(to);
  if (auth.isSuperAdmin) return true;
  return auth.hasRole(required) ? true : { name: 'forbidden' };
};

export const permissionGuard = (to) => {
  const required = to.meta?.permissions;
  if (!required || required.length === 0) return true;
  const auth = useAuthStore();
  if (!auth.isAuthenticated) return redirectToLogin(to);
  const missing = required.filter((permission) => !auth.hasPermission(permission));
  if (missing.length === 0) return true;
  return { name: 'forbidden' };
};

export const composeGuards = (guards) => (to, from) => {
  for (const guard of guards) {
    const result = guard(to, from);
    if (result !== true && result !== undefined) return result;
  }
  return true;
};

export const deploymentGuard = (to) =>
  isDisabledDeploymentRoute(to.name) ? { name: 'forbidden' } : true;

export const navigationGuard = composeGuards([
  authGuard,
  roleGuard,
  permissionGuard,
  deploymentGuard,
]);
