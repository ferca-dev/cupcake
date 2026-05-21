import { Tenant } from '../modules/tenants/tenant.model.js';
import { Contact } from '../modules/contacts/contact.model.js';
import { ContactGroup } from '../modules/contacts/contact-group.model.js';
import { slugify } from '../common/utils/slug.js';
import { logger } from '../common/utils/logger.js';
import { loadEnv } from '../config/env.js';

const GROUP_DEFINITIONS = [
  {
    name: 'Customers',
    description: 'Active demo customers used for marketing campaigns.',
  },
  {
    name: 'Leads',
    description: 'Prospects captured from public forms.',
  },
  {
    name: 'VIPs',
    description: 'High-value contacts that receive priority outreach.',
  },
];

const CONTACT_DEFINITIONS = [
  {
    firstName: 'Ada',
    lastName: 'Lovelace',
    email: 'ada@example.com',
    phone: '+15551112233',
    whatsappPhone: '+15551112233',
    tags: ['vip', 'engineering'],
    groups: ['Customers', 'VIPs'],
  },
  {
    firstName: 'Grace',
    lastName: 'Hopper',
    email: 'grace@example.com',
    phone: null,
    whatsappPhone: null,
    tags: ['legacy'],
    groups: ['Customers'],
  },
  {
    firstName: 'Linus',
    lastName: 'Torvalds',
    email: null,
    phone: '+15554445566',
    whatsappPhone: null,
    tags: ['ops'],
    groups: ['Leads'],
  },
  {
    firstName: 'Margaret',
    lastName: 'Hamilton',
    email: null,
    phone: null,
    whatsappPhone: '+15557778899',
    tags: ['research'],
    groups: ['Leads', 'VIPs'],
  },
  {
    firstName: 'Edsger',
    lastName: 'Dijkstra',
    email: 'edsger@example.com',
    phone: null,
    whatsappPhone: null,
    tags: [],
    groups: [],
    status: 'archived',
  },
];

const ensureGroup = async ({ tenantId, name, description }) => {
  let group = await ContactGroup.findOne({ tenantId, name });
  if (!group) {
    group = await ContactGroup.create({
      tenantId,
      name,
      description,
      status: 'active',
    });
  }
  return group;
};

const ensureContact = async ({ tenantId, groupsByName, definition }) => {
  const queryFilter = { tenantId };
  if (definition.email) queryFilter.email = definition.email.toLowerCase();
  else queryFilter.fullName = `${definition.firstName} ${definition.lastName}`.trim();

  let contact = await Contact.findOne(queryFilter);
  const groupIds = definition.groups
    .map((groupName) => groupsByName.get(groupName)?._id)
    .filter(Boolean);
  const fullName = `${definition.firstName ?? ''} ${definition.lastName ?? ''}`.trim() || null;

  if (!contact) {
    contact = await Contact.create({
      tenantId,
      firstName: definition.firstName ?? null,
      lastName: definition.lastName ?? null,
      fullName,
      email: definition.email ? definition.email.toLowerCase() : null,
      phone: definition.phone ?? null,
      whatsappPhone: definition.whatsappPhone ?? null,
      tags: definition.tags ?? [],
      groupIds,
      metadata: {},
      status: definition.status ?? 'active',
    });
    return { contact, created: true };
  }

  let dirty = false;
  if ((contact.fullName ?? null) !== fullName) {
    contact.fullName = fullName;
    dirty = true;
  }
  if ((contact.tags ?? []).join(',') !== (definition.tags ?? []).join(',')) {
    contact.tags = definition.tags ?? [];
    dirty = true;
  }
  const existingGroupIds = (contact.groupIds ?? []).map((id) => id.toString()).sort();
  const targetGroupIds = groupIds.map((id) => id.toString()).sort();
  if (existingGroupIds.join(',') !== targetGroupIds.join(',')) {
    contact.groupIds = groupIds;
    dirty = true;
  }
  if ((contact.status ?? 'active') !== (definition.status ?? 'active')) {
    contact.status = definition.status ?? 'active';
    dirty = true;
  }
  if (dirty) await contact.save();
  return { contact, created: false };
};

/**
 * Seeds the demo tenant with reusable groups and contacts. Intentionally
 * includes incomplete records (no email, no phone) so the channel-eligibility
 * UI has realistic examples to render.
 */
export const seedContacts = async () => {
  const env = loadEnv();
  const tenantSlug = slugify(env.DEMO_TENANT_NAME);
  const tenant =
    (await Tenant.findOne({ slug: tenantSlug })) ??
    (await Tenant.findOne({ name: env.DEMO_TENANT_NAME }));
  if (!tenant) {
    logger.warn('Demo tenant missing — run seed-auth first');
    return { groups: [], contacts: [] };
  }

  const groupsByName = new Map();
  for (const definition of GROUP_DEFINITIONS) {
    const group = await ensureGroup({ tenantId: tenant._id, ...definition });
    groupsByName.set(group.name, group);
  }

  const contactsReport = [];
  for (const definition of CONTACT_DEFINITIONS) {
    const { contact, created } = await ensureContact({
      tenantId: tenant._id,
      groupsByName,
      definition,
    });
    contactsReport.push({
      id: contact._id.toString(),
      email: contact.email,
      created,
    });
  }

  logger.info(
    {
      tenantId: tenant._id.toString(),
      groups: [...groupsByName.values()].map((g) => ({
        id: g._id.toString(),
        name: g.name,
      })),
      contacts: contactsReport,
    },
    'Contacts seed complete',
  );

  return {
    groups: [...groupsByName.values()],
    contacts: contactsReport,
  };
};
