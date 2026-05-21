import { connectDatabase, disconnectDatabase } from '../config/database.js';
import { logger } from '../common/utils/logger.js';
import { loadEnv } from '../config/env.js';
import { seedAuth } from './seed-auth.js';
import { seedSurveys } from './seed-surveys.js';
import { seedContacts } from './seed-contacts.js';
import { seedCampaigns } from './seed-campaigns.js';
import { seedTemplates } from './seed-templates.js';
import { seedTransactions } from './seed-transactions.js';

/**
 * Runs all available seeders in dependency order. Idempotent — running the
 * script twice does not duplicate data. Exits with a non-zero status code if
 * any step throws so CI/CD can detect a broken seed.
 */
const runSeeders = async () => {
  loadEnv();
  await connectDatabase();

  try {
    await seedAuth();
    await seedTemplates();
    await seedSurveys();
    await seedContacts();
    await seedCampaigns();
    await seedTransactions();
    logger.info('All seeders completed successfully');
  } catch (err) {
    logger.fatal({ err }, 'Seeder failed');
    throw err;
  } finally {
    await disconnectDatabase();
  }
};

runSeeders().catch(() => {
  process.exit(1);
});
