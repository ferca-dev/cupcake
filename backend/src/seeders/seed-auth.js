import { User } from '../modules/users/user.model.js';
import { Tenant } from '../modules/tenants/tenant.model.js';
import { hashPassword } from '../common/auth/passwords.js';
import { ROLES } from '../common/auth/roles.js';
import { slugify, uniqueSlug } from '../common/utils/slug.js';
import { logger } from '../common/utils/logger.js';
import { loadEnv } from '../config/env.js';

/**
 * Idempotently provisions the super admin, the demo tenant, and the demo
 * client admin. Re-running this seeder updates the matched documents in
 * place without creating duplicates.
 */
export const seedAuth = async () => {
  const env = loadEnv();
  const report = { superAdmin: null, tenant: null, demoClient: null };

  // --- Super admin --------------------------------------------------------
  const superAdminEmail = env.SUPER_ADMIN_EMAIL.toLowerCase();
  let superAdmin = await User.findOne({ email: superAdminEmail }).select('+passwordHash');

  if (!superAdmin) {
    const passwordHash = await hashPassword(env.SUPER_ADMIN_PASSWORD);
    superAdmin = await User.create({
      tenantId: null,
      role: ROLES.SUPER_ADMIN,
      name: env.SUPER_ADMIN_NAME,
      email: superAdminEmail,
      passwordHash,
      status: 'active',
      emailVerifiedAt: new Date(),
    });
    report.superAdmin = { id: superAdmin._id.toString(), created: true };
  } else {
    let dirty = false;
    if (superAdmin.role !== ROLES.SUPER_ADMIN) {
      superAdmin.role = ROLES.SUPER_ADMIN;
      dirty = true;
    }
    if (superAdmin.tenantId) {
      superAdmin.tenantId = null;
      dirty = true;
    }
    if (superAdmin.status !== 'active') {
      superAdmin.status = 'active';
      dirty = true;
    }
    if (superAdmin.name !== env.SUPER_ADMIN_NAME) {
      superAdmin.name = env.SUPER_ADMIN_NAME;
      dirty = true;
    }
    if (dirty) await superAdmin.save();
    report.superAdmin = { id: superAdmin._id.toString(), created: false };
  }

  // --- Demo tenant --------------------------------------------------------
  const desiredSlug = slugify(env.DEMO_TENANT_NAME);
  let tenant = await Tenant.findOne({ slug: desiredSlug });
  if (!tenant) {
    tenant = await Tenant.findOne({ name: env.DEMO_TENANT_NAME });
  }

  if (!tenant) {
    const slug = await uniqueSlug(env.DEMO_TENANT_NAME, async (candidate) => {
      const found = await Tenant.exists({ slug: candidate });
      return Boolean(found);
    });
    tenant = await Tenant.create({
      name: env.DEMO_TENANT_NAME,
      slug,
      status: 'active',
    });
    report.tenant = { id: tenant._id.toString(), created: true };
  } else {
    let dirty = false;
    if (tenant.status !== 'active') {
      tenant.status = 'active';
      dirty = true;
    }
    if (dirty) await tenant.save();
    report.tenant = { id: tenant._id.toString(), created: false };
  }

  // --- Demo client admin --------------------------------------------------
  const demoEmail = env.DEMO_CLIENT_EMAIL.toLowerCase();
  let demoClient = await User.findOne({ email: demoEmail }).select('+passwordHash');

  if (!demoClient) {
    const passwordHash = await hashPassword(env.DEMO_CLIENT_PASSWORD);
    demoClient = await User.create({
      tenantId: tenant._id,
      role: ROLES.CLIENT_ADMIN,
      name: env.DEMO_CLIENT_NAME,
      email: demoEmail,
      passwordHash,
      status: 'active',
      emailVerifiedAt: new Date(),
    });
    report.demoClient = { id: demoClient._id.toString(), created: true };
  } else {
    let dirty = false;
    if (!demoClient.tenantId || demoClient.tenantId.toString() !== tenant._id.toString()) {
      demoClient.tenantId = tenant._id;
      dirty = true;
    }
    if (demoClient.role !== ROLES.CLIENT_ADMIN) {
      demoClient.role = ROLES.CLIENT_ADMIN;
      dirty = true;
    }
    if (demoClient.status !== 'active') {
      demoClient.status = 'active';
      dirty = true;
    }
    if (demoClient.name !== env.DEMO_CLIENT_NAME) {
      demoClient.name = env.DEMO_CLIENT_NAME;
      dirty = true;
    }
    if (dirty) await demoClient.save();
    report.demoClient = { id: demoClient._id.toString(), created: false };
  }

  // --- Tenant ownership backfill ------------------------------------------
  if (!tenant.ownerUserId || tenant.ownerUserId.toString() !== demoClient._id.toString()) {
    tenant.ownerUserId = demoClient._id;
    await tenant.save();
  }

  logger.info(
    {
      superAdmin: report.superAdmin,
      tenant: report.tenant,
      demoClient: report.demoClient,
    },
    'Auth seed complete',
  );

  return report;
};
