import crypto from 'node:crypto';

import mongoose from 'mongoose';

import { Contact, CONTACT_STATUSES } from './contact.model.js';
import { ContactGroup } from './contact-group.model.js';
import { ContactImportJob } from './contact-import-job.model.js';
import {
  CONTACT_IMPORT_DEDUPE_KEYS,
  CONTACT_IMPORT_FIELDS,
  parseContactImportBuffer,
} from './contact-import.parser.js';
import {
  isValidEmail,
  isValidPhoneLike,
  normaliseEmail,
  normalisePhone,
} from './contact.validation.js';
import {
  CHANNEL_ADDRESS_FIELDS,
  CONTACT_CONSENT_STATUSES,
  CONSENT_CHANNELS,
  normalizeConsentBlock,
} from './consent.utils.js';
import { AuthorizationError, NotFoundError, ValidationError } from '../../common/errors/index.js';
import { buildCsv } from '../reports/report.csv.js';
import { recordAuditEvent } from '../audit/audit.service.js';
import { assertQuota } from '../plans/plan.service.js';
import { QUOTA_KEYS } from '../plans/plan.constants.js';
import {
  buildSuppressionLookup,
  upsertSuppressionEntry,
} from '../suppression/suppression.service.js';

const CONTACT_IMPORT_ENTITY = 'contact_import';
const CONTACT_ENTITY = 'contact';
const IMPORT_AUDIT_ACTIONS = Object.freeze({
  CREATED: 'contact.import.created',
  MAPPED: 'contact.import.mapped',
  CONFIRMED: 'contact.import.confirmed',
  COMPLETED: 'contact.import.completed',
  FAILED: 'contact.import.failed',
});

const CONSENT_FIELD_TO_CHANNEL = Object.freeze({
  emailConsent: 'email',
  smsConsent: 'sms',
  whatsappConsent: 'whatsapp',
});

const DEFAULT_MAPPING = Object.freeze(
  Object.fromEntries(CONTACT_IMPORT_FIELDS.map((field) => [field, null])),
);

const splitList = (value) =>
  String(value ?? '')
    .split(/[;,|]/)
    .map((entry) => entry.trim())
    .filter(Boolean);

const ensureTenant = (tenantId) => {
  if (!tenantId) throw new AuthorizationError('Tenant context is required');
  return tenantId.toString();
};

const assertObjectId = (id, label = 'id') => {
  if (!mongoose.isValidObjectId(id)) throw new ValidationError(`Invalid ${label}`);
};

const checksum = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');

const buildCounts = (patch = {}) => ({
  totalRows: 0,
  acceptedRows: 0,
  rejectedRows: 0,
  duplicateRows: 0,
  createdRows: 0,
  updatedRows: 0,
  skippedRows: 0,
  ...patch,
});

const normalizeMapping = (mapping = {}) => ({
  ...DEFAULT_MAPPING,
  ...Object.fromEntries(
    Object.entries(mapping ?? {}).filter(([key]) => CONTACT_IMPORT_FIELDS.includes(key)),
  ),
});

const toPublicJob = (job) => ({
  id: job._id.toString(),
  tenantId: job.tenantId.toString(),
  requestedBy: job.requestedBy ? job.requestedBy.toString() : null,
  confirmedBy: job.confirmedBy ? job.confirmedBy.toString() : null,
  status: job.status,
  file: job.file,
  headers: job.headers ?? [],
  sampleRows: job.sampleRows ?? [],
  mapping: normalizeMapping(job.mapping),
  suggestedMapping: normalizeMapping(job.suggestedMapping),
  dedupeKeys: job.dedupeKeys ?? [...CONTACT_IMPORT_DEDUPE_KEYS],
  updateExisting: job.updateExisting !== false,
  counts: buildCounts(job.counts?.toObject?.() ?? job.counts ?? {}),
  errorCount: Array.isArray(job.rowErrors) ? job.rowErrors.length : 0,
  errorReportAvailable: Array.isArray(job.rowErrors) && job.rowErrors.length > 0,
  confirmedAt: job.confirmedAt ?? null,
  processedAt: job.processedAt ?? null,
  failedAt: job.failedAt ?? null,
  failureMessage: job.failureMessage ?? null,
  createdAt: job.createdAt,
  updatedAt: job.updatedAt,
});

const auditImport = (
  action,
  { job, tenantId, actor, metadata = {}, ip = null, userAgent = null },
) =>
  recordAuditEvent({
    action,
    entityType: CONTACT_IMPORT_ENTITY,
    entityId: job?._id?.toString?.() ?? null,
    userId: actor?.id ?? null,
    tenantId,
    ip,
    userAgent,
    metadata,
  });

const loadImportJob = async ({ id, tenantId, includeRows = false }) => {
  assertObjectId(id, 'import id');
  const query = ContactImportJob.findOne({ _id: id, tenantId });
  if (includeRows) query.select('+rows');
  const job = await query;
  if (!job) throw new NotFoundError('Contact import not found');
  return job;
};

export const createContactImport = async ({
  tenantId,
  actor,
  file,
  ip = null,
  userAgent = null,
}) => {
  const tenant = ensureTenant(tenantId);
  if (!file?.buffer) {
    throw new ValidationError('Contact import file is required', [
      { path: ['file'], message: 'Upload a CSV or XLSX file' },
    ]);
  }

  const parsed = await parseContactImportBuffer({
    buffer: file.buffer,
    originalName: file.originalname,
    mimeType: file.mimetype,
  });

  const job = await ContactImportJob.create({
    tenantId: tenant,
    requestedBy: actor?.id ?? null,
    status: 'previewed',
    file: {
      originalName: file.originalname,
      mimeType: file.mimetype ?? null,
      size: file.size,
      format: parsed.format,
      checksum: checksum(file.buffer),
      rowCount: parsed.rows.length,
    },
    headers: parsed.headers,
    sampleRows: parsed.sampleRows,
    rows: parsed.rows,
    mapping: parsed.suggestedMapping,
    suggestedMapping: parsed.suggestedMapping,
    counts: buildCounts({ totalRows: parsed.rows.length }),
  });

  await auditImport(IMPORT_AUDIT_ACTIONS.CREATED, {
    job,
    tenantId: tenant,
    actor,
    metadata: {
      fileName: file.originalname,
      format: parsed.format,
      rowCount: parsed.rows.length,
    },
    ip,
    userAgent,
  });

  return toPublicJob(job);
};

export const getContactImport = async ({ id, tenantId }) => {
  const tenant = ensureTenant(tenantId);
  const job = await loadImportJob({ id, tenantId: tenant });
  return toPublicJob(job);
};

export const previewContactImport = async ({ id, tenantId }) => {
  const tenant = ensureTenant(tenantId);
  const job = await loadImportJob({ id, tenantId: tenant });
  if (job.status === 'uploaded') {
    job.status = 'previewed';
    await job.save();
  }
  return toPublicJob(job);
};

export const updateContactImportMapping = async ({
  id,
  tenantId,
  actor,
  payload,
  ip = null,
  userAgent = null,
}) => {
  const tenant = ensureTenant(tenantId);
  const job = await loadImportJob({ id, tenantId: tenant });
  const mapping = normalizeMapping(payload.mapping ?? job.mapping ?? {});
  const unknownHeaders = Object.values(mapping).filter(
    (header) => header && !job.headers.includes(header),
  );
  if (unknownHeaders.length > 0) {
    throw new ValidationError('Import mapping references unknown columns', [
      { path: ['mapping'], message: `Unknown column: ${unknownHeaders[0]}` },
    ]);
  }
  job.mapping = mapping;
  if (payload.dedupeKeys) job.dedupeKeys = [...new Set(payload.dedupeKeys)];
  if (payload.updateExisting !== undefined) job.updateExisting = payload.updateExisting;
  job.status = 'mapped';
  await job.save();

  await auditImport(IMPORT_AUDIT_ACTIONS.MAPPED, {
    job,
    tenantId: tenant,
    actor,
    metadata: {
      mappedFields: Object.entries(mapping)
        .filter(([, header]) => Boolean(header))
        .map(([field]) => field),
      dedupeKeys: job.dedupeKeys,
      updateExisting: job.updateExisting,
    },
    ip,
    userAgent,
  });

  return toPublicJob(job);
};

const readMappedValue = ({ row, headers, mapping, field }) => {
  const header = mapping[field];
  if (!header) return '';
  const index = headers.indexOf(header);
  if (index < 0) return '';
  return row.values[index] ?? '';
};

const parseMetadata = (value, errors) => {
  if (!value) return undefined;
  const trimmed = String(value).trim();
  if (!trimmed) return undefined;
  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
    } catch {
      errors.push({ field: 'metadata', message: 'Metadata must be valid JSON or key=value pairs' });
      return undefined;
    }
    errors.push({ field: 'metadata', message: 'Metadata JSON must be an object' });
    return undefined;
  }
  return Object.fromEntries(
    splitList(trimmed)
      .map((entry) => {
        const [key, ...rest] = entry.split('=');
        return [key?.trim(), rest.join('=').trim()];
      })
      .filter(([key]) => Boolean(key)),
  );
};

const parseStatus = (value, errors) => {
  if (!value) return undefined;
  const status = String(value).trim().toLowerCase();
  if (CONTACT_STATUSES.includes(status)) return status;
  errors.push({
    field: 'status',
    message: `Status must be one of: ${CONTACT_STATUSES.join(', ')}`,
  });
  return undefined;
};

const parseConsentStatus = (field, value, errors) => {
  if (!value) return undefined;
  const status = String(value).trim().toLowerCase();
  if (CONTACT_CONSENT_STATUSES.includes(status)) return status;
  errors.push({
    field,
    message: `Consent must be one of: ${CONTACT_CONSENT_STATUSES.join(', ')}`,
  });
  return undefined;
};

const parseGroupIds = ({ value, groupsById, groupsByName, errors }) => {
  if (!value) return undefined;
  const ids = [];
  for (const token of splitList(value)) {
    if (mongoose.isValidObjectId(token) && groupsById.has(token)) {
      ids.push(groupsById.get(token)._id);
      continue;
    }
    const byName = groupsByName.get(token.toLowerCase());
    if (byName) {
      ids.push(byName._id);
      continue;
    }
    errors.push({ field: 'groups', message: `Group does not exist in this tenant: ${token}` });
  }
  return [...new Map(ids.map((id) => [id.toString(), id])).values()];
};

const computeFullName = ({ firstName, lastName, fullName }, existing = {}) => {
  if (fullName !== undefined) return fullName || null;
  const first = firstName !== undefined ? firstName : (existing.firstName ?? '');
  const last = lastName !== undefined ? lastName : (existing.lastName ?? '');
  const joined = [first, last].filter(Boolean).join(' ').trim();
  return joined || existing.fullName || null;
};

const parseImportRow = ({ job, row, groupsById, groupsByName }) => {
  const errors = [];
  const mapping = normalizeMapping(job.mapping);
  const get = (field) => readMappedValue({ row, headers: job.headers, mapping, field });
  const raw = Object.fromEntries(CONTACT_IMPORT_FIELDS.map((field) => [field, get(field)]));

  const contact = {};
  if (raw.firstName) contact.firstName = raw.firstName;
  if (raw.lastName) contact.lastName = raw.lastName;
  if (raw.fullName) contact.fullName = raw.fullName;
  if (raw.email) contact.email = normaliseEmail(raw.email);
  if (raw.phone) contact.phone = normalisePhone(raw.phone);
  if (raw.whatsappPhone) contact.whatsappPhone = normalisePhone(raw.whatsappPhone);
  if (raw.tags) contact.tags = [...new Set(splitList(raw.tags))];
  if (raw.groups) {
    contact.groupIds = parseGroupIds({
      value: raw.groups,
      groupsById,
      groupsByName,
      errors,
    });
  }
  if (raw.metadata) contact.metadata = parseMetadata(raw.metadata, errors);
  const status = parseStatus(raw.status, errors);
  if (status) contact.status = status;

  const consent = {};
  for (const [field, channel] of Object.entries(CONSENT_FIELD_TO_CHANNEL)) {
    const statusValue = parseConsentStatus(field, raw[field], errors);
    if (statusValue) {
      consent[channel] = {
        status: statusValue,
        source: 'import',
        changedAt: new Date(),
        metadata: { importJobId: job._id.toString(), rowNumber: row.rowNumber },
      };
    }
  }
  if (Object.keys(consent).length > 0) contact.consent = consent;

  if (!contact.email && !contact.phone && !contact.whatsappPhone) {
    errors.push({
      field: 'email',
      message: 'Provide at least one of email, phone, or WhatsApp phone',
    });
  }
  if (contact.email && !isValidEmail(contact.email)) {
    errors.push({ field: 'email', message: 'Invalid email format' });
  }
  if (contact.phone && !isValidPhoneLike(contact.phone)) {
    errors.push({ field: 'phone', message: 'Phone must contain 7-15 digits' });
  }
  if (contact.whatsappPhone && !isValidPhoneLike(contact.whatsappPhone)) {
    errors.push({ field: 'whatsappPhone', message: 'WhatsApp phone must contain 7-15 digits' });
  }

  return {
    rowNumber: row.rowNumber,
    raw,
    contact,
    errors: errors.map((error) => ({
      rowNumber: row.rowNumber,
      field: error.field ?? null,
      message: error.message,
      value: error.field ? (raw[error.field] ?? null) : null,
    })),
  };
};

const findExistingContact = async ({ tenantId, contact, dedupeKeys }) => {
  for (const key of dedupeKeys) {
    if (!contact[key]) continue;
    const existing = await Contact.findOne({ tenantId, [key]: contact[key] });
    if (existing) return { existing, key };
  }
  return { existing: null, key: null };
};

const applySuppressionToConsent = ({ contact, existing = null, suppressionLookup }) => {
  const next = normalizeConsentBlock(existing?.consent, existing ? 'system' : 'import');
  for (const channel of CONSENT_CHANNELS) {
    const imported = contact.consent?.[channel];
    if (imported) next[channel] = imported;
    const field = CHANNEL_ADDRESS_FIELDS[channel];
    const value = contact[field] ?? existing?.[field] ?? null;
    if (value && suppressionLookup.has(`${channel}:${value}`)) {
      next[channel] = {
        status: 'unsubscribed',
        source: 'import',
        changedAt: new Date(),
        metadata: { suppressionStatePreserved: true },
      };
    }
  }
  return next;
};

const syncImportedSuppressions = async ({ contact, tenantId, actor, ip, userAgent }) => {
  const consent = normalizeConsentBlock(contact.consent);
  for (const channel of CONSENT_CHANNELS) {
    if (consent[channel].status !== 'unsubscribed') continue;
    const address = contact[CHANNEL_ADDRESS_FIELDS[channel]];
    if (!address) continue;
    await upsertSuppressionEntry({
      tenantId,
      channel,
      value: address,
      reason:
        channel === 'email' ? 'unsubscribe' : channel === 'sms' ? 'sms_stop' : 'whatsapp_opt_out',
      source: 'import',
      actor,
      metadata: { contactId: contact._id.toString(), source: 'contact_import' },
      ip,
      userAgent,
    });
  }
};

const buildCreatePayload = ({ tenantId, parsed, suppressionLookup }) => ({
  tenantId,
  firstName: parsed.contact.firstName ?? null,
  lastName: parsed.contact.lastName ?? null,
  fullName: computeFullName(parsed.contact),
  email: parsed.contact.email ?? null,
  phone: parsed.contact.phone ?? null,
  whatsappPhone: parsed.contact.whatsappPhone ?? null,
  tags: parsed.contact.tags ?? [],
  groupIds: parsed.contact.groupIds ?? [],
  metadata: parsed.contact.metadata ?? {},
  consent: applySuppressionToConsent({ contact: parsed.contact, suppressionLookup }),
  status: parsed.contact.status ?? 'active',
});

const buildUpdatePayload = ({ parsed, existing, suppressionLookup }) => {
  const updates = {};
  for (const key of ['firstName', 'lastName', 'email', 'phone', 'whatsappPhone']) {
    if (parsed.contact[key] !== undefined) updates[key] = parsed.contact[key];
  }
  if (
    parsed.contact.fullName !== undefined ||
    parsed.contact.firstName !== undefined ||
    parsed.contact.lastName !== undefined
  ) {
    updates.fullName = computeFullName(parsed.contact, existing);
  }
  for (const key of ['tags', 'groupIds', 'metadata', 'status']) {
    if (parsed.contact[key] !== undefined) updates[key] = parsed.contact[key];
  }
  if (
    parsed.contact.consent ||
    parsed.contact.email ||
    parsed.contact.phone ||
    parsed.contact.whatsappPhone
  ) {
    updates.consent = applySuppressionToConsent({
      contact: parsed.contact,
      existing,
      suppressionLookup,
    });
  }
  return updates;
};

const collectSuppressionCandidates = (parsedRows) => {
  const valuesByChannel = { email: [], sms: [], whatsapp: [] };
  for (const parsed of parsedRows) {
    if (parsed.contact.email) valuesByChannel.email.push(parsed.contact.email);
    if (parsed.contact.phone) valuesByChannel.sms.push(parsed.contact.phone);
    if (parsed.contact.whatsappPhone) valuesByChannel.whatsapp.push(parsed.contact.whatsappPhone);
  }
  return valuesByChannel;
};

const processImportJob = async ({ job, tenantId, actor, ip, userAgent }) => {
  const groups = await ContactGroup.find({ tenantId }).select('_id name').lean();
  const groupsById = new Map(groups.map((group) => [group._id.toString(), group]));
  const groupsByName = new Map(groups.map((group) => [group.name.toLowerCase(), group]));
  const parsedRows = job.rows.map((row) => parseImportRow({ job, row, groupsById, groupsByName }));
  const suppressionLookup = await buildSuppressionLookup({
    tenantId,
    valuesByChannel: collectSuppressionCandidates(parsedRows),
  });

  const counts = buildCounts({ totalRows: job.rows.length });
  const errors = [];
  const seenDedupeValues = new Set();
  const dedupeKeys = job.dedupeKeys?.length ? job.dedupeKeys : [...CONTACT_IMPORT_DEDUPE_KEYS];

  for (const parsed of parsedRows) {
    if (parsed.errors.length > 0) {
      counts.rejectedRows += 1;
      errors.push(...parsed.errors);
      continue;
    }

    const duplicateKey = dedupeKeys
      .map((key) => (parsed.contact[key] ? `${key}:${parsed.contact[key]}` : null))
      .find(Boolean);
    if (duplicateKey && seenDedupeValues.has(duplicateKey)) {
      counts.rejectedRows += 1;
      counts.duplicateRows += 1;
      errors.push({
        rowNumber: parsed.rowNumber,
        field: duplicateKey.split(':')[0],
        message: 'Duplicate row in import file',
        value: duplicateKey.split(':').slice(1).join(':'),
      });
      continue;
    }
    if (duplicateKey) seenDedupeValues.add(duplicateKey);

    const { existing, key } = await findExistingContact({
      tenantId,
      contact: parsed.contact,
      dedupeKeys,
    });
    if (existing && job.updateExisting === false) {
      counts.rejectedRows += 1;
      counts.duplicateRows += 1;
      errors.push({
        rowNumber: parsed.rowNumber,
        field: key,
        message: 'A contact already exists for the configured dedupe key',
        value: parsed.contact[key],
      });
      continue;
    }

    if (existing) {
      Object.assign(existing, buildUpdatePayload({ parsed, existing, suppressionLookup }));
      await existing.save();
      await syncImportedSuppressions({ contact: existing, tenantId, actor, ip, userAgent });
      counts.acceptedRows += 1;
      counts.updatedRows += 1;
      continue;
    }

    await assertQuota({ tenantId, quotaKey: QUOTA_KEYS.CONTACTS });
    const created = await Contact.create(
      buildCreatePayload({ tenantId, parsed, suppressionLookup }),
    );
    await syncImportedSuppressions({ contact: created, tenantId, actor, ip, userAgent });
    await recordAuditEvent({
      action: 'contact.created',
      entityType: CONTACT_ENTITY,
      entityId: created._id.toString(),
      userId: actor?.id ?? null,
      tenantId,
      ip,
      userAgent,
      metadata: { source: 'import', importJobId: job._id.toString() },
    });
    counts.acceptedRows += 1;
    counts.createdRows += 1;
  }

  job.counts = counts;
  job.rowErrors = errors;
  job.errorReportGeneratedAt = errors.length ? new Date() : null;
  job.processedAt = new Date();
  job.status = 'completed';
  job.failureMessage = null;
  job.failedAt = null;
  await job.save();
  return job;
};

export const confirmContactImport = async ({
  id,
  tenantId,
  actor,
  ip = null,
  userAgent = null,
}) => {
  const tenant = ensureTenant(tenantId);
  const job = await loadImportJob({ id, tenantId: tenant, includeRows: true });
  if (job.status === 'completed') return toPublicJob(job);
  if (!job.mapping || Object.values(normalizeMapping(job.mapping)).every((value) => !value)) {
    throw new ValidationError('Import mapping is required before confirmation', [
      { path: ['mapping'], message: 'Map at least one contact column' },
    ]);
  }

  job.status = 'processing';
  job.confirmedBy = actor?.id ?? null;
  job.confirmedAt = new Date();
  await job.save();
  await auditImport(IMPORT_AUDIT_ACTIONS.CONFIRMED, {
    job,
    tenantId: tenant,
    actor,
    metadata: { rowCount: job.rows.length },
    ip,
    userAgent,
  });

  try {
    const completed = await processImportJob({ job, tenantId: tenant, actor, ip, userAgent });
    await auditImport(IMPORT_AUDIT_ACTIONS.COMPLETED, {
      job: completed,
      tenantId: tenant,
      actor,
      metadata: completed.counts,
      ip,
      userAgent,
    });
    return toPublicJob(completed);
  } catch (err) {
    job.status = 'failed';
    job.failedAt = new Date();
    job.failureMessage = err?.message ?? 'Contact import failed';
    await job.save();
    await auditImport(IMPORT_AUDIT_ACTIONS.FAILED, {
      job,
      tenantId: tenant,
      actor,
      metadata: { message: job.failureMessage },
      ip,
      userAgent,
    });
    throw err;
  }
};

export const buildContactImportErrorReport = async ({ id, tenantId }) => {
  const tenant = ensureTenant(tenantId);
  const job = await loadImportJob({ id, tenantId: tenant });
  const columns = [
    { key: 'rowNumber', label: 'Row number' },
    { key: 'field', label: 'Field' },
    { key: 'message', label: 'Error' },
    { key: 'value', label: 'Value' },
  ];
  return {
    filename: `contact-import-${job._id.toString()}-errors.csv`,
    body: buildCsv(columns, job.rowErrors ?? []),
  };
};
