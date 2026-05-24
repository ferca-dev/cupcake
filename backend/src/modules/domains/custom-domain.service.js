import crypto from 'node:crypto';
import dns from 'node:dns/promises';
import net from 'node:net';

import mongoose from 'mongoose';

import * as repo from './custom-domain.repository.js';
import { CUSTOM_DOMAIN_STATUSES } from './custom-domain.model.js';
import { Tenant } from '../tenants/tenant.model.js';
import { assertFeature } from '../plans/plan.service.js';
import { FEATURE_KEYS } from '../plans/plan.constants.js';
import {
  AuthorizationError,
  ConflictError,
  NotFoundError,
  ValidationError,
} from '../../common/errors/index.js';
import { recordAuditEvent } from '../audit/audit.service.js';

export const DOMAIN_AUDIT_ACTIONS = Object.freeze({
  CREATED: 'custom_domain.created',
  VERIFIED: 'custom_domain.verified',
  STATUS_CHANGED: 'custom_domain.status_changed',
  DELETED: 'custom_domain.deleted',
  ADMIN_VERIFIED: 'custom_domain.admin_verified',
});

const ENTITY_TYPE = 'custom_domain';
const RESERVED_SUFFIXES = Object.freeze([
  '.localhost',
  '.local',
  '.internal',
  '.test',
  '.example',
  '.invalid',
  '.lan',
  '.home',
  '.corp',
]);
const RESERVED_HOSTNAMES = Object.freeze(['localhost', 'localhost.localdomain']);

let txtResolver = (hostname) => dns.resolveTxt(hostname);

const ensureTenant = (tenantId) => {
  if (!tenantId) throw new AuthorizationError('Tenant context is required');
  if (!mongoose.isValidObjectId(tenantId)) throw new ValidationError('Invalid tenant id');
  return tenantId.toString();
};

const assertObjectId = (id, label = 'id') => {
  if (!mongoose.isValidObjectId(id)) throw new ValidationError(`Invalid ${label}`);
};

export const normalizeHostname = (input, { allowPort = false } = {}) => {
  const raw = String(input ?? '').trim().toLowerCase();
  if (!raw) throw new ValidationError('Hostname is required');
  if (/^https?:\/\//i.test(raw) || raw.includes('/') || raw.includes('@')) {
    throw new ValidationError('Hostname must not include a protocol, path, or credentials');
  }

  let hostname = raw.replace(/\.$/, '');
  if (allowPort && hostname.includes(':')) {
    const match = /^(.+):(\d{1,5})$/.exec(hostname);
    if (!match) throw new ValidationError('Invalid host header');
    hostname = match[1];
  }
  if (!allowPort && hostname.includes(':')) {
    throw new ValidationError('Hostname must not include a port');
  }

  if (hostname.length > 253 || hostname.length < 4) {
    throw new ValidationError('Hostname length is invalid');
  }
  if (net.isIP(hostname)) throw new ValidationError('IP addresses cannot be used as custom domains');
  if (RESERVED_HOSTNAMES.includes(hostname) || RESERVED_SUFFIXES.some((s) => hostname.endsWith(s))) {
    throw new ValidationError('Reserved or internal hostnames cannot be used as custom domains');
  }

  const labels = hostname.split('.');
  if (labels.length < 2) throw new ValidationError('Hostname must include a public suffix');
  for (const label of labels) {
    if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)) {
      throw new ValidationError('Hostname contains an invalid label');
    }
  }
  return hostname;
};

const buildDnsRecord = ({ hostname, token }) => ({
  type: 'TXT',
  name: `_cupcake-verification.${hostname}`,
  value: `cupcake-domain-verification=${token}`,
});

const token = () => crypto.randomBytes(24).toString('base64url');

const toPublicDomain = (domain) => ({
  id: domain._id.toString(),
  tenantId: domain.tenantId.toString(),
  hostname: domain.hostname,
  status: domain.status,
  dnsRecord: {
    type: domain.dnsRecord.type,
    name: domain.dnsRecord.name,
    value: domain.dnsRecord.value,
  },
  sslMode: domain.sslMode,
  requestedByUserId: domain.requestedByUserId ? domain.requestedByUserId.toString() : null,
  reviewedByUserId: domain.reviewedByUserId ? domain.reviewedByUserId.toString() : null,
  verifiedAt: domain.verifiedAt ?? null,
  activatedAt: domain.activatedAt ?? null,
  deactivatedAt: domain.deactivatedAt ?? null,
  rejectedAt: domain.rejectedAt ?? null,
  adminOverrideAt: domain.adminOverrideAt ?? null,
  lastCheckedAt: domain.lastCheckedAt ?? null,
  lastCheckError: domain.lastCheckError ?? null,
  createdAt: domain.createdAt,
  updatedAt: domain.updatedAt,
});

const audit = (action, { actor, domain, tenantId = domain.tenantId, metadata = {}, ip = null, userAgent = null }) =>
  recordAuditEvent({
    action,
    entityType: ENTITY_TYPE,
    entityId: domain._id.toString(),
    tenantId,
    userId: actor?.id ?? null,
    ip,
    userAgent,
    metadata,
  });

const requireDomain = async ({ id, tenantId = null }) => {
  assertObjectId(id, 'domain id');
  const domain = await repo.findDomainById({ id, tenantId });
  if (!domain) throw new NotFoundError('Custom domain not found');
  return domain;
};

const dnsContainsToken = async (domain) => {
  try {
    const records = await txtResolver(domain.dnsRecord.name);
    const values = records.map((entry) => entry.join(''));
    return {
      ok: values.includes(domain.dnsRecord.value),
      error: values.length ? null : 'TXT record not found',
    };
  } catch (err) {
    return { ok: false, error: err?.code || err?.message || 'DNS lookup failed' };
  }
};

export const listDomains = async ({ tenantId, query = {} }) => {
  const tenant = ensureTenant(tenantId);
  const result = await repo.listTenantDomains({ tenantId: tenant, ...query });
  return {
    items: result.items.map(toPublicDomain),
    pagination: {
      page: result.page,
      limit: result.limit,
      total: result.total,
      totalPages: result.limit > 0 ? Math.ceil(result.total / result.limit) : 1,
    },
  };
};

export const createDomain = async ({ tenantId, actor, payload, ip = null, userAgent = null }) => {
  const tenant = ensureTenant(tenantId);
  await assertFeature({ tenantId: tenant, feature: FEATURE_KEYS.SURVEYS_CUSTOM_DOMAINS });
  const tenantDoc = await Tenant.findById(tenant);
  if (!tenantDoc) throw new NotFoundError('Tenant not found');

  const hostname = normalizeHostname(payload.hostname);
  const existing = await repo.findDomainByHostname({ hostname });
  if (existing) {
    throw new ConflictError('Hostname is already registered', [
      { path: ['hostname'], message: 'Hostname is already registered' },
    ]);
  }

  const verificationToken = token();
  const domain = await repo.createDomain({
    tenantId: tenantDoc._id,
    hostname,
    status: 'pending',
    verificationToken,
    dnsRecord: buildDnsRecord({ hostname, token: verificationToken }),
    sslMode: payload.sslMode ?? 'platform_managed',
    requestedByUserId: actor?.id ?? null,
  });

  await audit(DOMAIN_AUDIT_ACTIONS.CREATED, {
    actor,
    domain,
    ip,
    userAgent,
    metadata: { hostname, sslMode: domain.sslMode },
  });

  return toPublicDomain(domain);
};

export const verifyDomain = async ({ id, tenantId, actor, ip = null, userAgent = null }) => {
  const tenant = ensureTenant(tenantId);
  await assertFeature({ tenantId: tenant, feature: FEATURE_KEYS.SURVEYS_CUSTOM_DOMAINS });
  const domain = await requireDomain({ id, tenantId: tenant });

  const check = await dnsContainsToken(domain);
  domain.lastCheckedAt = new Date();
  domain.lastCheckError = check.ok ? null : check.error;
  if (!check.ok) {
    await repo.saveDomain(domain);
    throw new ConflictError('DNS verification record was not found', [
      {
        path: ['dnsRecord'],
        message: `Create TXT ${domain.dnsRecord.name} with value ${domain.dnsRecord.value}`,
      },
    ]);
  }

  domain.status = domain.status === 'active' ? 'active' : 'verified';
  domain.verifiedAt = domain.verifiedAt ?? new Date();
  await repo.saveDomain(domain);
  await audit(DOMAIN_AUDIT_ACTIONS.VERIFIED, { actor, domain, ip, userAgent });
  return toPublicDomain(domain);
};

export const updateDomainStatus = async ({
  id,
  tenantId,
  status,
  actor,
  ip = null,
  userAgent = null,
}) => {
  const tenant = ensureTenant(tenantId);
  await assertFeature({ tenantId: tenant, feature: FEATURE_KEYS.SURVEYS_CUSTOM_DOMAINS });
  const domain = await requireDomain({ id, tenantId: tenant });
  const previousStatus = domain.status;

  if (status === 'active' && !domain.verifiedAt) {
    throw new ConflictError('Domain must be verified before activation');
  }
  domain.status = status;
  if (status === 'active') {
    domain.activatedAt = domain.activatedAt ?? new Date();
    domain.deactivatedAt = null;
  }
  if (status === 'inactive') {
    domain.deactivatedAt = new Date();
  }
  await repo.saveDomain(domain);
  await audit(DOMAIN_AUDIT_ACTIONS.STATUS_CHANGED, {
    actor,
    domain,
    ip,
    userAgent,
    metadata: { previousStatus, nextStatus: status },
  });
  return toPublicDomain(domain);
};

export const deleteDomain = async ({ id, tenantId, actor, ip = null, userAgent = null }) => {
  const tenant = ensureTenant(tenantId);
  const domain = await requireDomain({ id, tenantId: tenant });
  domain.status = 'inactive';
  domain.deletedAt = new Date();
  domain.deactivatedAt = domain.deactivatedAt ?? domain.deletedAt;
  await repo.saveDomain(domain);
  await audit(DOMAIN_AUDIT_ACTIONS.DELETED, { actor, domain, ip, userAgent });
  return { id: domain._id.toString(), deletedAt: domain.deletedAt };
};

export const listAllDomains = async ({ query = {} }) => {
  const result = await repo.listAllDomains(query);
  return {
    items: result.items.map(toPublicDomain),
    pagination: {
      page: result.page,
      limit: result.limit,
      total: result.total,
      totalPages: result.limit > 0 ? Math.ceil(result.total / result.limit) : 1,
    },
  };
};

export const adminVerifyDomain = async ({ id, actor, activate = false, ip = null, userAgent = null }) => {
  const domain = await requireDomain({ id });
  domain.verifiedAt = domain.verifiedAt ?? new Date();
  domain.status = activate ? 'active' : 'verified';
  if (activate) {
    domain.activatedAt = domain.activatedAt ?? new Date();
    domain.deactivatedAt = null;
  }
  domain.adminOverrideAt = new Date();
  domain.reviewedByUserId = actor?.id ?? null;
  domain.lastCheckError = null;
  await repo.saveDomain(domain);
  await audit(DOMAIN_AUDIT_ACTIONS.ADMIN_VERIFIED, {
    actor,
    domain,
    ip,
    userAgent,
    metadata: { activate },
  });
  return toPublicDomain(domain);
};

export const adminUpdateDomainStatus = async ({
  id,
  status,
  actor,
  ip = null,
  userAgent = null,
}) => {
  if (!CUSTOM_DOMAIN_STATUSES.includes(status)) throw new ValidationError('Invalid domain status');
  const domain = await requireDomain({ id });
  if (status === 'active' && !domain.verifiedAt) {
    throw new ConflictError('Domain must be verified before activation');
  }
  const previousStatus = domain.status;
  domain.status = status;
  domain.reviewedByUserId = actor?.id ?? null;
  if (status === 'active') {
    domain.activatedAt = domain.activatedAt ?? new Date();
    domain.deactivatedAt = null;
  }
  if (status === 'inactive') domain.deactivatedAt = new Date();
  if (status === 'rejected') domain.rejectedAt = new Date();
  await repo.saveDomain(domain);
  await audit(DOMAIN_AUDIT_ACTIONS.STATUS_CHANGED, {
    actor,
    domain,
    ip,
    userAgent,
    metadata: { previousStatus, nextStatus: status, admin: true },
  });
  return toPublicDomain(domain);
};

export const resolveActiveDomainForHost = async (host) => {
  if (!host) return null;
  let hostname;
  try {
    hostname = normalizeHostname(host, { allowPort: true });
  } catch {
    return null;
  }
  const domain = await repo.findActiveDomainByHostname({ hostname });
  return domain ? toPublicDomain(domain) : null;
};

export const __testing = {
  setTxtResolver(resolver) {
    txtResolver = resolver;
  },
  resetTxtResolver() {
    txtResolver = (hostname) => dns.resolveTxt(hostname);
  },
};
