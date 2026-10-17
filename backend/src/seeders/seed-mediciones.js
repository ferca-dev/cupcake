import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadEnv } from '../config/env.js';
import { hashPassword } from '../common/auth/passwords.js';
import { ROLES } from '../common/auth/roles.js';
import { logger } from '../common/utils/logger.js';
import { User } from '../modules/users/user.model.js';
import { Tenant } from '../modules/tenants/tenant.model.js';
import { Plan } from '../modules/plans/plan.model.js';
import { assignPlanToTenant } from '../modules/plans/plan.service.js';
import { MediaAsset } from '../modules/media/media-asset.model.js';
import { uploadImage } from '../modules/media/media.service.js';
import { updateBranding } from '../modules/branding/branding.service.js';

const TENANT_NAME = 'MEDICIONES MX';
const TENANT_SLUG = 'mediciones-mx';
const LOGO_PATH = new URL('./assets/mediciones-mx.png', import.meta.url);

export const assertLocalMedicionesSeed = (env) => {
  const database = new URL(env.MONGODB_URI);
  const storage = new URL(env.STORAGE_PUBLIC_BASE_URL);
  const isLoopback = (host) => ['localhost', '127.0.0.1', '[::1]'].includes(host);
  if (
    !['development', 'test'].includes(env.APP_ENV) ||
    database.protocol !== 'mongodb:' ||
    !isLoopback(database.hostname) ||
    env.STORAGE_DRIVER !== 'local' ||
    !isLoopback(storage.hostname)
  ) {
    throw new Error(
      'MEDICIONES MX can only be seeded into a local development/test database and storage.',
    );
  }
};

/** Creates a separate local client. Reruns preserve passwords and custom branding. */
export const seedMediciones = async () => {
  const env = loadEnv();
  assertLocalMedicionesSeed(env);
  const email = env.MEDICIONES_CLIENT_EMAIL.toLowerCase();
  let tenant = await Tenant.findOne({ slug: TENANT_SLUG });
  let user = await User.findOne({ email });

  // Never reassign an existing account from another tenant or role.
  if (
    user &&
    (!tenant ||
      user.tenantId?.toString() !== tenant._id.toString() ||
      user.role !== ROLES.CLIENT_ADMIN)
  ) {
    throw new Error('The MEDICIONES MX email already belongs to another account.');
  }
  if (tenant?.ownerUserId && tenant.ownerUserId.toString() !== user?._id.toString()) {
    throw new Error('The MEDICIONES MX tenant already has a different owner.');
  }
  if (!user && !env.MEDICIONES_CLIENT_PASSWORD) {
    throw new Error('Set MEDICIONES_CLIENT_PASSWORD before creating the local account.');
  }
  const proPlan = await Plan.findOne({ code: 'pro', status: 'active' });
  if (!proPlan) throw new Error('Run the plan seeder before seed:mediciones.');
  const buffer = await fs.readFile(LOGO_PATH);
  const checksumSha256 = crypto.createHash('sha256').update(buffer).digest('hex');
  const tenantCreated = !tenant;
  const userCreated = !user;

  if (!tenant) {
    tenant = await Tenant.create({
      name: TENANT_NAME,
      slug: TENANT_SLUG,
      status: 'active',
      settings: { locale: 'es-MX', timezone: 'America/Monterrey' },
    });
  }
  if (!user) {
    user = await User.create({
      tenantId: tenant._id,
      role: ROLES.CLIENT_ADMIN,
      name: TENANT_NAME,
      email,
      passwordHash: await hashPassword(env.MEDICIONES_CLIENT_PASSWORD),
      status: 'active',
      emailVerifiedAt: new Date(),
      preferences: { locale: 'es', timezone: 'America/Monterrey' },
    });
  }
  if (!tenant.ownerUserId) {
    tenant.ownerUserId = user._id;
    await tenant.save();
  }

  const tenantId = tenant._id.toString();
  if (!tenant.planId) {
    await assignPlanToTenant({
      tenantId,
      planId: proPlan._id.toString(),
      actor: null,
      source: 'system',
      reason: 'Local MEDICIONES MX fixture with custom branding',
    });
  }

  if (!tenant.settings?.branding?.logoUrl) {
    const existingAsset = await MediaAsset.findOne({
      tenantId,
      purpose: 'tenant_branding',
      checksumSha256,
      status: 'active',
    });
    const asset =
      existingAsset ??
      (await uploadImage({
        tenantId,
        actor: { id: user._id.toString() },
        purpose: 'tenant_branding',
        file: {
          buffer,
          size: buffer.length,
          originalname: 'mediciones-mx.png',
          mimetype: 'image/png',
        },
      }));
    await updateBranding({
      tenantId,
      actor: { id: user._id.toString() },
      payload: {
        logoMediaAssetId: asset.id,
        logoUrl: asset.publicUrl,
        primaryColor: '#025c7c',
        accentColor: '#4b4b4b',
        backgroundColor: '#f4f6f7',
        textColor: '#202629',
      },
    });
  }

  const report = {
    tenant: { id: tenantId, created: tenantCreated },
    user: { id: user._id.toString(), email, created: userCreated },
  };
  logger.info(report, 'Local MEDICIONES MX seed complete');
  return report;
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const run = async () => {
    assertLocalMedicionesSeed(loadEnv());
    const { connectDatabase, disconnectDatabase } = await import('../config/database.js');
    try {
      await connectDatabase();
      await seedMediciones();
    } finally {
      await disconnectDatabase();
    }
  };
  run().catch((err) => {
    logger.error({ err }, 'MEDICIONES MX seed failed');
    process.exitCode = 1;
  });
}
