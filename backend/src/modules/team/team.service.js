import mongoose from 'mongoose';
import { randomBytes } from 'node:crypto';

import { User, USER_STATUS_VALUES } from '../users/user.model.js';
import { Tenant } from '../tenants/tenant.model.js';
import { RefreshToken } from '../auth/refresh-token.model.js';
import { TeamInvitation } from './team-invitation.model.js';
import { sendTeamNotification } from './team-notification.service.js';
import { recordAuditEvent } from '../audit/audit.service.js';
import { assertFeature, assertQuota } from '../plans/plan.service.js';
import { FEATURE_KEYS, QUOTA_KEYS } from '../plans/plan.constants.js';
import {
  ROLES,
  TENANT_INVITABLE_ROLES,
  hashTokenValue,
  hashPassword,
} from '../../common/auth/index.js';
import {
  AuthorizationError,
  ConflictError,
  NotFoundError,
  ValidationError,
} from '../../common/errors/index.js';
import { loadEnv } from '../../config/env.js';

const INVITATION_TTL_DAYS = 7;
const INVITATION_TOKEN_BYTES = 32;
const ENTITY_INVITATION = 'team_invitation';
const ENTITY_MEMBER = 'team_member';
const ENTITY_OWNERSHIP = 'tenant_ownership';

export const TEAM_AUDIT_ACTIONS = Object.freeze({
  INVITATION_CREATED: 'team.invitation.created',
  INVITATION_RESENT: 'team.invitation.resent',
  INVITATION_REVOKED: 'team.invitation.revoked',
  INVITATION_ACCEPTED: 'team.invitation.accepted',
  INVITATION_EXPIRED: 'team.invitation.expired',
  MEMBER_ROLE_CHANGED: 'team.member.role_changed',
  MEMBER_STATUS_CHANGED: 'team.member.status_changed',
  MEMBER_REMOVED: 'team.member.removed',
  SURVEYOR_CREATED: 'team.surveyor.created',
  OWNERSHIP_TRANSFERRED: 'tenant.ownership.transferred',
});

const ROLE_LABELS = {
  [ROLES.CLIENT_ADMIN]: 'workspace admin',
  [ROLES.CLIENT_MEMBER]: 'workspace member',
  [ROLES.SURVEYOR]: 'surveyor',
};

const assertObjectId = (value, label) => {
  if (!mongoose.isValidObjectId(value)) {
    throw new ValidationError(`Invalid ${label}`);
  }
};

const requireTenantId = (actor) => {
  if (!actor?.tenantId) {
    throw new AuthorizationError('Tenant context is required');
  }
  return actor.tenantId;
};

const requireTenantDoc = async (tenantId) => {
  const tenant = await Tenant.findById(tenantId);
  if (!tenant) throw new NotFoundError('Tenant not found');
  return tenant;
};

const audit = ({ action, actor, tenantId, entityType, entityId, metadata = {}, ip, userAgent }) =>
  recordAuditEvent({
    action,
    entityType,
    entityId: entityId ? entityId.toString() : null,
    userId: actor?.id ?? null,
    tenantId,
    ip: ip ?? null,
    userAgent: userAgent ?? null,
    metadata,
  });

const buildInvitationAcceptUrl = ({ token, env }) => {
  const base = env.FRONTEND_URL.replace(/\/$/, '');
  const params = new URLSearchParams({ token });
  return `${base}/auth/accept-invitation?${params.toString()}`;
};

const generateRawToken = () => randomBytes(INVITATION_TOKEN_BYTES).toString('base64url');

const toPublicMember = (user) => ({
  id: user._id.toString(),
  tenantId: user.tenantId ? user.tenantId.toString() : null,
  name: user.name,
  email: user.email,
  role: user.role,
  status: user.status,
  phone: user.phone ?? null,
  whatsappPhone: user.whatsappPhone ?? null,
  lastLoginAt: user.lastLoginAt ?? null,
  emailVerifiedAt: user.emailVerifiedAt ?? null,
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
});

const toPublicInvitation = (invitation) => ({
  id: invitation._id.toString(),
  tenantId: invitation.tenantId.toString(),
  email: invitation.email,
  name: invitation.name ?? null,
  role: invitation.role,
  status: invitation.status,
  expiresAt: invitation.expiresAt,
  invitedByUserId: invitation.invitedByUserId ? invitation.invitedByUserId.toString() : null,
  acceptedByUserId: invitation.acceptedByUserId ? invitation.acceptedByUserId.toString() : null,
  acceptedAt: invitation.acceptedAt ?? null,
  revokedByUserId: invitation.revokedByUserId ? invitation.revokedByUserId.toString() : null,
  revokedAt: invitation.revokedAt ?? null,
  lastSentAt: invitation.lastSentAt ?? null,
  resendCount: invitation.resendCount ?? 0,
  createdAt: invitation.createdAt,
  updatedAt: invitation.updatedAt,
});

/**
 * Count of accounts that consume a tenant seat. Pending invitations also
 * count so an admin cannot bypass the limit by inviting more people than the
 * cap allows even before they accept.
 */
const countTenantSeatsInUse = async (tenantId) => {
  const [activeMembers, pendingInvitations] = await Promise.all([
    User.countDocuments({
      tenantId,
      status: mongoose.trusted({ $ne: 'inactive' }),
    }),
    TeamInvitation.countDocuments({ tenantId, status: 'pending' }),
  ]);
  return {
    activeMembers,
    pendingInvitations,
    total: activeMembers + pendingInvitations,
  };
};

const assertSeatAvailable = async ({ tenant }) => {
  const limit = tenant.settings?.maxTeamMembers ?? null;
  if (!limit) return;
  const seats = await countTenantSeatsInUse(tenant._id);
  if (seats.total >= limit) {
    throw new ConflictError('Tenant seat limit reached', [
      { path: ['tenant'], message: `Maximum of ${limit} team members reached` },
    ]);
  }
};

const assertCanManageRole = ({ actor, targetRole }) => {
  if (!TENANT_INVITABLE_ROLES.includes(targetRole)) {
    throw new ValidationError('Role is not assignable to tenant members');
  }
  if (actor.role !== ROLES.CLIENT_ADMIN && actor.role !== ROLES.SUPER_ADMIN) {
    throw new AuthorizationError('Only workspace admins can manage team membership');
  }
};

const ensureMemberInSameTenant = ({ actor, member }) => {
  if (!member.tenantId || member.tenantId.toString() !== actor.tenantId) {
    throw new NotFoundError('Team member not found');
  }
};

const ensureNotSelf = ({ actor, member, message }) => {
  if (member._id.toString() === actor.id) {
    throw new ValidationError(message);
  }
};

/**
 * Ensures the tenant retains at least one *other* active admin/owner after the
 * proposed action. We reject demotions, removals, disable/delete actions, and
 * ownership reassignments that would otherwise leave the workspace stranded.
 */
const assertTenantKeepsAdmin = async ({ tenant, excludeUserId, scope = 'admin' }) => {
  const remainingAdmins = await User.countDocuments(buildAdminCountFilter(tenant, excludeUserId));
  if (remainingAdmins > 0) return;

  if (scope === 'owner') {
    throw new ConflictError(
      'Tenant must retain at least one active admin to transfer ownership to',
    );
  }
  throw new ConflictError('Tenant must retain at least one active admin');
};

const revokeRefreshTokensFor = async (userId) =>
  RefreshToken.updateMany({ userId, revokedAt: null }, { $set: { revokedAt: new Date() } });

const buildAdminCountFilter = (tenant, excludeUserId) => ({
  tenantId: tenant._id,
  status: 'active',
  role: ROLES.CLIENT_ADMIN,
  _id: mongoose.trusted({ $ne: excludeUserId }),
});

const buildMemberFilter = ({ tenantId, query }) => {
  const filter = { tenantId };
  if (query.role) filter.role = query.role;
  if (query.status) filter.status = query.status;
  if (query.search) {
    const escaped = query.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.$or = mongoose.trusted([
      { name: new RegExp(escaped, 'i') },
      { email: new RegExp(escaped, 'i') },
    ]);
  }
  return filter;
};

const sortToMongo = (sort = '-createdAt') => {
  const direction = sort.startsWith('-') ? -1 : 1;
  const key = sort.replace(/^-/, '');
  return { [key]: direction };
};

export const listMembers = async ({ actor, query }) => {
  const tenantId = requireTenantId(actor);
  const filter = buildMemberFilter({ tenantId, query });
  const skip = (query.page - 1) * query.limit;
  const sort = sortToMongo(query.sort);

  const [items, total] = await Promise.all([
    User.find(filter).sort(sort).skip(skip).limit(query.limit).lean({ getters: true }),
    User.countDocuments(filter),
  ]);

  const tenant = await Tenant.findById(tenantId).select('ownerUserId settings').lean();

  return {
    items: items.map((doc) => ({
      ...toPublicMember(doc),
      isOwner: tenant?.ownerUserId?.toString() === doc._id.toString(),
    })),
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: query.limit > 0 ? Math.ceil(total / query.limit) : 0,
    },
    limits: {
      maxTeamMembers: tenant?.settings?.maxTeamMembers ?? null,
    },
  };
};

export const listSurveyors = async ({ actor, query }) =>
  listMembers({ actor, query: { ...query, role: ROLES.SURVEYOR } });

export const createSurveyor = async ({ actor, payload, ip, userAgent }) => {
  const tenantId = requireTenantId(actor);
  assertCanManageRole({ actor, targetRole: ROLES.SURVEYOR });
  const tenant = await requireTenantDoc(tenantId);
  if (tenant.status !== 'active') {
    throw new ConflictError('Tenant is not active');
  }

  await assertFeature({ tenantId, feature: FEATURE_KEYS.TEAM_INVITATIONS });
  await assertQuota({ tenantId, quotaKey: QUOTA_KEYS.USERS });
  await assertSeatAvailable({ tenant });

  const email = payload.email.toLowerCase().trim();
  const existingUser = await User.findOne({ email });
  if (existingUser?.tenantId?.toString() === tenantId.toString()) {
    throw new ConflictError('User already belongs to this tenant');
  }
  if (
    existingUser &&
    existingUser.tenantId &&
    existingUser.tenantId.toString() !== tenantId.toString()
  ) {
    throw new ConflictError('Email already belongs to another tenant');
  }

  const user = await User.create({
    tenantId,
    role: ROLES.SURVEYOR,
    name: payload.name,
    email,
    passwordHash: await hashPassword(payload.password),
    status: 'active',
    emailVerifiedAt: new Date(),
  });

  await audit({
    action: TEAM_AUDIT_ACTIONS.SURVEYOR_CREATED,
    actor,
    tenantId,
    entityType: ENTITY_MEMBER,
    entityId: user._id,
    metadata: { email, role: ROLES.SURVEYOR },
    ip,
    userAgent,
  });

  return { surveyor: toPublicMember(user) };
};

export const getMember = async ({ actor, id }) => {
  const tenantId = requireTenantId(actor);
  assertObjectId(id, 'member id');
  const user = await User.findById(id);
  if (!user) throw new NotFoundError('Team member not found');
  ensureMemberInSameTenant({ actor, member: user });
  const tenant = await Tenant.findById(tenantId).select('ownerUserId').lean();
  return {
    ...toPublicMember(user),
    isOwner: tenant?.ownerUserId?.toString() === user._id.toString(),
  };
};

export const updateMemberRole = async ({ actor, id, payload, ip, userAgent }) => {
  const tenantId = requireTenantId(actor);
  assertObjectId(id, 'member id');
  assertCanManageRole({ actor, targetRole: payload.role });

  const user = await User.findById(id);
  if (!user) throw new NotFoundError('Team member not found');
  ensureMemberInSameTenant({ actor, member: user });
  ensureNotSelf({ actor, member: user, message: 'You cannot change your own role' });

  const tenant = await requireTenantDoc(tenantId);
  const isOwner = tenant.ownerUserId?.toString() === user._id.toString();
  if (isOwner) {
    throw new ConflictError('Transfer ownership before changing the owner role');
  }

  if (user.role === payload.role) {
    return { member: toPublicMember(user), changed: false };
  }

  const wasAdmin = user.role === ROLES.CLIENT_ADMIN;
  if (wasAdmin && payload.role !== ROLES.CLIENT_ADMIN) {
    await assertTenantKeepsAdmin({ tenant, excludeUserId: user._id });
  }

  const previousRole = user.role;
  user.role = payload.role;
  await user.save();
  const revoked = await revokeRefreshTokensFor(user._id);

  await audit({
    action: TEAM_AUDIT_ACTIONS.MEMBER_ROLE_CHANGED,
    actor,
    tenantId,
    entityType: ENTITY_MEMBER,
    entityId: user._id,
    metadata: {
      previousRole,
      nextRole: payload.role,
      revokedTokens: revoked.modifiedCount ?? 0,
    },
    ip,
    userAgent,
  });

  return {
    member: toPublicMember(user),
    changed: true,
    previousRole,
    revokedTokens: revoked.modifiedCount ?? 0,
  };
};

export const updateMemberStatus = async ({ actor, id, payload, ip, userAgent }) => {
  const tenantId = requireTenantId(actor);
  assertObjectId(id, 'member id');
  if (!USER_STATUS_VALUES.includes(payload.status)) {
    throw new ValidationError('Invalid status');
  }

  const user = await User.findById(id);
  if (!user) throw new NotFoundError('Team member not found');
  ensureMemberInSameTenant({ actor, member: user });
  ensureNotSelf({ actor, member: user, message: 'You cannot change your own status' });

  const tenant = await requireTenantDoc(tenantId);
  const isOwner = tenant.ownerUserId?.toString() === user._id.toString();
  if (isOwner && payload.status !== 'active') {
    throw new ConflictError('Transfer ownership before disabling the owner');
  }

  if (user.status === payload.status) {
    return { member: toPublicMember(user), changed: false };
  }

  // Disabling the last remaining active admin would lock the tenant out.
  if (user.role === ROLES.CLIENT_ADMIN && user.status === 'active' && payload.status !== 'active') {
    await assertTenantKeepsAdmin({ tenant, excludeUserId: user._id });
  }

  const previousStatus = user.status;
  user.status = payload.status;
  await user.save();

  let revokedTokens = 0;
  if (payload.status !== 'active') {
    const result = await revokeRefreshTokensFor(user._id);
    revokedTokens = result.modifiedCount ?? 0;
  }

  await audit({
    action: TEAM_AUDIT_ACTIONS.MEMBER_STATUS_CHANGED,
    actor,
    tenantId,
    entityType: ENTITY_MEMBER,
    entityId: user._id,
    metadata: {
      previousStatus,
      nextStatus: payload.status,
      reason: payload.reason ?? null,
      revokedTokens,
    },
    ip,
    userAgent,
  });

  const env = loadEnv();
  if (payload.status === 'active' && previousStatus !== 'active') {
    await sendTeamNotification({
      type: 'member_reactivated',
      to: user.email,
      data: {
        recipientName: user.name,
        tenantName: tenant.name,
      },
      env,
    });
  } else if (payload.status !== 'active' && previousStatus === 'active') {
    await sendTeamNotification({
      type: 'member_disabled',
      to: user.email,
      data: {
        recipientName: user.name,
        tenantName: tenant.name,
        statusLabel: payload.status === 'suspended' ? 'suspended' : 'disabled',
      },
      env,
    });
  }

  return {
    member: toPublicMember(user),
    changed: true,
    previousStatus,
    revokedTokens,
  };
};

export const removeMember = async ({ actor, id, ip, userAgent }) => {
  const tenantId = requireTenantId(actor);
  assertObjectId(id, 'member id');
  const user = await User.findById(id);
  if (!user) throw new NotFoundError('Team member not found');
  ensureMemberInSameTenant({ actor, member: user });
  ensureNotSelf({ actor, member: user, message: 'You cannot remove yourself' });

  const tenant = await requireTenantDoc(tenantId);
  const isOwner = tenant.ownerUserId?.toString() === user._id.toString();
  if (isOwner) {
    throw new ConflictError('Transfer ownership before removing the owner');
  }

  if (user.role === ROLES.CLIENT_ADMIN && user.status === 'active') {
    await assertTenantKeepsAdmin({ tenant, excludeUserId: user._id });
  }

  const snapshot = { name: user.name, email: user.email, role: user.role };
  await user.deleteOne();
  const revoked = await revokeRefreshTokensFor(user._id);

  await audit({
    action: TEAM_AUDIT_ACTIONS.MEMBER_REMOVED,
    actor,
    tenantId,
    entityType: ENTITY_MEMBER,
    entityId: user._id,
    metadata: {
      removedUser: snapshot,
      revokedTokens: revoked.modifiedCount ?? 0,
    },
    ip,
    userAgent,
  });

  const env = loadEnv();
  await sendTeamNotification({
    type: 'member_removed',
    to: snapshot.email,
    data: { recipientName: snapshot.name, tenantName: tenant.name },
    env,
  });

  return { removedUserId: user._id.toString() };
};

export const listInvitations = async ({ actor, query }) => {
  const tenantId = requireTenantId(actor);
  const filter = { tenantId };
  if (query.status) filter.status = query.status;
  if (query.role) filter.role = query.role;
  if (query.search) {
    const escaped = query.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.email = mongoose.trusted(new RegExp(escaped, 'i'));
  }

  const skip = (query.page - 1) * query.limit;
  const [items, total] = await Promise.all([
    TeamInvitation.find(filter).sort({ createdAt: -1 }).skip(skip).limit(query.limit),
    TeamInvitation.countDocuments(filter),
  ]);

  return {
    items: items.map((doc) => toPublicInvitation(doc)),
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: query.limit > 0 ? Math.ceil(total / query.limit) : 0,
    },
  };
};

/**
 * Lazy expiration sweep. Pending invitations whose `expiresAt` is in the past
 * are marked `expired` so subsequent reads (and the accept flow) treat them
 * consistently without needing a cron sweep. The action is audited so the
 * timeline survives even when no human triggered it.
 */
const expireStaleInvitationsForTenant = async ({ tenantId }) => {
  const now = new Date();
  const stale = await TeamInvitation.find({
    tenantId,
    status: 'pending',
    expiresAt: mongoose.trusted({ $lte: now }),
  });
  if (stale.length === 0) return [];
  await TeamInvitation.updateMany(
    { _id: mongoose.trusted({ $in: stale.map((s) => s._id) }) },
    { $set: { status: 'expired' } },
  );
  for (const doc of stale) {
    await audit({
      action: TEAM_AUDIT_ACTIONS.INVITATION_EXPIRED,
      actor: null,
      tenantId,
      entityType: ENTITY_INVITATION,
      entityId: doc._id,
      metadata: { email: doc.email, role: doc.role },
    });
  }
  return stale;
};

export const createInvitation = async ({ actor, payload, ip, userAgent }) => {
  const tenantId = requireTenantId(actor);
  assertCanManageRole({ actor, targetRole: payload.role });
  const tenant = await requireTenantDoc(tenantId);
  if (tenant.status !== 'active') {
    throw new ConflictError('Tenant is not active');
  }

  // Plan-level enforcement runs alongside the existing `maxTeamMembers`
  // setting on the tenant doc. The feature gate is the higher-level rule
  // ("can this tenant invite new users at all?") and the quota gates the
  // numeric seat budget; the seat check inside `assertSeatAvailable` still
  // runs so per-tenant overrides set by an admin still apply.
  await assertFeature({ tenantId, feature: FEATURE_KEYS.TEAM_INVITATIONS });
  await assertQuota({ tenantId, quotaKey: QUOTA_KEYS.USERS });

  const email = payload.email.toLowerCase().trim();

  await expireStaleInvitationsForTenant({ tenantId });

  // Reject invitations addressed to existing tenant members. We allow
  // inviting an email that exists outside this tenant so cross-tenant invites
  // remain legal (the accept flow validates email ownership).
  const existingUser = await User.findOne({ email });
  if (existingUser?.tenantId?.toString() === tenantId.toString()) {
    throw new ConflictError('User already belongs to this tenant');
  }
  if (
    existingUser &&
    existingUser.tenantId &&
    existingUser.tenantId.toString() !== tenantId.toString()
  ) {
    // A user can only belong to one tenant. We surface a 409 instead of
    // silently accepting an invitation that could never resolve.
    throw new ConflictError('Email already belongs to another tenant');
  }
  const existingPendingInvitation = await TeamInvitation.findOne({
    tenantId,
    email,
    status: 'pending',
  });
  if (existingPendingInvitation) {
    throw new ConflictError('An invitation for this email is already pending');
  }

  await assertSeatAvailable({ tenant });

  const rawToken = generateRawToken();
  const tokenHash = hashTokenValue(rawToken);
  const expiresAt = new Date(Date.now() + INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000);

  let invitation;
  try {
    invitation = await TeamInvitation.create({
      tenantId,
      email,
      name: payload.name ?? null,
      role: payload.role,
      tokenHash,
      status: 'pending',
      expiresAt,
      invitedByUserId: actor.id,
      lastSentAt: new Date(),
      resendCount: 0,
    });
  } catch (err) {
    if (err?.code === 11000) {
      throw new ConflictError('An invitation for this email is already pending');
    }
    throw err;
  }

  await audit({
    action: TEAM_AUDIT_ACTIONS.INVITATION_CREATED,
    actor,
    tenantId,
    entityType: ENTITY_INVITATION,
    entityId: invitation._id,
    metadata: { email, role: payload.role },
    ip,
    userAgent,
  });

  const env = loadEnv();
  const inviter = await User.findById(actor.id).select('name email').lean();
  const acceptUrl = buildInvitationAcceptUrl({ token: rawToken, env });
  await sendTeamNotification({
    type: 'invitation_sent',
    to: email,
    data: {
      recipientName: payload.name ?? '',
      inviterName: inviter?.name ?? 'A workspace admin',
      tenantName: tenant.name,
      roleLabel: ROLE_LABELS[payload.role] ?? payload.role,
      acceptUrl,
      expiresAt,
    },
    env,
  });

  return {
    invitation: toPublicInvitation(invitation),
    // Plaintext token is returned only on the create response so tests and
    // operator tooling can copy the acceptance URL. It is never persisted.
    acceptToken: rawToken,
    acceptUrl,
  };
};

export const resendInvitation = async ({ actor, id, ip, userAgent }) => {
  const tenantId = requireTenantId(actor);
  assertObjectId(id, 'invitation id');
  const invitation = await TeamInvitation.findById(id);
  if (!invitation || invitation.tenantId.toString() !== tenantId.toString()) {
    throw new NotFoundError('Invitation not found');
  }
  if (invitation.status !== 'pending') {
    throw new ConflictError('Only pending invitations can be resent');
  }

  const tenant = await requireTenantDoc(tenantId);
  const rawToken = generateRawToken();
  invitation.tokenHash = hashTokenValue(rawToken);
  invitation.expiresAt = new Date(Date.now() + INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000);
  invitation.lastSentAt = new Date();
  invitation.resendCount = (invitation.resendCount ?? 0) + 1;
  await invitation.save();

  await audit({
    action: TEAM_AUDIT_ACTIONS.INVITATION_RESENT,
    actor,
    tenantId,
    entityType: ENTITY_INVITATION,
    entityId: invitation._id,
    metadata: { email: invitation.email, role: invitation.role },
    ip,
    userAgent,
  });

  const env = loadEnv();
  const inviter = await User.findById(actor.id).select('name email').lean();
  const acceptUrl = buildInvitationAcceptUrl({ token: rawToken, env });
  await sendTeamNotification({
    type: 'invitation_sent',
    to: invitation.email,
    data: {
      recipientName: invitation.name ?? '',
      inviterName: inviter?.name ?? 'A workspace admin',
      tenantName: tenant.name,
      roleLabel: ROLE_LABELS[invitation.role] ?? invitation.role,
      acceptUrl,
      expiresAt: invitation.expiresAt,
    },
    env,
  });

  return {
    invitation: toPublicInvitation(invitation),
    acceptToken: rawToken,
    acceptUrl,
  };
};

export const revokeInvitation = async ({ actor, id, ip, userAgent }) => {
  const tenantId = requireTenantId(actor);
  assertObjectId(id, 'invitation id');
  const invitation = await TeamInvitation.findById(id);
  if (!invitation || invitation.tenantId.toString() !== tenantId.toString()) {
    throw new NotFoundError('Invitation not found');
  }
  if (invitation.status !== 'pending') {
    throw new ConflictError('Only pending invitations can be revoked');
  }

  invitation.status = 'revoked';
  invitation.revokedAt = new Date();
  invitation.revokedByUserId = actor.id;
  await invitation.save();

  await audit({
    action: TEAM_AUDIT_ACTIONS.INVITATION_REVOKED,
    actor,
    tenantId,
    entityType: ENTITY_INVITATION,
    entityId: invitation._id,
    metadata: { email: invitation.email, role: invitation.role },
    ip,
    userAgent,
  });

  const env = loadEnv();
  const tenant = await Tenant.findById(tenantId).select('name').lean();
  await sendTeamNotification({
    type: 'invitation_revoked',
    to: invitation.email,
    data: {
      recipientName: invitation.name ?? '',
      tenantName: tenant?.name ?? '',
    },
    env,
  });

  return { invitation: toPublicInvitation(invitation) };
};

/**
 * Public invitation acceptance. Anyone with the plaintext token can call this
 * endpoint; the token is the only credential proving they own the invited
 * email. We still enforce per-tenant uniqueness on user emails before
 * provisioning the account.
 */
export const acceptInvitation = async ({ payload, ip, userAgent }) => {
  const tokenHash = hashTokenValue(payload.token);
  const invitation = await TeamInvitation.findOne({ tokenHash });
  if (!invitation) throw new NotFoundError('Invitation not found');

  if (invitation.status === 'pending' && invitation.expiresAt.getTime() <= Date.now()) {
    invitation.status = 'expired';
    await invitation.save();
    await audit({
      action: TEAM_AUDIT_ACTIONS.INVITATION_EXPIRED,
      actor: null,
      tenantId: invitation.tenantId,
      entityType: ENTITY_INVITATION,
      entityId: invitation._id,
      metadata: { email: invitation.email, role: invitation.role },
      ip,
      userAgent,
    });
  }

  if (invitation.status !== 'pending') {
    throw new ConflictError(`Invitation is ${invitation.status}`);
  }

  const tenant = await Tenant.findById(invitation.tenantId);
  if (!tenant || tenant.status !== 'active') {
    throw new ConflictError('Tenant is not active');
  }

  // Capacity check at acceptance time defends against a race where two
  // invitations were created before the seat count was exhausted.
  await assertSeatAvailable({ tenant });

  const existingUser = await User.findOne({ email: invitation.email });
  let user = existingUser;
  if (user) {
    if (user.tenantId && user.tenantId.toString() !== tenant._id.toString()) {
      throw new ConflictError('Email already belongs to another tenant');
    }
    if (!user.tenantId) {
      user.tenantId = tenant._id;
    }
    user.role = invitation.role;
    user.status = 'active';
    user.name = payload.name ?? user.name;
    user.emailVerifiedAt = user.emailVerifiedAt ?? new Date();
    user.passwordHash = await hashPassword(payload.password);
    await user.save();
  } else {
    user = await User.create({
      tenantId: tenant._id,
      role: invitation.role,
      name: payload.name ?? invitation.name ?? invitation.email.split('@')[0],
      email: invitation.email,
      passwordHash: await hashPassword(payload.password),
      status: 'active',
      emailVerifiedAt: new Date(),
    });
  }

  invitation.status = 'accepted';
  invitation.acceptedAt = new Date();
  invitation.acceptedByUserId = user._id;
  await invitation.save();

  await audit({
    action: TEAM_AUDIT_ACTIONS.INVITATION_ACCEPTED,
    actor: { id: user._id.toString(), role: user.role, tenantId: tenant._id.toString() },
    tenantId: tenant._id,
    entityType: ENTITY_INVITATION,
    entityId: invitation._id,
    metadata: {
      acceptedByUserId: user._id.toString(),
      role: invitation.role,
    },
    ip,
    userAgent,
  });

  const env = loadEnv();
  const inviter = invitation.invitedByUserId
    ? await User.findById(invitation.invitedByUserId).select('name email').lean()
    : null;
  if (inviter?.email) {
    await sendTeamNotification({
      type: 'invitation_accepted',
      to: inviter.email,
      data: {
        recipientName: inviter.name,
        tenantName: tenant.name,
        acceptedByName: user.name,
        acceptedByEmail: user.email,
        roleLabel: ROLE_LABELS[invitation.role] ?? invitation.role,
      },
      env,
    });
  }

  return {
    invitation: toPublicInvitation(invitation),
    user: toPublicMember(user),
    tenant: {
      id: tenant._id.toString(),
      name: tenant.name,
      slug: tenant.slug,
    },
  };
};

export const transferOwnership = async ({ actor, payload, ip, userAgent }) => {
  const tenantId = requireTenantId(actor);
  assertObjectId(payload.targetUserId, 'target user id');
  const tenant = await requireTenantDoc(tenantId);

  // Only the current owner or a super admin can transfer ownership. Other
  // admins are denied to prevent collusion between two co-admins.
  const isSuperAdmin = actor.role === ROLES.SUPER_ADMIN;
  const isOwner = tenant.ownerUserId?.toString() === actor.id;
  if (!isSuperAdmin && !isOwner) {
    throw new AuthorizationError('Only the current owner can transfer ownership');
  }

  if (tenant.ownerUserId?.toString() === payload.targetUserId) {
    return { tenant: { id: tenant._id.toString() }, changed: false };
  }

  const target = await User.findById(payload.targetUserId);
  if (!target || target.tenantId?.toString() !== tenantId.toString()) {
    throw new NotFoundError('Target user is not part of this tenant');
  }
  if (target.status !== 'active') {
    throw new ConflictError('Target user must be active to receive ownership');
  }

  const previousOwnerId = tenant.ownerUserId;
  const previousOwner = previousOwnerId ? await User.findById(previousOwnerId) : null;

  // Promote the target to admin first so the new owner always has the
  // admin role, then swap the pointer.
  if (target.role !== ROLES.CLIENT_ADMIN) {
    target.role = ROLES.CLIENT_ADMIN;
    await target.save();
  }

  tenant.ownerUserId = target._id;
  await tenant.save();

  await audit({
    action: TEAM_AUDIT_ACTIONS.OWNERSHIP_TRANSFERRED,
    actor,
    tenantId,
    entityType: ENTITY_OWNERSHIP,
    entityId: tenant._id,
    metadata: {
      previousOwnerId: previousOwnerId ? previousOwnerId.toString() : null,
      newOwnerId: target._id.toString(),
    },
    ip,
    userAgent,
  });

  const env = loadEnv();
  if (previousOwner?.email) {
    await sendTeamNotification({
      type: 'ownership_transferred_previous',
      to: previousOwner.email,
      data: {
        recipientName: previousOwner.name,
        tenantName: tenant.name,
        newOwnerName: target.name,
        newOwnerEmail: target.email,
      },
      env,
    });
  }
  if (target.email) {
    await sendTeamNotification({
      type: 'ownership_transferred_new',
      to: target.email,
      data: {
        recipientName: target.name,
        tenantName: tenant.name,
        previousOwnerName: previousOwner?.name ?? 'A previous owner',
      },
      env,
    });
  }

  return {
    tenant: {
      id: tenant._id.toString(),
      ownerUserId: tenant.ownerUserId.toString(),
    },
    previousOwnerId: previousOwnerId ? previousOwnerId.toString() : null,
    newOwnerId: target._id.toString(),
    changed: true,
  };
};

/**
 * Super-admin view of tenant invitations (no `actor.tenantId` requirement).
 * Used by the platform admin panel to inspect outstanding invites for any
 * tenant during support and audits.
 */
export const listInvitationsForTenantAsAdmin = async ({ tenantId, query = {} }) => {
  assertObjectId(tenantId, 'tenant id');
  const filter = { tenantId };
  if (query.status) filter.status = query.status;
  const skip = ((query.page ?? 1) - 1) * (query.limit ?? 50);
  const items = await TeamInvitation.find(filter)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(query.limit ?? 50);
  const total = await TeamInvitation.countDocuments(filter);
  return {
    items: items.map((doc) => toPublicInvitation(doc)),
    pagination: {
      page: query.page ?? 1,
      limit: query.limit ?? 50,
      total,
    },
  };
};

export const __testing = {
  toPublicInvitation,
  toPublicMember,
  buildInvitationAcceptUrl,
  countTenantSeatsInUse,
};
