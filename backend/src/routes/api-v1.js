import { Router } from 'express';
import { healthRouter } from '../modules/health/health.routes.js';
import { authRouter } from '../modules/auth/auth.routes.js';
import { tenantsRouter } from '../modules/tenants/tenant.routes.js';
import { surveysRouter } from '../modules/surveys/survey.routes.js';
import { contactsRouter, contactGroupsRouter } from '../modules/contacts/contact.routes.js';
import { campaignsRouter } from '../modules/campaigns/campaign.routes.js';
import { publicFormsRouter } from '../modules/public-forms/public-form.routes.js';
import { dashboardRouter } from '../modules/dashboard/dashboard.routes.js';
import { templatesRouter } from '../modules/templates/template.routes.js';
import { transactionsRouter } from '../modules/transactions/transaction.routes.js';
import { tokenBillingRouter } from '../modules/tokens/token-billing.routes.js';
import { paymentBillingRouter } from '../modules/payments/payment.routes.js';
import { planBillingRouter } from '../modules/plans/plan-billing.routes.js';
import { adminRouter } from '../modules/admin/admin.routes.js';
import { settingsRouter } from '../modules/settings/settings.routes.js';
import { webhooksRouter } from '../modules/webhooks/webhook.routes.js';
import { mediaRouter } from '../modules/media/media.routes.js';
import { teamRouter, teamPublicRouter } from '../modules/team/team.routes.js';
import {
  publicSuppressionRouter,
  suppressionRouter,
} from '../modules/suppression/suppression.routes.js';
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
        '/api/v1/surveys/:id/reports/overview',
        '/api/v1/surveys/:id/reports/channels',
        '/api/v1/surveys/:id/reports/questions',
        '/api/v1/surveys/:id/reports/trends',
        '/api/v1/surveys/:id/reports/drop-off',
        '/api/v1/surveys/:id/reports/timing',
        '/api/v1/surveys/:id/reports/versions',
        '/api/v1/surveys/:id/reports/export',
        '/api/v1/contacts',
        '/api/v1/contacts/:id',
        '/api/v1/contacts/:id/consent',
        '/api/v1/contacts/import',
        '/api/v1/contacts/imports/:id/report',
        '/api/v1/suppression-list',
        '/api/v1/suppression-list/:id',
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
        '/api/v1/public/unsubscribe/email',
        '/api/v1/public/unsubscribe/email/:token',
        '/api/v1/dashboard/summary',
        '/api/v1/dashboard/surveys/:id',
        '/api/v1/dashboard/channels',
        '/api/v1/dashboard/recent-activity',
        '/api/v1/admin/metrics',
        '/api/v1/admin/tenants',
        '/api/v1/admin/tenants/:id',
        '/api/v1/admin/tenants/:id/status',
        '/api/v1/admin/tenants/:id/users',
        '/api/v1/settings/profile',
        '/api/v1/settings/password',
        '/api/v1/settings/preferences',
        '/api/v1/media/images',
        '/api/v1/media/images/:id',
        '/api/v1/media/images/:id/url',
        '/api/v1/templates',
        '/api/v1/templates/:id',
        '/api/v1/templates/:id/create-survey',
        '/api/v1/transactions',
        '/api/v1/transactions/:id',
        '/api/v1/billing/tokens/balance',
        '/api/v1/billing/tokens/ledger',
        '/api/v1/billing/token-packages',
        '/api/v1/billing/token-purchases',
        '/api/v1/billing/mercadopago/preferences',
        '/api/v1/billing/payments',
        '/api/v1/billing/payments/:id',
        '/api/v1/billing/subscription-plans',
        '/api/v1/billing/subscriptions',
        '/api/v1/billing/subscriptions/:id/cancel',
        '/api/v1/billing/subscriptions/:id/pause',
        '/api/v1/billing/subscriptions/:id/resume',
        '/api/v1/billing/subscription-invoices',
        '/api/v1/admin/token-packages',
        '/api/v1/admin/token-packages/:id',
        '/api/v1/admin/token-packages/:id/status',
        '/api/v1/admin/channel-pricing',
        '/api/v1/admin/tenants/:tenantId/token-wallet',
        '/api/v1/admin/tenants/:tenantId/send-limits',
        '/api/v1/admin/tenants/:tenantId/token-adjustments',
        '/api/v1/admin/token-purchases',
        '/api/v1/admin/token-purchases/:id/approve',
        '/api/v1/admin/token-purchases/:id/reject',
        '/api/v1/admin/payments',
        '/api/v1/admin/payments/:id',
        '/api/v1/admin/payment-webhooks',
        '/api/v1/admin/payments/reconcile',
        '/api/v1/admin/subscription-plans',
        '/api/v1/admin/subscription-plans/:id',
        '/api/v1/admin/subscription-plans/:id/status',
        '/api/v1/admin/subscriptions',
        '/api/v1/admin/subscriptions/:id/sync',
        '/api/v1/admin/subscriptions/:id/cancel',
        '/api/v1/admin/subscriptions/:id/pause',
        '/api/v1/admin/payments/reminders/low-balance',
        '/api/v1/admin/payments/reminders/renewals',
        '/api/v1/admin/plans',
        '/api/v1/admin/plans/:id',
        '/api/v1/admin/plans/:id/status',
        '/api/v1/admin/plans/catalogue',
        '/api/v1/admin/tenants/:tenantId/plan',
        '/api/v1/admin/tenants/:tenantId/plan-history',
        '/api/v1/admin/tenants/:tenantId/usage',
        '/api/v1/billing/plan',
        '/api/v1/billing/usage',
        '/api/v1/billing/plans/available',
        '/api/v1/billing/plans/catalogue',
        '/api/v1/team/members',
        '/api/v1/team/members/:id',
        '/api/v1/team/members/:id/role',
        '/api/v1/team/members/:id/status',
        '/api/v1/team/invitations',
        '/api/v1/team/invitations/:id/resend',
        '/api/v1/team/invitations/:id/revoke',
        '/api/v1/team/invitations/accept',
        '/api/v1/team/owner-transfer',
        '/api/v1/admin/tenants/:id/invitations',
        '/api/v1/webhooks/twilio/messages',
        '/api/v1/webhooks/twilio/opt-out',
        '/api/v1/webhooks/sendgrid/events',
        '/api/v1/webhooks/mercadopago',
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
apiV1Router.use('/suppression-list', suppressionRouter);
apiV1Router.use('/campaigns', campaignsRouter);
apiV1Router.use('/public', publicSuppressionRouter);
apiV1Router.use('/public', publicFormsRouter);
apiV1Router.use('/dashboard', dashboardRouter);
apiV1Router.use('/admin', adminRouter);
apiV1Router.use('/settings', settingsRouter);
apiV1Router.use('/media', mediaRouter);
apiV1Router.use('/templates', templatesRouter);
apiV1Router.use('/transactions', transactionsRouter);
apiV1Router.use('/billing', tokenBillingRouter);
apiV1Router.use('/billing', paymentBillingRouter);
apiV1Router.use('/billing', planBillingRouter);
apiV1Router.use('/team', teamPublicRouter);
apiV1Router.use('/team', teamRouter);
apiV1Router.use('/webhooks', webhooksRouter);
