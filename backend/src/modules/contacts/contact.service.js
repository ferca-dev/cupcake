import mongoose from 'mongoose';

import * as repo from './contact.repository.js';
import {
  isValidEmail,
  isValidPhoneLike,
  normaliseEmail,
  normalisePhone,
} from './contact.validation.js';
import {
  ConflictError,
  NotFoundError,
  ValidationError,
  AuthorizationError,
} from '../../common/errors/index.js';
import { recordAuditEvent } from '../audit/audit.service.js';
import { assertQuota } from '../plans/plan.service.js';
import { QUOTA_KEYS } from '../plans/plan.constants.js';

export const CONTACT_AUDIT_ACTIONS = Object.freeze({
  CREATED: 'contact.created',
  UPDATED: 'contact.updated',
  DELETED: 'contact.deleted',
  ARCHIVED: 'contact.archived',
  RESTORED: 'contact.restored',
  IMPORT_REQUESTED: 'contact.import.requested',
});

export const CONTACT_GROUP_AUDIT_ACTIONS = Object.freeze({
  CREATED: 'contact_group.created',
  UPDATED: 'contact_group.updated',
  DELETED: 'contact_group.deleted',
  CONTACT_ADDED: 'contact_group.contact_added',
  CONTACT_REMOVED: 'contact_group.contact_removed',
});

const CONTACT_ENTITY = 'contact';
const CONTACT_GROUP_ENTITY = 'contact_group';

const assertObjectId = (id, label = 'id') => {
  if (!mongoose.isValidObjectId(id)) {
    throw new ValidationError(`Invalid ${label}`);
  }
};

const ensureTenant = (tenantId) => {
  if (!tenantId) {
    throw new AuthorizationError('Tenant context is required');
  }
  return tenantId.toString();
};

/**
 * Returns the public representation of a contact, including a per-channel
 * eligibility breakdown so the UI can surface why a row is incomplete for a
 * given delivery method without re-implementing the rules.
 */
const toPublicContact = (contact) => {
  const email = contact.email ?? null;
  const phone = contact.phone ?? null;
  const whatsappPhone = contact.whatsappPhone ?? null;
  return {
    id: contact._id.toString(),
    tenantId: contact.tenantId.toString(),
    firstName: contact.firstName ?? null,
    lastName: contact.lastName ?? null,
    fullName: contact.fullName ?? null,
    email,
    phone,
    whatsappPhone,
    tags: Array.isArray(contact.tags) ? [...contact.tags] : [],
    groupIds: Array.isArray(contact.groupIds) ? contact.groupIds.map((id) => id.toString()) : [],
    metadata: contact.metadata ?? {},
    status: contact.status,
    channels: channelStatus({ email, phone, whatsappPhone, status: contact.status }),
    createdAt: contact.createdAt,
    updatedAt: contact.updatedAt,
  };
};

const toPublicContactGroup = (group, contactCount = 0) => ({
  id: group._id.toString(),
  tenantId: group.tenantId.toString(),
  name: group.name,
  description: group.description ?? null,
  status: group.status,
  contactCount,
  createdAt: group.createdAt,
  updatedAt: group.updatedAt,
});

/**
 * Per-channel reachability summary. Returns a stable shape so the frontend
 * can render a tooltip explaining exactly why a contact is unreachable for a
 * given delivery type — e.g. "missing_email" vs. "invalid_email".
 */
export const channelStatus = ({ email, phone, whatsappPhone, status = 'active' }) => {
  const reasonFor = (field, normalised, validator) => {
    if (status === 'blocked') return { ready: false, reason: 'contact_blocked' };
    if (status === 'archived') return { ready: false, reason: 'contact_archived' };
    if (!normalised) return { ready: false, reason: `missing_${field}` };
    if (!validator(normalised)) return { ready: false, reason: `invalid_${field}` };
    return { ready: true, reason: null };
  };
  return {
    email: reasonFor('email', email, isValidEmail),
    phone: reasonFor('phone', phone, isValidPhoneLike),
    whatsapp_phone: reasonFor('whatsapp_phone', whatsappPhone, isValidPhoneLike),
  };
};

const audit = (
  action,
  { actor, entity, entityType, tenantId, metadata = {}, ip = null, userAgent = null },
) =>
  recordAuditEvent({
    action,
    entityType,
    entityId: entity._id.toString(),
    userId: actor?.id ?? null,
    tenantId,
    ip,
    userAgent,
    metadata,
  });

const computeFullName = (payload, existing = {}) => {
  if (payload.fullName !== undefined) {
    return payload.fullName ?? null;
  }
  const first = payload.firstName ?? existing.firstName ?? '';
  const last = payload.lastName ?? existing.lastName ?? '';
  const joined = [first, last].filter(Boolean).join(' ').trim();
  return joined || existing.fullName || null;
};

const validateAtLeastOneChannel = ({ email, phone, whatsappPhone }) => {
  const hasAny = Boolean(email) || Boolean(phone) || Boolean(whatsappPhone);
  if (!hasAny) {
    throw new ValidationError(
      'A contact must include at least one of email, phone, or whatsappPhone',
      [{ path: ['email'], message: 'Provide email, phone, or whatsappPhone' }],
    );
  }
};

const validateChannelFormats = ({ email, phone, whatsappPhone }) => {
  const details = [];
  if (email && !isValidEmail(email)) {
    details.push({ path: ['email'], message: 'Invalid email format' });
  }
  if (phone && !isValidPhoneLike(phone)) {
    details.push({ path: ['phone'], message: 'Phone must contain 7–15 digits' });
  }
  if (whatsappPhone && !isValidPhoneLike(whatsappPhone)) {
    details.push({ path: ['whatsappPhone'], message: 'WhatsApp phone must contain 7–15 digits' });
  }
  if (details.length > 0) {
    throw new ValidationError('Invalid contact channel data', details);
  }
};

const ensureGroupsBelongToTenant = async ({ groupIds = [], tenantId }) => {
  if (!groupIds.length) return [];
  const unique = [...new Set(groupIds.map((id) => id.toString()))];
  const groups = await repo.findContactGroupsByIds({ ids: unique, tenantId });
  if (groups.length !== unique.length) {
    throw new ValidationError('One or more groups do not belong to this tenant', [
      { path: ['groupIds'], message: 'Invalid group reference' },
    ]);
  }
  return groups.map((group) => group._id);
};

export const listContacts = async ({ tenantId, ...query }) => {
  const tenant = ensureTenant(tenantId);
  const result = await repo.findContacts({ tenantId: tenant, ...query });
  return {
    items: result.items.map(toPublicContact),
    pagination: {
      page: result.page,
      limit: result.limit,
      total: result.total,
      totalPages: result.limit > 0 ? Math.ceil(result.total / result.limit) : 1,
    },
  };
};

export const getContact = async ({ id, tenantId }) => {
  const tenant = ensureTenant(tenantId);
  assertObjectId(id, 'contact id');
  const contact = await repo.findContactById({ id, tenantId: tenant });
  if (!contact) throw new NotFoundError('Contact not found');
  return toPublicContact(contact);
};

export const createContact = async ({ tenantId, actor, payload, ip = null, userAgent = null }) => {
  const tenant = ensureTenant(tenantId);
  await assertQuota({ tenantId: tenant, quotaKey: QUOTA_KEYS.CONTACTS });

  const email = normaliseEmail(payload.email ?? null);
  const phone = normalisePhone(payload.phone ?? null);
  const whatsappPhone = normalisePhone(payload.whatsappPhone ?? null);

  validateAtLeastOneChannel({ email, phone, whatsappPhone });
  validateChannelFormats({ email, phone, whatsappPhone });

  const groupIds = await ensureGroupsBelongToTenant({
    groupIds: payload.groupIds ?? [],
    tenantId: tenant,
  });

  const fullName = computeFullName({
    fullName: payload.fullName,
    firstName: payload.firstName,
    lastName: payload.lastName,
  });

  const contact = await repo.createContact({
    tenantId: tenant,
    firstName: payload.firstName ?? null,
    lastName: payload.lastName ?? null,
    fullName,
    email,
    phone,
    whatsappPhone,
    tags: payload.tags ?? [],
    groupIds,
    metadata: payload.metadata ?? {},
    status: payload.status ?? 'active',
  });

  await audit(CONTACT_AUDIT_ACTIONS.CREATED, {
    actor,
    entity: contact,
    entityType: CONTACT_ENTITY,
    tenantId: tenant,
    metadata: { email, phone, whatsappPhone },
    ip,
    userAgent,
  });

  return toPublicContact(contact);
};

export const updateContact = async ({
  id,
  tenantId,
  actor,
  payload,
  ip = null,
  userAgent = null,
}) => {
  const tenant = ensureTenant(tenantId);
  assertObjectId(id, 'contact id');
  const contact = await repo.findContactById({ id, tenantId: tenant });
  if (!contact) throw new NotFoundError('Contact not found');

  const next = {
    firstName: payload.firstName !== undefined ? payload.firstName : contact.firstName,
    lastName: payload.lastName !== undefined ? payload.lastName : contact.lastName,
    email: payload.email !== undefined ? normaliseEmail(payload.email) : contact.email,
    phone: payload.phone !== undefined ? normalisePhone(payload.phone) : contact.phone,
    whatsappPhone:
      payload.whatsappPhone !== undefined
        ? normalisePhone(payload.whatsappPhone)
        : contact.whatsappPhone,
  };

  validateAtLeastOneChannel(next);
  validateChannelFormats(next);

  const updates = {};
  if (payload.firstName !== undefined) updates.firstName = next.firstName;
  if (payload.lastName !== undefined) updates.lastName = next.lastName;
  if (payload.email !== undefined) updates.email = next.email;
  if (payload.phone !== undefined) updates.phone = next.phone;
  if (payload.whatsappPhone !== undefined) updates.whatsappPhone = next.whatsappPhone;
  if (
    payload.firstName !== undefined ||
    payload.lastName !== undefined ||
    payload.fullName !== undefined
  ) {
    updates.fullName = computeFullName(payload, contact);
  }
  if (payload.tags !== undefined) updates.tags = payload.tags ?? [];
  if (payload.metadata !== undefined) updates.metadata = payload.metadata ?? {};
  if (payload.status !== undefined) updates.status = payload.status;
  if (payload.groupIds !== undefined) {
    updates.groupIds = await ensureGroupsBelongToTenant({
      groupIds: payload.groupIds,
      tenantId: tenant,
    });
  }

  if (Object.keys(updates).length === 0) {
    return toPublicContact(contact);
  }

  await repo.updateContact(contact, updates);

  await audit(CONTACT_AUDIT_ACTIONS.UPDATED, {
    actor,
    entity: contact,
    entityType: CONTACT_ENTITY,
    tenantId: tenant,
    metadata: { changedKeys: Object.keys(updates) },
    ip,
    userAgent,
  });

  return toPublicContact(contact);
};

/**
 * Soft-delete: flips the contact to `archived` so historical campaign data
 * keeps a stable reference. Use `hard=true` only when the caller is certain
 * the contact is not referenced by any campaign recipient yet (we still
 * support hard delete for fresh records to keep test data hygienic).
 */
export const deleteContact = async ({
  id,
  tenantId,
  actor,
  hard = false,
  ip = null,
  userAgent = null,
}) => {
  const tenant = ensureTenant(tenantId);
  assertObjectId(id, 'contact id');
  const contact = await repo.findContactById({ id, tenantId: tenant });
  if (!contact) throw new NotFoundError('Contact not found');

  if (hard) {
    await audit(CONTACT_AUDIT_ACTIONS.DELETED, {
      actor,
      entity: contact,
      entityType: CONTACT_ENTITY,
      tenantId: tenant,
      metadata: { mode: 'hard' },
      ip,
      userAgent,
    });
    await repo.removeContact(contact);
    return { id: contact._id.toString(), mode: 'hard' };
  }

  if (contact.status !== 'archived') {
    contact.status = 'archived';
    await contact.save();
  }
  await audit(CONTACT_AUDIT_ACTIONS.ARCHIVED, {
    actor,
    entity: contact,
    entityType: CONTACT_ENTITY,
    tenantId: tenant,
    metadata: { mode: 'soft' },
    ip,
    userAgent,
  });
  return { id: contact._id.toString(), mode: 'soft', status: contact.status };
};

/**
 * Bulk import flow is intentionally deferred (see docs/known-limitations.md).
 * The endpoint accepts the call so frontend wiring is stable; the response
 * explicitly returns `pending_implementation` so callers cannot assume a
 * real parse happened. Every request is audited.
 */
export const requestContactImport = async ({
  tenantId,
  actor,
  payload = {},
  ip = null,
  userAgent = null,
}) => {
  const tenant = ensureTenant(tenantId);
  const job = {
    id: new mongoose.Types.ObjectId().toString(),
    tenantId: tenant,
    status: 'pending_implementation',
    requestedBy: actor?.id ?? null,
    source: payload?.source ?? null,
    note: payload?.note ?? null,
    createdAt: new Date().toISOString(),
  };
  await recordAuditEvent({
    action: CONTACT_AUDIT_ACTIONS.IMPORT_REQUESTED,
    entityType: CONTACT_ENTITY,
    entityId: job.id,
    userId: actor?.id ?? null,
    tenantId: tenant,
    ip,
    userAgent,
    metadata: { source: job.source, note: job.note },
  });
  return job;
};

/**
 * The bulk import report is also a placeholder. Returning a 501-equivalent
 * payload keeps API consumers from assuming the import has succeeded.
 */
export const getContactImportReport = async ({ id, tenantId }) => {
  ensureTenant(tenantId);
  assertObjectId(id, 'import id');
  return {
    id,
    status: 'pending_implementation',
    summary: {
      total: 0,
      created: 0,
      updated: 0,
      skipped: 0,
      failed: 0,
    },
    rows: [],
    placeholder: true,
  };
};

// --- Groups ----------------------------------------------------------------

export const listContactGroups = async ({ tenantId, ...query }) => {
  const tenant = ensureTenant(tenantId);
  const result = await repo.findContactGroups({ tenantId: tenant, ...query });
  const groupIds = result.items.map((group) => group._id);
  const counts = await repo.countContactsByGroupIds({ groupIds, tenantId: tenant });
  return {
    items: result.items.map((group) =>
      toPublicContactGroup(group, counts.get(group._id.toString()) ?? 0),
    ),
    pagination: {
      page: result.page,
      limit: result.limit,
      total: result.total,
      totalPages: result.limit > 0 ? Math.ceil(result.total / result.limit) : 1,
    },
  };
};

export const getContactGroup = async ({ id, tenantId }) => {
  const tenant = ensureTenant(tenantId);
  assertObjectId(id, 'group id');
  const group = await repo.findContactGroupById({ id, tenantId: tenant });
  if (!group) throw new NotFoundError('Contact group not found');
  const contactCount = await repo.countContactsInGroup({
    groupId: group._id,
    tenantId: tenant,
  });
  return toPublicContactGroup(group, contactCount);
};

const ensureGroupNameUnique = async ({ name, tenantId, excludeId = null }) => {
  const existing = await repo.findContactGroupByName({ name, tenantId, excludeId });
  if (existing) {
    throw new ConflictError('A group with this name already exists', [
      { path: ['name'], message: 'Name is already in use' },
    ]);
  }
};

export const createContactGroup = async ({
  tenantId,
  actor,
  payload,
  ip = null,
  userAgent = null,
}) => {
  const tenant = ensureTenant(tenantId);
  await ensureGroupNameUnique({ name: payload.name, tenantId: tenant });

  const group = await repo.createContactGroup({
    tenantId: tenant,
    name: payload.name,
    description: payload.description ?? null,
    status: payload.status ?? 'active',
  });

  await audit(CONTACT_GROUP_AUDIT_ACTIONS.CREATED, {
    actor,
    entity: group,
    entityType: CONTACT_GROUP_ENTITY,
    tenantId: tenant,
    metadata: { name: group.name },
    ip,
    userAgent,
  });

  return toPublicContactGroup(group, 0);
};

export const updateContactGroup = async ({
  id,
  tenantId,
  actor,
  payload,
  ip = null,
  userAgent = null,
}) => {
  const tenant = ensureTenant(tenantId);
  assertObjectId(id, 'group id');
  const group = await repo.findContactGroupById({ id, tenantId: tenant });
  if (!group) throw new NotFoundError('Contact group not found');

  if (payload.name !== undefined && payload.name !== group.name) {
    await ensureGroupNameUnique({
      name: payload.name,
      tenantId: tenant,
      excludeId: group._id,
    });
  }

  const updates = {};
  if (payload.name !== undefined) updates.name = payload.name;
  if (payload.description !== undefined) updates.description = payload.description;
  if (payload.status !== undefined) updates.status = payload.status;

  if (Object.keys(updates).length === 0) {
    const contactCount = await repo.countContactsInGroup({
      groupId: group._id,
      tenantId: tenant,
    });
    return toPublicContactGroup(group, contactCount);
  }

  await repo.updateContactGroup(group, updates);

  await audit(CONTACT_GROUP_AUDIT_ACTIONS.UPDATED, {
    actor,
    entity: group,
    entityType: CONTACT_GROUP_ENTITY,
    tenantId: tenant,
    metadata: { changedKeys: Object.keys(updates) },
    ip,
    userAgent,
  });

  const contactCount = await repo.countContactsInGroup({
    groupId: group._id,
    tenantId: tenant,
  });
  return toPublicContactGroup(group, contactCount);
};

export const deleteContactGroup = async ({ id, tenantId, actor, ip = null, userAgent = null }) => {
  const tenant = ensureTenant(tenantId);
  assertObjectId(id, 'group id');
  const group = await repo.findContactGroupById({ id, tenantId: tenant });
  if (!group) throw new NotFoundError('Contact group not found');

  await repo.pullGroupFromAllContacts({ groupId: group._id, tenantId: tenant });
  await audit(CONTACT_GROUP_AUDIT_ACTIONS.DELETED, {
    actor,
    entity: group,
    entityType: CONTACT_GROUP_ENTITY,
    tenantId: tenant,
    metadata: { name: group.name },
    ip,
    userAgent,
  });
  await repo.removeContactGroup(group);
  return { id: group._id.toString() };
};

/**
 * Adds a contact to a group. Both objects must belong to the same tenant —
 * the repository's tenant-scoped lookups make a cross-tenant membership
 * impossible because the contact and the group are loaded independently
 * within the caller tenant.
 */
export const addContactToGroup = async ({
  groupId,
  contactId,
  tenantId,
  actor,
  ip = null,
  userAgent = null,
}) => {
  const tenant = ensureTenant(tenantId);
  assertObjectId(groupId, 'group id');
  assertObjectId(contactId, 'contact id');

  const group = await repo.findContactGroupById({ id: groupId, tenantId: tenant });
  if (!group) throw new NotFoundError('Contact group not found');

  const contact = await repo.findContactById({ id: contactId, tenantId: tenant });
  if (!contact) throw new NotFoundError('Contact not found');

  const already = (contact.groupIds ?? []).some(
    (existing) => existing.toString() === group._id.toString(),
  );
  if (!already) {
    contact.groupIds = [...(contact.groupIds ?? []), group._id];
    await contact.save();
  }

  await audit(CONTACT_GROUP_AUDIT_ACTIONS.CONTACT_ADDED, {
    actor,
    entity: group,
    entityType: CONTACT_GROUP_ENTITY,
    tenantId: tenant,
    metadata: { contactId: contact._id.toString() },
    ip,
    userAgent,
  });

  const contactCount = await repo.countContactsInGroup({
    groupId: group._id,
    tenantId: tenant,
  });

  return {
    group: toPublicContactGroup(group, contactCount),
    contact: toPublicContact(contact),
  };
};

export const removeContactFromGroup = async ({
  groupId,
  contactId,
  tenantId,
  actor,
  ip = null,
  userAgent = null,
}) => {
  const tenant = ensureTenant(tenantId);
  assertObjectId(groupId, 'group id');
  assertObjectId(contactId, 'contact id');

  const group = await repo.findContactGroupById({ id: groupId, tenantId: tenant });
  if (!group) throw new NotFoundError('Contact group not found');

  const contact = await repo.findContactById({ id: contactId, tenantId: tenant });
  if (!contact) throw new NotFoundError('Contact not found');

  const filtered = (contact.groupIds ?? []).filter(
    (existing) => existing.toString() !== group._id.toString(),
  );
  if (filtered.length !== (contact.groupIds ?? []).length) {
    contact.groupIds = filtered;
    await contact.save();
  }

  await audit(CONTACT_GROUP_AUDIT_ACTIONS.CONTACT_REMOVED, {
    actor,
    entity: group,
    entityType: CONTACT_GROUP_ENTITY,
    tenantId: tenant,
    metadata: { contactId: contact._id.toString() },
    ip,
    userAgent,
  });

  const contactCount = await repo.countContactsInGroup({
    groupId: group._id,
    tenantId: tenant,
  });

  return {
    group: toPublicContactGroup(group, contactCount),
    contact: toPublicContact(contact),
  };
};

export const __testing = { toPublicContact, toPublicContactGroup, channelStatus };
