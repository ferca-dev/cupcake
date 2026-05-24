import { PERMISSIONS } from '../../common/auth/index.js';

/**
 * Scopes are the public, narrow surface API keys can grant. Internal
 * permissions are tied to roles and may grow without breaking integrations;
 * scopes are part of the integration contract and stay stable.
 *
 * Every scope must map to one or more existing permissions so the same
 * authorization checks gate both interactive users and API clients.
 *
 * API keys MUST NOT be able to escalate to super admin operations
 * (`USERS_MANAGE`, `TENANTS_MANAGE`, `ADMIN_DASHBOARD_VIEW`). Those
 * permissions are intentionally absent from every scope.
 */
export const API_SCOPES = Object.freeze({
  SURVEYS_READ: 'surveys:read',
  SURVEYS_WRITE: 'surveys:write',
  RESPONSES_READ: 'responses:read',
  CONTACTS_READ: 'contacts:read',
  CONTACTS_WRITE: 'contacts:write',
  CAMPAIGNS_READ: 'campaigns:read',
  CAMPAIGNS_SEND: 'campaigns:send',
  REPORTS_READ: 'reports:read',
});

export const API_SCOPE_VALUES = Object.freeze(Object.values(API_SCOPES));

/**
 * Mapping from scope → set of internal permissions. The auth middleware uses
 * this to populate `req.user.permissions` for API-key requests so existing
 * `requirePermission(...)` guards work unchanged.
 */
export const SCOPE_PERMISSIONS = Object.freeze({
  [API_SCOPES.SURVEYS_READ]: [PERMISSIONS.SURVEYS_VIEW],
  [API_SCOPES.SURVEYS_WRITE]: [
    PERMISSIONS.SURVEYS_VIEW,
    PERMISSIONS.SURVEYS_CREATE,
    PERMISSIONS.SURVEYS_UPDATE,
  ],
  [API_SCOPES.RESPONSES_READ]: [PERMISSIONS.RESPONSES_VIEW],
  [API_SCOPES.CONTACTS_READ]: [PERMISSIONS.CONTACTS_MANAGE, PERMISSIONS.GROUPS_MANAGE],
  [API_SCOPES.CONTACTS_WRITE]: [PERMISSIONS.CONTACTS_MANAGE, PERMISSIONS.GROUPS_MANAGE],
  [API_SCOPES.CAMPAIGNS_READ]: [PERMISSIONS.CAMPAIGNS_SEND],
  [API_SCOPES.CAMPAIGNS_SEND]: [PERMISSIONS.CAMPAIGNS_SEND],
  [API_SCOPES.REPORTS_READ]: [PERMISSIONS.DASHBOARD_VIEW, PERMISSIONS.RESPONSES_VIEW],
});

/**
 * Compute the union of internal permissions a list of scopes grants. Unknown
 * scopes are filtered out so a stale stored scope cannot grant more than it
 * names.
 */
export const resolvePermissionsForScopes = (scopes = []) => {
  const set = new Set();
  for (const scope of scopes) {
    const mapped = SCOPE_PERMISSIONS[scope];
    if (!mapped) continue;
    for (const permission of mapped) set.add(permission);
  }
  return [...set];
};

export const isValidScope = (scope) => API_SCOPE_VALUES.includes(scope);
