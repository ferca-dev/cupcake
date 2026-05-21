import { Router } from 'express';
import { healthRouter } from '../modules/health/health.routes.js';
import { authRouter } from '../modules/auth/auth.routes.js';
import { tenantsRouter } from '../modules/tenants/tenant.routes.js';
import { surveysRouter } from '../modules/surveys/survey.routes.js';
import { contactsRouter, contactGroupsRouter } from '../modules/contacts/contact.routes.js';
import { campaignsRouter } from '../modules/campaigns/campaign.routes.js';
import { publicFormsRouter } from '../modules/public-forms/public-form.routes.js';
import { dashboardRouter, adminMetricsRouter } from '../modules/dashboard/dashboard.routes.js';
import { sendSuccess } from '../common/responses/index.js';
import { loadEnv } from '../config/env.js';

const env = loadEnv();

export const apiV1Router = Router();

apiV1Router.get('/', (req, res) =>
  sendSuccess(res, {
    data: {
      name: env.APP_NAME,
      apiVersion: 'v1',
      environment: env.APP_ENV,
      endpoints: [
        '/api/v1/health',
        '/api/v1/auth/register',
        '/api/v1/auth/login',
        '/api/v1/auth/logout',
        '/api/v1/auth/refresh',
        '/api/v1/auth/me',
        '/api/v1/auth/forgot-password',
        '/api/v1/auth/reset-password',
        '/api/v1/tenants/me',
        '/api/v1/tenants/:id',
        '/api/v1/surveys',
        '/api/v1/surveys/:id',
        '/api/v1/surveys/:id/publish',
        '/api/v1/surveys/:id/pause',
        '/api/v1/surveys/:id/archive',
        '/api/v1/surveys/:id/duplicate',
        '/api/v1/surveys/:id/versions',
        '/api/v1/surveys/:id/stats',
        '/api/v1/contacts',
        '/api/v1/contacts/:id',
        '/api/v1/contacts/import',
        '/api/v1/contacts/imports/:id/report',
        '/api/v1/contact-groups',
        '/api/v1/contact-groups/:id',
        '/api/v1/contact-groups/:id/contacts',
        '/api/v1/contact-groups/:id/contacts/:contactId',
        '/api/v1/campaigns',
        '/api/v1/campaigns/:id',
        '/api/v1/campaigns/:id/send',
        '/api/v1/campaigns/:id/recipients',
        '/api/v1/campaigns/:id/report',
        '/api/v1/public/forms/:slug',
        '/api/v1/public/forms/:slug/token/:submissionToken',
        '/api/v1/public/forms/:slug/responses',
        '/api/v1/dashboard/summary',
        '/api/v1/dashboard/surveys/:id',
        '/api/v1/dashboard/channels',
        '/api/v1/dashboard/recent-activity',
        '/api/v1/admin/metrics',
      ],
    },
    message: 'API metadata',
  }),
);

apiV1Router.use('/health', healthRouter);
apiV1Router.use('/auth', authRouter);
apiV1Router.use('/tenants', tenantsRouter);
apiV1Router.use('/surveys', surveysRouter);
apiV1Router.use('/contacts', contactsRouter);
apiV1Router.use('/contact-groups', contactGroupsRouter);
apiV1Router.use('/campaigns', campaignsRouter);
apiV1Router.use('/public', publicFormsRouter);
apiV1Router.use('/dashboard', dashboardRouter);
apiV1Router.use('/admin', adminMetricsRouter);
