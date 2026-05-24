import mongoose from 'mongoose';

import { Contact } from './contact.model.js';
import { ContactGroup } from './contact-group.model.js';
import { tenantFilter } from './contact.repository.js';
import { AuthorizationError } from '../../common/errors/index.js';
import { buildXlsx } from '../../common/utils/tabular-export.js';
import { buildCsv } from '../reports/report.csv.js';

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const ensureTenant = (tenantId) => {
  if (!tenantId) throw new AuthorizationError('Tenant context is required');
  return tenantId.toString();
};

const buildContactExportFilter = ({ tenantId, query }) => {
  const filter = tenantFilter({}, tenantId);
  if (query.status) filter.status = query.status;
  if (query.groupId) filter.groupIds = query.groupId;
  if (query.tag) filter.tags = query.tag;
  if (query.email) filter.email = String(query.email).toLowerCase();
  if (query.phone) filter.phone = query.phone;
  if (query.whatsappPhone) filter.whatsappPhone = query.whatsappPhone;
  if (query.channel === 'email') filter.email = mongoose.trusted({ $nin: [null, ''] });
  if (query.channel === 'phone') filter.phone = mongoose.trusted({ $nin: [null, ''] });
  if (query.channel === 'whatsapp') {
    filter.whatsappPhone = mongoose.trusted({ $nin: [null, ''] });
  }
  if (query.search) {
    const rx = new RegExp(escapeRegex(query.search), 'i');
    filter.$or = [
      { fullName: rx },
      { firstName: rx },
      { lastName: rx },
      { email: rx },
      { phone: rx },
      { whatsappPhone: rx },
      { tags: rx },
    ];
  }
  return filter;
};

const stringifyJson = (value) => {
  if (value === null || value === undefined) return '';
  try {
    return JSON.stringify(value);
  } catch {
    return '';
  }
};

const buildColumns = () => [
  { key: 'id', label: 'Contact ID' },
  { key: 'fullName', label: 'Full name' },
  { key: 'firstName', label: 'First name' },
  { key: 'lastName', label: 'Last name' },
  { key: 'email', label: 'Email' },
  { key: 'phone', label: 'Phone' },
  { key: 'whatsappPhone', label: 'WhatsApp phone' },
  { key: 'tags', label: 'Tags' },
  { key: 'groups', label: 'Groups' },
  { key: 'metadata', label: 'Metadata' },
  { key: 'status', label: 'Status' },
  { key: 'emailConsent', label: 'Email consent' },
  { key: 'smsConsent', label: 'SMS consent' },
  { key: 'whatsappConsent', label: 'WhatsApp consent' },
  { key: 'emailConsentSource', label: 'Email consent source' },
  { key: 'smsConsentSource', label: 'SMS consent source' },
  { key: 'whatsappConsentSource', label: 'WhatsApp consent source' },
  { key: 'createdAt', label: 'Created at' },
  { key: 'updatedAt', label: 'Updated at' },
];

const toRows = ({ contacts, groupNameById }) =>
  contacts.map((contact) => ({
    id: contact._id.toString(),
    fullName: contact.fullName ?? '',
    firstName: contact.firstName ?? '',
    lastName: contact.lastName ?? '',
    email: contact.email ?? '',
    phone: contact.phone ?? '',
    whatsappPhone: contact.whatsappPhone ?? '',
    tags: (contact.tags ?? []).join('; '),
    groups: (contact.groupIds ?? [])
      .map((id) => groupNameById.get(id.toString()) ?? id.toString())
      .join('; '),
    metadata: stringifyJson(contact.metadata ?? {}),
    status: contact.status,
    emailConsent: contact.consent?.email?.status ?? '',
    smsConsent: contact.consent?.sms?.status ?? '',
    whatsappConsent: contact.consent?.whatsapp?.status ?? '',
    emailConsentSource: contact.consent?.email?.source ?? '',
    smsConsentSource: contact.consent?.sms?.source ?? '',
    whatsappConsentSource: contact.consent?.whatsapp?.source ?? '',
    createdAt: contact.createdAt ? new Date(contact.createdAt).toISOString() : '',
    updatedAt: contact.updatedAt ? new Date(contact.updatedAt).toISOString() : '',
  }));

export const buildContactExport = async ({ tenantId, query = {} }) => {
  const tenant = ensureTenant(tenantId);
  const format = query.format ?? 'csv';
  const limit = query.limit ?? 50000;
  const filter = buildContactExportFilter({ tenantId: tenant, query });
  const contacts = await Contact.find(filter)
    .sort(query.sort ?? '-updatedAt')
    .limit(limit)
    .lean();
  const groupIds = [
    ...new Set(contacts.flatMap((contact) => (contact.groupIds ?? []).map((id) => id.toString()))),
  ];
  const groups = groupIds.length
    ? await ContactGroup.find({ tenantId: tenant, _id: mongoose.trusted({ $in: groupIds }) })
        .select('_id name')
        .lean()
    : [];
  const groupNameById = new Map(groups.map((group) => [group._id.toString(), group.name]));
  const columns = buildColumns();
  const rows = toRows({ contacts, groupNameById });
  const timestamp = Date.now();

  if (format === 'xlsx') {
    return {
      format,
      filename: `contacts-${timestamp}.xlsx`,
      body: buildXlsx(columns, rows, { sheetName: 'Contacts' }),
    };
  }

  return {
    format: 'csv',
    filename: `contacts-${timestamp}.csv`,
    body: buildCsv(columns, rows),
  };
};
