import { connectDatabase, disconnectDatabase } from '../backend/src/config/database.js';
import { loadEnv } from '../backend/src/config/env.js';
import { seedAuth } from '../backend/src/seeders/seed-auth.js';
import { seedPlans } from '../backend/src/seeders/seed-plans.js';
import { seedTemplates } from '../backend/src/seeders/seed-templates.js';
import { User } from '../backend/src/modules/users/user.model.js';

const env = loadEnv();
if (!env.SURVEYS_ONLY || env.APP_ENV !== 'staging' || env.MONGODB_DB_NAME !== 'cupcake') {
  throw new Error('Bootstrap requires the restricted Cupcake staging configuration');
}
if (
  [env.SUPER_ADMIN_PASSWORD, env.DEMO_CLIENT_PASSWORD].some(
    (password) => password === 'ChangeMe123!',
  )
) {
  throw new Error('Set unique account passwords before bootstrapping');
}
await connectDatabase();
try {
  await seedAuth();
  await seedPlans();
  await seedTemplates();
  for (const email of [env.SUPER_ADMIN_EMAIL, env.DEMO_CLIENT_EMAIL]) {
    await User.updateOne(
      { email },
      { $set: { 'preferences.locale': 'es', 'preferences.timezone': 'America/Monterrey' } },
    );
  }
  console.log('Cupcake accounts, plans and templates are ready.');
} finally {
  await disconnectDatabase();
}
