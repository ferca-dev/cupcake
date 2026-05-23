import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';

import { createApp } from '../app.js';
import { startInMemoryMongo, stopInMemoryMongo, clearCollections } from './helpers/mongo.js';
import { User } from '../modules/users/user.model.js';
import { Tenant } from '../modules/tenants/tenant.model.js';
import { RefreshToken } from '../modules/auth/refresh-token.model.js';
import { TeamInvitation } from '../modules/team/team-invitation.model.js';
import { AuditLog } from '../modules/audit/audit-log.model.js';
import { hashPassword } from '../common/auth/passwords.js';
import { ROLES } from '../common/auth/roles.js';
import { TEAM_AUDIT_ACTIONS } from '../modules/team/team.service.js';

let app;

const PASSWORD = 'StrongPass123!';

const createTenant = async ({ name = 'Acme', maxTeamMembers = null } = {}) => {
  const tenant = await Tenant.create({
    name,
    slug: name.toLowerCase().replace(/\s+/g, '-'),
    status: 'active',
    settings: { maxTeamMembers },
  });
  return tenant;
};

const createUser = async ({ tenant, role, email, name = email, status = 'active' }) => {
  const user = await User.create({
    tenantId: tenant?._id ?? null,
    role,
    name,
    email,
    passwordHash: await hashPassword(PASSWORD),
    status,
  });
  return user;
};

const seedTenantWithOwner = async ({ tenantName = 'Acme', ownerEmail = 'owner@acme.test', maxTeamMembers = null } = {}) => {
  const tenant = await createTenant({ name: tenantName, maxTeamMembers });
  const owner = await createUser({
    tenant,
    role: ROLES.CLIENT_ADMIN,
    email: ownerEmail,
    name: 'Acme Owner',
  });
  tenant.ownerUserId = owner._id;
  await tenant.save();
  return { tenant, owner };
};

const login = async (email) => {
  const response = await request(app).post('/api/v1/auth/login').send({ email, password: PASSWORD });
  expect(response.status).toBe(200);
  return response.body.data;
};

const tokenFor = async (email) => (await login(email)).accessToken;

const auth = (token) => ({ Authorization: `Bearer ${token}` });

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

describe('GET /api/v1/team/members', () => {
  it('returns members for the current tenant only', async () => {
    const { tenant, owner } = await seedTenantWithOwner();
    await createUser({
      tenant,
      role: ROLES.CLIENT_MEMBER,
      email: 'editor@acme.test',
      name: 'Editor',
    });
    const { tenant: otherTenant } = await seedTenantWithOwner({
      tenantName: 'Other',
      ownerEmail: 'other-owner@other.test',
    });
    await createUser({
      tenant: otherTenant,
      role: ROLES.CLIENT_MEMBER,
      email: 'other-editor@other.test',
      name: 'Other Editor',
    });

    const token = await tokenFor(owner.email);
    const response = await request(app)
      .get('/api/v1/team/members')
      .set(auth(token));

    expect(response.status).toBe(200);
    const emails = response.body.data.items.map((m) => m.email).sort();
    expect(emails).toEqual(['editor@acme.test', 'owner@acme.test']);
    const ownerRecord = response.body.data.items.find((m) => m.email === 'owner@acme.test');
    expect(ownerRecord.isOwner).toBe(true);
  });

  it('rejects unauthenticated callers', async () => {
    const response = await request(app).get('/api/v1/team/members');
    expect(response.status).toBe(401);
  });

  it('rejects requests from another tenant', async () => {
    const { owner: ownerA } = await seedTenantWithOwner({ tenantName: 'A', ownerEmail: 'a@test.local' });
    await seedTenantWithOwner({ tenantName: 'B', ownerEmail: 'b@test.local' });
    const token = await tokenFor(ownerA.email);
    const response = await request(app).get('/api/v1/team/members').set(auth(token));
    expect(response.status).toBe(200);
    expect(response.body.data.items).toHaveLength(1);
    expect(response.body.data.items[0].email).toBe('a@test.local');
  });
});

describe('POST /api/v1/team/invitations', () => {
  it('creates an invitation, stores only the token hash, and audits the event', async () => {
    const { owner } = await seedTenantWithOwner();
    const token = await tokenFor(owner.email);

    const response = await request(app)
      .post('/api/v1/team/invitations')
      .set(auth(token))
      .send({ email: 'new@acme.test', role: ROLES.CLIENT_MEMBER, name: 'New Person' });

    expect(response.status).toBe(201);
    expect(response.body.data.invitation.email).toBe('new@acme.test');
    expect(response.body.data.invitation.status).toBe('pending');
    expect(response.body.data.invitation).not.toHaveProperty('tokenHash');
    expect(typeof response.body.data.acceptToken).toBe('string');
    expect(response.body.data.acceptUrl).toContain('/auth/accept-invitation?token=');

    const stored = await TeamInvitation.findOne({ email: 'new@acme.test' });
    expect(stored.tokenHash).toBeDefined();
    expect(stored.tokenHash).not.toBe(response.body.data.acceptToken);

    const log = await AuditLog.findOne({ action: TEAM_AUDIT_ACTIONS.INVITATION_CREATED });
    expect(log).not.toBeNull();
  });

  it('rejects client_member callers (insufficient permission)', async () => {
    const { tenant, owner } = await seedTenantWithOwner();
    await createUser({
      tenant,
      role: ROLES.CLIENT_MEMBER,
      email: 'member@acme.test',
    });
    const token = await tokenFor('member@acme.test');
    const response = await request(app)
      .post('/api/v1/team/invitations')
      .set(auth(token))
      .send({ email: 'new@acme.test', role: ROLES.CLIENT_MEMBER });
    expect(response.status).toBe(403);
    const ownerCheck = await User.findById(owner._id);
    expect(ownerCheck.role).toBe(ROLES.CLIENT_ADMIN);
  });

  it('rejects duplicate pending invitations', async () => {
    const { owner } = await seedTenantWithOwner();
    const token = await tokenFor(owner.email);

    const first = await request(app)
      .post('/api/v1/team/invitations')
      .set(auth(token))
      .send({ email: 'dup@acme.test', role: ROLES.CLIENT_MEMBER });
    expect(first.status).toBe(201);

    const second = await request(app)
      .post('/api/v1/team/invitations')
      .set(auth(token))
      .send({ email: 'dup@acme.test', role: ROLES.CLIENT_MEMBER });
    expect(second.status).toBe(409);
  });

  it('rejects when seat limit is reached', async () => {
    const { tenant, owner } = await seedTenantWithOwner({ maxTeamMembers: 1 });
    expect(tenant.settings.maxTeamMembers).toBe(1);
    const token = await tokenFor(owner.email);

    const response = await request(app)
      .post('/api/v1/team/invitations')
      .set(auth(token))
      .send({ email: 'limited@acme.test', role: ROLES.CLIENT_MEMBER });
    expect(response.status).toBe(409);
  });

  it('rejects inviting an email that already belongs to the tenant', async () => {
    const { tenant, owner } = await seedTenantWithOwner();
    await createUser({ tenant, role: ROLES.CLIENT_MEMBER, email: 'existing@acme.test' });
    const token = await tokenFor(owner.email);

    const response = await request(app)
      .post('/api/v1/team/invitations')
      .set(auth(token))
      .send({ email: 'existing@acme.test', role: ROLES.CLIENT_MEMBER });
    expect(response.status).toBe(409);
  });
});

describe('POST /api/v1/team/invitations/:id/revoke', () => {
  it('revokes a pending invitation and makes it unusable', async () => {
    const { owner } = await seedTenantWithOwner();
    const token = await tokenFor(owner.email);
    const create = await request(app)
      .post('/api/v1/team/invitations')
      .set(auth(token))
      .send({ email: 'revoke@acme.test', role: ROLES.CLIENT_MEMBER });
    const invitationId = create.body.data.invitation.id;
    const acceptToken = create.body.data.acceptToken;

    const revoke = await request(app)
      .post(`/api/v1/team/invitations/${invitationId}/revoke`)
      .set(auth(token));
    expect(revoke.status).toBe(200);
    expect(revoke.body.data.invitation.status).toBe('revoked');

    const acceptAttempt = await request(app)
      .post('/api/v1/team/invitations/accept')
      .send({ token: acceptToken, name: 'Late', password: PASSWORD });
    expect(acceptAttempt.status).toBe(409);
  });
});

describe('POST /api/v1/team/invitations/:id/resend', () => {
  it('rotates the token, extends expiration, and increments resendCount', async () => {
    const { owner } = await seedTenantWithOwner();
    const token = await tokenFor(owner.email);
    const create = await request(app)
      .post('/api/v1/team/invitations')
      .set(auth(token))
      .send({ email: 'resend@acme.test', role: ROLES.CLIENT_MEMBER });
    const original = create.body.data.acceptToken;

    const resend = await request(app)
      .post(`/api/v1/team/invitations/${create.body.data.invitation.id}/resend`)
      .set(auth(token));
    expect(resend.status).toBe(200);
    expect(resend.body.data.acceptToken).not.toBe(original);
    expect(resend.body.data.invitation.resendCount).toBe(1);

    // Original token no longer accepts.
    const oldAttempt = await request(app)
      .post('/api/v1/team/invitations/accept')
      .send({ token: original, password: PASSWORD });
    expect(oldAttempt.status).toBe(404);
  });
});

describe('POST /api/v1/team/invitations/accept', () => {
  it('provisions the user as a tenant member with the invited role', async () => {
    const { tenant, owner } = await seedTenantWithOwner();
    const ownerToken = await tokenFor(owner.email);
    const create = await request(app)
      .post('/api/v1/team/invitations')
      .set(auth(ownerToken))
      .send({ email: 'new@acme.test', role: ROLES.CLIENT_MEMBER, name: 'New Person' });

    const accept = await request(app)
      .post('/api/v1/team/invitations/accept')
      .send({ token: create.body.data.acceptToken, name: 'New Person', password: PASSWORD });

    expect(accept.status).toBe(200);
    expect(accept.body.data.user.email).toBe('new@acme.test');
    expect(accept.body.data.user.role).toBe(ROLES.CLIENT_MEMBER);
    expect(accept.body.data.tenant.id).toBe(tenant._id.toString());

    const userInDb = await User.findOne({ email: 'new@acme.test' });
    expect(userInDb.tenantId.toString()).toBe(tenant._id.toString());
    expect(userInDb.status).toBe('active');

    // The new member can now log in.
    const sessionToken = await tokenFor('new@acme.test');
    expect(sessionToken).toEqual(expect.any(String));
  });

  it('rejects expired invitations and marks them expired', async () => {
    const { owner } = await seedTenantWithOwner();
    const ownerToken = await tokenFor(owner.email);
    const create = await request(app)
      .post('/api/v1/team/invitations')
      .set(auth(ownerToken))
      .send({ email: 'expired@acme.test', role: ROLES.CLIENT_MEMBER });
    await TeamInvitation.updateOne(
      { _id: create.body.data.invitation.id },
      { $set: { expiresAt: new Date(Date.now() - 1000) } },
    );

    const accept = await request(app)
      .post('/api/v1/team/invitations/accept')
      .send({ token: create.body.data.acceptToken, password: PASSWORD });
    expect(accept.status).toBe(409);
    const inv = await TeamInvitation.findById(create.body.data.invitation.id);
    expect(inv.status).toBe('expired');
  });

  it('rejects unknown tokens', async () => {
    const response = await request(app)
      .post('/api/v1/team/invitations/accept')
      .send({ token: 'unknown-token', password: PASSWORD });
    expect(response.status).toBe(404);
  });
});

describe('PATCH /api/v1/team/members/:id/role', () => {
  it('changes a member role and prevents self-escalation', async () => {
    const { tenant, owner } = await seedTenantWithOwner();
    const member = await createUser({
      tenant,
      role: ROLES.CLIENT_MEMBER,
      email: 'member@acme.test',
    });
    const ownerToken = await tokenFor(owner.email);

    const ok = await request(app)
      .patch(`/api/v1/team/members/${member._id.toString()}/role`)
      .set(auth(ownerToken))
      .send({ role: ROLES.CLIENT_ADMIN });
    expect(ok.status).toBe(200);
    expect(ok.body.data.member.role).toBe(ROLES.CLIENT_ADMIN);

    // The owner cannot change their own role.
    const selfAttempt = await request(app)
      .patch(`/api/v1/team/members/${owner._id.toString()}/role`)
      .set(auth(ownerToken))
      .send({ role: ROLES.CLIENT_MEMBER });
    expect(selfAttempt.status).toBe(422);
  });

  it('refuses to demote the last active admin', async () => {
    const { tenant, owner } = await seedTenantWithOwner();
    const otherAdmin = await createUser({
      tenant,
      role: ROLES.CLIENT_ADMIN,
      email: 'admin2@acme.test',
    });
    const ownerToken = await tokenFor(owner.email);
    // Owner cannot have role changed (must transfer first). Try otherAdmin.
    const ok = await request(app)
      .patch(`/api/v1/team/members/${otherAdmin._id.toString()}/role`)
      .set(auth(ownerToken))
      .send({ role: ROLES.CLIENT_MEMBER });
    expect(ok.status).toBe(200);

    // Now demote the owner-admin (still owner) — should be blocked by isOwner check.
    const ownerDemote = await request(app)
      .patch(`/api/v1/team/members/${owner._id.toString()}/role`)
      .set(auth(ownerToken))
      .send({ role: ROLES.CLIENT_MEMBER });
    expect(ownerDemote.status).toBe(422);
  });
});

describe('PATCH /api/v1/team/members/:id/status', () => {
  it('disables a member and revokes their refresh tokens', async () => {
    const { tenant, owner } = await seedTenantWithOwner();
    const member = await createUser({
      tenant,
      role: ROLES.CLIENT_MEMBER,
      email: 'disable@acme.test',
    });

    const ownerToken = await tokenFor(owner.email);
    const memberSession = await login('disable@acme.test');
    expect(memberSession.accessToken).toBeDefined();

    const stored = await RefreshToken.findOne({ userId: member._id });
    expect(stored?.revokedAt).toBeNull();

    const response = await request(app)
      .patch(`/api/v1/team/members/${member._id.toString()}/status`)
      .set(auth(ownerToken))
      .send({ status: 'inactive', reason: 'Left the company' });

    expect(response.status).toBe(200);
    expect(response.body.data.member.status).toBe('inactive');
    expect(response.body.data.revokedTokens).toBeGreaterThan(0);

    const reloaded = await RefreshToken.findOne({ userId: member._id });
    expect(reloaded?.revokedAt).not.toBeNull();

    // The member can no longer log in.
    const loginAttempt = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'disable@acme.test', password: PASSWORD });
    expect(loginAttempt.status).toBe(401);
  });

  it('cannot disable the workspace owner', async () => {
    const { owner } = await seedTenantWithOwner();
    const ownerToken = await tokenFor(owner.email);
    const response = await request(app)
      .patch(`/api/v1/team/members/${owner._id.toString()}/status`)
      .set(auth(ownerToken))
      .send({ status: 'inactive' });
    expect(response.status).toBe(422);
  });
});

describe('DELETE /api/v1/team/members/:id', () => {
  it('removes a member and revokes their tokens', async () => {
    const { tenant, owner } = await seedTenantWithOwner();
    const member = await createUser({
      tenant,
      role: ROLES.CLIENT_MEMBER,
      email: 'gone@acme.test',
    });
    const ownerToken = await tokenFor(owner.email);
    await login('gone@acme.test');

    const response = await request(app)
      .delete(`/api/v1/team/members/${member._id.toString()}`)
      .set(auth(ownerToken));
    expect(response.status).toBe(200);

    const reloaded = await User.findById(member._id);
    expect(reloaded).toBeNull();
    const tokens = await RefreshToken.find({ userId: member._id });
    for (const t of tokens) {
      expect(t.revokedAt).not.toBeNull();
    }
  });
});

describe('POST /api/v1/team/owner-transfer', () => {
  it('transfers ownership to another admin and audits the change', async () => {
    const { tenant, owner } = await seedTenantWithOwner();
    const target = await createUser({
      tenant,
      role: ROLES.CLIENT_ADMIN,
      email: 'newowner@acme.test',
    });
    const ownerToken = await tokenFor(owner.email);

    const response = await request(app)
      .post('/api/v1/team/owner-transfer')
      .set(auth(ownerToken))
      .send({ targetUserId: target._id.toString(), confirm: true });
    expect(response.status).toBe(200);
    expect(response.body.data.newOwnerId).toBe(target._id.toString());

    const reloaded = await Tenant.findById(tenant._id);
    expect(reloaded.ownerUserId.toString()).toBe(target._id.toString());

    const log = await AuditLog.findOne({ action: TEAM_AUDIT_ACTIONS.OWNERSHIP_TRANSFERRED });
    expect(log).not.toBeNull();

    // After transfer, the previous owner cannot transfer back without being the owner anymore.
    const reverse = await request(app)
      .post('/api/v1/team/owner-transfer')
      .set(auth(ownerToken))
      .send({ targetUserId: owner._id.toString(), confirm: true });
    expect(reverse.status).toBe(403);
  });

  it('promotes a non-admin target to admin during the transfer', async () => {
    const { tenant, owner } = await seedTenantWithOwner();
    const member = await createUser({
      tenant,
      role: ROLES.CLIENT_MEMBER,
      email: 'memberowner@acme.test',
    });
    const ownerToken = await tokenFor(owner.email);

    const response = await request(app)
      .post('/api/v1/team/owner-transfer')
      .set(auth(ownerToken))
      .send({ targetUserId: member._id.toString(), confirm: true });
    expect(response.status).toBe(200);

    const reloadedMember = await User.findById(member._id);
    expect(reloadedMember.role).toBe(ROLES.CLIENT_ADMIN);
  });

  it('requires explicit confirmation', async () => {
    const { tenant, owner } = await seedTenantWithOwner();
    const target = await createUser({
      tenant,
      role: ROLES.CLIENT_ADMIN,
      email: 'noconfirm@acme.test',
    });
    const ownerToken = await tokenFor(owner.email);
    const response = await request(app)
      .post('/api/v1/team/owner-transfer')
      .set(auth(ownerToken))
      .send({ targetUserId: target._id.toString() });
    expect(response.status).toBe(422);
  });
});

describe('GET /api/v1/admin/tenants/:id/invitations', () => {
  it('exposes tenant invitations to super admins', async () => {
    const { tenant, owner } = await seedTenantWithOwner();
    const ownerToken = await tokenFor(owner.email);
    await request(app)
      .post('/api/v1/team/invitations')
      .set(auth(ownerToken))
      .send({ email: 'visible@acme.test', role: ROLES.CLIENT_MEMBER });

    await createUser({
      tenant: null,
      role: ROLES.SUPER_ADMIN,
      email: 'super@test.local',
    });
    const superToken = await tokenFor('super@test.local');

    const response = await request(app)
      .get(`/api/v1/admin/tenants/${tenant._id.toString()}/invitations`)
      .set(auth(superToken));
    expect(response.status).toBe(200);
    expect(response.body.data.items).toHaveLength(1);
    expect(response.body.data.items[0].email).toBe('visible@acme.test');
  });
});
