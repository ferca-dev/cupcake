import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';

import { createApp } from '../app.js';
import { startInMemoryMongo, stopInMemoryMongo, clearCollections } from './helpers/mongo.js';
import { User } from '../modules/users/user.model.js';
import { Tenant } from '../modules/tenants/tenant.model.js';
import { Contact } from '../modules/contacts/contact.model.js';
import { ContactGroup } from '../modules/contacts/contact-group.model.js';
import { hashPassword } from '../common/auth/passwords.js';
import { ROLES } from '../common/auth/roles.js';

let app;

const password = 'StrongPass123!';

const createTenantWithAdmin = async ({ tenantName, email, role = ROLES.CLIENT_ADMIN } = {}) => {
  const tenant = await Tenant.create({
    name: tenantName,
    slug: tenantName.toLowerCase().replace(/\s+/g, '-'),
    status: 'active',
  });
  const user = await User.create({
    tenantId: tenant._id,
    role,
    name: `${tenantName} Admin`,
    email,
    passwordHash: await hashPassword(password),
    status: 'active',
  });
  tenant.ownerUserId = user._id;
  await tenant.save();
  return { tenant, user };
};

const login = async (email) => {
  const response = await request(app).post('/api/v1/auth/login').send({ email, password });
  expect(response.status).toBe(200);
  return response.body.data.accessToken;
};

beforeAll(async () => {
  await startInMemoryMongo();
  app = createApp();
});

afterAll(async () => {
  await stopInMemoryMongo();
});

beforeEach(async () => {
  await clearCollections();
});

describe('POST /api/v1/contacts', () => {
  it('creates a contact with email only and normalises the address', async () => {
    const { tenant } = await createTenantWithAdmin({
      tenantName: 'Acme',
      email: 'acme@test.local',
    });
    const token = await login('acme@test.local');

    const response = await request(app)
      .post('/api/v1/contacts')
      .set('Authorization', `Bearer ${token}`)
      .send({
        firstName: 'Ada',
        lastName: 'Lovelace',
        email: '  ADA@example.COM ',
      });

    expect(response.status).toBe(201);
    expect(response.body.data.contact.email).toBe('ada@example.com');
    expect(response.body.data.contact.tenantId).toBe(tenant._id.toString());
    expect(response.body.data.contact.fullName).toBe('Ada Lovelace');
    expect(response.body.data.contact.channels.email.ready).toBe(true);
    expect(response.body.data.contact.channels.phone.reason).toBe('missing_phone');
  });

  it('creates a contact with phone only', async () => {
    await createTenantWithAdmin({ tenantName: 'Acme', email: 'acme@test.local' });
    const token = await login('acme@test.local');

    const response = await request(app)
      .post('/api/v1/contacts')
      .set('Authorization', `Bearer ${token}`)
      .send({ firstName: 'Grace', phone: '(555) 111-2233' });

    expect(response.status).toBe(201);
    expect(response.body.data.contact.phone).toBe('5551112233');
    expect(response.body.data.contact.channels.phone.ready).toBe(true);
  });

  it('creates a contact with whatsapp only and preserves the + sign', async () => {
    await createTenantWithAdmin({ tenantName: 'Acme', email: 'acme@test.local' });
    const token = await login('acme@test.local');

    const response = await request(app)
      .post('/api/v1/contacts')
      .set('Authorization', `Bearer ${token}`)
      .send({ firstName: 'Linus', whatsappPhone: '+1 (555) 444-5566' });

    expect(response.status).toBe(201);
    expect(response.body.data.contact.whatsappPhone).toBe('+15554445566');
    expect(response.body.data.contact.channels.whatsapp_phone.ready).toBe(true);
  });

  it('rejects a contact without any channel', async () => {
    await createTenantWithAdmin({ tenantName: 'Acme', email: 'acme@test.local' });
    const token = await login('acme@test.local');

    const response = await request(app)
      .post('/api/v1/contacts')
      .set('Authorization', `Bearer ${token}`)
      .send({ firstName: 'Nobody' });

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(response.body.error.details.some((d) => d.path.includes('email'))).toBe(true);
  });

  it('rejects invalid email and phone formats', async () => {
    await createTenantWithAdmin({ tenantName: 'Acme', email: 'acme@test.local' });
    const token = await login('acme@test.local');

    const badEmail = await request(app)
      .post('/api/v1/contacts')
      .set('Authorization', `Bearer ${token}`)
      .send({ email: 'not-an-email' });
    expect(badEmail.status).toBe(422);

    const badPhone = await request(app)
      .post('/api/v1/contacts')
      .set('Authorization', `Bearer ${token}`)
      .send({ phone: '123' });
    expect(badPhone.status).toBe(422);
  });

  it('rejects unauthenticated callers', async () => {
    const response = await request(app)
      .post('/api/v1/contacts')
      .send({ email: 'anon@example.com' });
    expect(response.status).toBe(401);
  });
});

describe('Tenant isolation for contacts', () => {
  it('does not return contacts belonging to other tenants', async () => {
    const acme = await createTenantWithAdmin({
      tenantName: 'Acme',
      email: 'acme@test.local',
    });
    const beta = await createTenantWithAdmin({
      tenantName: 'Beta',
      email: 'beta@test.local',
    });
    await Contact.create({
      tenantId: acme.tenant._id,
      fullName: 'Acme Person',
      email: 'acme-person@example.com',
      status: 'active',
    });
    const betaContact = await Contact.create({
      tenantId: beta.tenant._id,
      fullName: 'Beta Person',
      email: 'beta-person@example.com',
      status: 'active',
    });

    const token = await login('acme@test.local');
    const list = await request(app).get('/api/v1/contacts').set('Authorization', `Bearer ${token}`);
    expect(list.status).toBe(200);
    expect(list.body.data.items).toHaveLength(1);
    expect(list.body.data.items[0].fullName).toBe('Acme Person');

    const cross = await request(app)
      .get(`/api/v1/contacts/${betaContact._id.toString()}`)
      .set('Authorization', `Bearer ${token}`);
    expect(cross.status).toBe(404);
  });

  it('refuses cross-tenant group association', async () => {
    const acme = await createTenantWithAdmin({
      tenantName: 'Acme',
      email: 'acme@test.local',
    });
    const beta = await createTenantWithAdmin({
      tenantName: 'Beta',
      email: 'beta@test.local',
    });
    const betaGroup = await ContactGroup.create({
      tenantId: beta.tenant._id,
      name: 'Beta group',
    });

    const acmeToken = await login('acme@test.local');
    const response = await request(app)
      .post('/api/v1/contacts')
      .set('Authorization', `Bearer ${acmeToken}`)
      .send({
        email: 'isolated@example.com',
        groupIds: [betaGroup._id.toString()],
      });
    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');

    // No leak from contact assignment to a foreign group either.
    const contactBeta = await Contact.create({
      tenantId: beta.tenant._id,
      email: 'beta-contact@example.com',
      status: 'active',
    });
    const addToGroup = await request(app)
      .post(`/api/v1/contact-groups/${betaGroup._id.toString()}/contacts`)
      .set('Authorization', `Bearer ${acmeToken}`)
      .send({ contactId: contactBeta._id.toString() });
    expect(addToGroup.status).toBe(404);

    // Reuse acme variable to silence linter unused-variable warnings.
    expect(acme.tenant._id.toString()).not.toBe(beta.tenant._id.toString());
  });
});

describe('GET /api/v1/contacts filtering', () => {
  it('filters by status, channel, tag, group, and search', async () => {
    const { tenant } = await createTenantWithAdmin({
      tenantName: 'Acme',
      email: 'acme@test.local',
    });
    const customers = await ContactGroup.create({
      tenantId: tenant._id,
      name: 'Customers',
    });
    await Contact.create({
      tenantId: tenant._id,
      firstName: 'Ada',
      fullName: 'Ada Lovelace',
      email: 'ada@example.com',
      status: 'active',
      tags: ['vip'],
      groupIds: [customers._id],
    });
    await Contact.create({
      tenantId: tenant._id,
      firstName: 'Grace',
      fullName: 'Grace Hopper',
      phone: '5551112233',
      status: 'archived',
      tags: ['legacy'],
    });
    await Contact.create({
      tenantId: tenant._id,
      firstName: 'Linus',
      fullName: 'Linus Torvalds',
      whatsappPhone: '+15554445566',
      status: 'active',
    });

    const token = await login('acme@test.local');

    const search = await request(app)
      .get('/api/v1/contacts')
      .query({ search: 'lovelace' })
      .set('Authorization', `Bearer ${token}`);
    expect(search.status).toBe(200);
    expect(search.body.data.items).toHaveLength(1);
    expect(search.body.data.items[0].firstName).toBe('Ada');

    const archived = await request(app)
      .get('/api/v1/contacts')
      .query({ status: 'archived' })
      .set('Authorization', `Bearer ${token}`);
    expect(archived.body.data.items).toHaveLength(1);
    expect(archived.body.data.items[0].firstName).toBe('Grace');

    const byTag = await request(app)
      .get('/api/v1/contacts')
      .query({ tag: 'vip' })
      .set('Authorization', `Bearer ${token}`);
    expect(byTag.body.data.items).toHaveLength(1);
    expect(byTag.body.data.items[0].firstName).toBe('Ada');

    const byGroup = await request(app)
      .get('/api/v1/contacts')
      .query({ groupId: customers._id.toString() })
      .set('Authorization', `Bearer ${token}`);
    expect(byGroup.body.data.items).toHaveLength(1);

    const whatsappOnly = await request(app)
      .get('/api/v1/contacts')
      .query({ channel: 'whatsapp', status: 'active' })
      .set('Authorization', `Bearer ${token}`);
    expect(whatsappOnly.body.data.items).toHaveLength(1);
    expect(whatsappOnly.body.data.items[0].firstName).toBe('Linus');
  });
});

describe('PUT /api/v1/contacts/:id', () => {
  it('updates fields and recomputes full name', async () => {
    const { tenant } = await createTenantWithAdmin({
      tenantName: 'Acme',
      email: 'acme@test.local',
    });
    const contact = await Contact.create({
      tenantId: tenant._id,
      firstName: 'Ada',
      lastName: 'Lovelace',
      fullName: 'Ada Lovelace',
      email: 'ada@example.com',
      status: 'active',
    });
    const token = await login('acme@test.local');

    const response = await request(app)
      .put(`/api/v1/contacts/${contact._id.toString()}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ lastName: 'Byron', tags: ['updated'] });
    expect(response.status).toBe(200);
    expect(response.body.data.contact.fullName).toBe('Ada Byron');
    expect(response.body.data.contact.tags).toEqual(['updated']);
  });

  it('blocks updates that would leave the contact unreachable', async () => {
    const { tenant } = await createTenantWithAdmin({
      tenantName: 'Acme',
      email: 'acme@test.local',
    });
    const contact = await Contact.create({
      tenantId: tenant._id,
      email: 'reachable@example.com',
      status: 'active',
    });
    const token = await login('acme@test.local');

    const response = await request(app)
      .put(`/api/v1/contacts/${contact._id.toString()}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ email: null });
    expect(response.status).toBe(422);
  });
});

describe('DELETE /api/v1/contacts/:id', () => {
  it('soft-archives by default', async () => {
    const { tenant } = await createTenantWithAdmin({
      tenantName: 'Acme',
      email: 'acme@test.local',
    });
    const contact = await Contact.create({
      tenantId: tenant._id,
      email: 'soft@example.com',
      status: 'active',
    });
    const token = await login('acme@test.local');

    const response = await request(app)
      .delete(`/api/v1/contacts/${contact._id.toString()}`)
      .set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(200);
    expect(response.body.data.mode).toBe('soft');
    const reloaded = await Contact.findById(contact._id);
    expect(reloaded.status).toBe('archived');
  });

  it('hard-deletes when ?hard=true is supplied', async () => {
    const { tenant } = await createTenantWithAdmin({
      tenantName: 'Acme',
      email: 'acme@test.local',
    });
    const contact = await Contact.create({
      tenantId: tenant._id,
      email: 'hard@example.com',
      status: 'active',
    });
    const token = await login('acme@test.local');

    const response = await request(app)
      .delete(`/api/v1/contacts/${contact._id.toString()}?hard=true`)
      .set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(200);
    expect(response.body.data.mode).toBe('hard');
    expect(await Contact.findById(contact._id)).toBeNull();
  });
});

describe('Contact groups CRUD and membership', () => {
  it('creates, updates, and deletes a group and pulls members on delete', async () => {
    const { tenant } = await createTenantWithAdmin({
      tenantName: 'Acme',
      email: 'acme@test.local',
    });
    const token = await login('acme@test.local');

    const created = await request(app)
      .post('/api/v1/contact-groups')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Customers', description: 'Paying customers.' });
    expect(created.status).toBe(201);
    const groupId = created.body.data.group.id;

    const contact = await Contact.create({
      tenantId: tenant._id,
      email: 'member@example.com',
      status: 'active',
      groupIds: [groupId],
    });

    const updated = await request(app)
      .put(`/api/v1/contact-groups/${groupId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ description: 'Updated description' });
    expect(updated.status).toBe(200);
    expect(updated.body.data.group.description).toBe('Updated description');

    const removed = await request(app)
      .delete(`/api/v1/contact-groups/${groupId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(removed.status).toBe(200);
    const reloaded = await Contact.findById(contact._id);
    expect(reloaded.groupIds.map((id) => id.toString())).not.toContain(groupId);
  });

  it('rejects duplicate group names within the same tenant', async () => {
    await createTenantWithAdmin({ tenantName: 'Acme', email: 'acme@test.local' });
    const token = await login('acme@test.local');

    const first = await request(app)
      .post('/api/v1/contact-groups')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Customers' });
    expect(first.status).toBe(201);

    const conflict = await request(app)
      .post('/api/v1/contact-groups')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Customers' });
    expect(conflict.status).toBe(409);
  });

  it('adds and removes a contact from a group', async () => {
    const { tenant } = await createTenantWithAdmin({
      tenantName: 'Acme',
      email: 'acme@test.local',
    });
    const group = await ContactGroup.create({
      tenantId: tenant._id,
      name: 'Customers',
    });
    const contact = await Contact.create({
      tenantId: tenant._id,
      email: 'member@example.com',
      status: 'active',
    });
    const token = await login('acme@test.local');

    const added = await request(app)
      .post(`/api/v1/contact-groups/${group._id.toString()}/contacts`)
      .set('Authorization', `Bearer ${token}`)
      .send({ contactId: contact._id.toString() });
    expect(added.status).toBe(200);
    expect(added.body.data.group.contactCount).toBe(1);
    const reloaded = await Contact.findById(contact._id);
    expect(reloaded.groupIds.map((id) => id.toString())).toContain(group._id.toString());

    const removed = await request(app)
      .delete(`/api/v1/contact-groups/${group._id.toString()}/contacts/${contact._id.toString()}`)
      .set('Authorization', `Bearer ${token}`);
    expect(removed.status).toBe(200);
    expect(removed.body.data.group.contactCount).toBe(0);
  });
});

describe('Import placeholder endpoints', () => {
  it('returns a structured pending response without faking a completed import', async () => {
    await createTenantWithAdmin({ tenantName: 'Acme', email: 'acme@test.local' });
    const token = await login('acme@test.local');

    const requested = await request(app)
      .post('/api/v1/contacts/import')
      .set('Authorization', `Bearer ${token}`)
      .send({ source: 'csv', note: 'Phase 09 work pending' });
    expect(requested.status).toBe(202);
    expect(requested.body.data.job.status).toBe('pending_implementation');
    const jobId = requested.body.data.job.id;

    const report = await request(app)
      .get(`/api/v1/contacts/imports/${jobId}/report`)
      .set('Authorization', `Bearer ${token}`);
    expect(report.status).toBe(200);
    expect(report.body.data.report.placeholder).toBe(true);
    expect(report.body.data.report.summary.total).toBe(0);
  });
});
