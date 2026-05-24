export const ROLES = Object.freeze({
  SUPER_ADMIN: 'super_admin',
  CLIENT_ADMIN: 'client_admin',
  CLIENT_MEMBER: 'client_member',
  SURVEYOR: 'surveyor',
});

export const ROLE_VALUES = Object.freeze(Object.values(ROLES));

// Roles that can be assigned to tenant members. Super admin is intentionally
// excluded so client admins cannot escalate a teammate to platform admin.
export const TENANT_INVITABLE_ROLES = Object.freeze([
  ROLES.CLIENT_ADMIN,
  ROLES.CLIENT_MEMBER,
  ROLES.SURVEYOR,
]);

export const PERMISSIONS = Object.freeze({
  USERS_MANAGE: 'users.manage',
  TENANTS_MANAGE: 'tenants.manage',
  SURVEYS_CREATE: 'surveys.create',
  SURVEYS_UPDATE: 'surveys.update',
  SURVEYS_PUBLISH: 'surveys.publish',
  SURVEYS_DELETE: 'surveys.delete',
  SURVEYS_VIEW: 'surveys.view',
  RESPONSES_VIEW: 'responses.view',
  RESPONSES_SUBMIT_VERIFIED: 'responses.submit_verified',
  SURVEYOR_RESPONSES_SUBMIT: 'surveyor.responses.submit',
  SURVEYOR_ACTIVITY_VIEW: 'surveyor.activity.view',
  CONTACTS_MANAGE: 'contacts.manage',
  GROUPS_MANAGE: 'groups.manage',
  CAMPAIGNS_SEND: 'campaigns.send',
  BILLING_VIEW: 'billing.view',
  TEMPLATES_MANAGE: 'templates.manage',
  DASHBOARD_VIEW: 'dashboard.view',
  ADMIN_DASHBOARD_VIEW: 'admin.dashboard.view',
});

export const PERMISSION_VALUES = Object.freeze(Object.values(PERMISSIONS));

const SUPER_ADMIN_PERMISSIONS = Object.freeze(Object.values(PERMISSIONS));

const CLIENT_ADMIN_PERMISSIONS = Object.freeze([
  PERMISSIONS.USERS_MANAGE,
  PERMISSIONS.SURVEYS_CREATE,
  PERMISSIONS.SURVEYS_UPDATE,
  PERMISSIONS.SURVEYS_PUBLISH,
  PERMISSIONS.SURVEYS_DELETE,
  PERMISSIONS.SURVEYS_VIEW,
  PERMISSIONS.RESPONSES_VIEW,
  PERMISSIONS.SURVEYOR_ACTIVITY_VIEW,
  PERMISSIONS.CONTACTS_MANAGE,
  PERMISSIONS.GROUPS_MANAGE,
  PERMISSIONS.CAMPAIGNS_SEND,
  PERMISSIONS.BILLING_VIEW,
  PERMISSIONS.TEMPLATES_MANAGE,
  PERMISSIONS.DASHBOARD_VIEW,
]);

const CLIENT_MEMBER_PERMISSIONS = Object.freeze([
  PERMISSIONS.SURVEYS_CREATE,
  PERMISSIONS.SURVEYS_UPDATE,
  PERMISSIONS.SURVEYS_VIEW,
  PERMISSIONS.RESPONSES_VIEW,
  PERMISSIONS.CONTACTS_MANAGE,
  PERMISSIONS.GROUPS_MANAGE,
  PERMISSIONS.DASHBOARD_VIEW,
]);

// Surveyors are tenant-scoped verified responders. They can submit responses
// through the surveyor flow and view surveys they're allowed to fill, but they
// don't manage tenant data themselves.
const SURVEYOR_PERMISSIONS = Object.freeze([
  PERMISSIONS.RESPONSES_SUBMIT_VERIFIED,
  PERMISSIONS.SURVEYOR_RESPONSES_SUBMIT,
]);

export const ROLE_PERMISSIONS = Object.freeze({
  [ROLES.SUPER_ADMIN]: SUPER_ADMIN_PERMISSIONS,
  [ROLES.CLIENT_ADMIN]: CLIENT_ADMIN_PERMISSIONS,
  [ROLES.CLIENT_MEMBER]: CLIENT_MEMBER_PERMISSIONS,
  [ROLES.SURVEYOR]: SURVEYOR_PERMISSIONS,
});

export const isSuperAdmin = (role) => role === ROLES.SUPER_ADMIN;

export const getPermissionsForRole = (role) => ROLE_PERMISSIONS[role] ?? [];

export const roleHasPermission = (role, permission) =>
  getPermissionsForRole(role).includes(permission);
