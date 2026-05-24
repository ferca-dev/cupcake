import { Router } from 'express';

import * as controller from './team.controller.js';
import { authenticate } from '../../common/middlewares/authenticate.js';
import { requirePermission, requireTenantContext } from '../../common/middlewares/authorize.js';
import { createAuthRateLimiter } from '../../common/middlewares/rate-limiters.js';
import { PERMISSIONS } from '../../common/auth/index.js';
import { loadEnv } from '../../config/env.js';

const env = loadEnv();
const acceptLimiter = env.isTest ? (_req, _res, next) => next() : createAuthRateLimiter();

/**
 * Public acceptance router. Mounted separately so it is reachable without
 * authentication while the rest of the team management surface stays behind
 * the bearer token + permission guards.
 */
export const teamPublicRouter = Router();
teamPublicRouter.post('/invitations/accept', acceptLimiter, controller.acceptInvitation);

export const teamRouter = Router();

teamRouter.use(authenticate);
teamRouter.use(requireTenantContext());

// Listing endpoints are visible to anyone who can manage users in the tenant.
// Mutations re-check inside the service so we can return precise error codes
// (e.g. "transfer ownership first") rather than a blanket 403.
teamRouter.get('/members', requirePermission(PERMISSIONS.USERS_MANAGE), controller.listMembers);
teamRouter.get('/surveyors', requirePermission(PERMISSIONS.USERS_MANAGE), controller.listSurveyors);
teamRouter.post(
  '/surveyors',
  requirePermission(PERMISSIONS.USERS_MANAGE),
  controller.createSurveyor,
);
teamRouter.get('/members/:id', requirePermission(PERMISSIONS.USERS_MANAGE), controller.getMember);

teamRouter.patch(
  '/members/:id/role',
  requirePermission(PERMISSIONS.USERS_MANAGE),
  controller.updateMemberRole,
);
teamRouter.patch(
  '/members/:id/status',
  requirePermission(PERMISSIONS.USERS_MANAGE),
  controller.updateMemberStatus,
);
teamRouter.delete(
  '/members/:id',
  requirePermission(PERMISSIONS.USERS_MANAGE),
  controller.removeMember,
);

teamRouter.get(
  '/invitations',
  requirePermission(PERMISSIONS.USERS_MANAGE),
  controller.listInvitations,
);
teamRouter.post(
  '/invitations',
  requirePermission(PERMISSIONS.USERS_MANAGE),
  controller.createInvitation,
);
teamRouter.post(
  '/invitations/:id/resend',
  requirePermission(PERMISSIONS.USERS_MANAGE),
  controller.resendInvitation,
);
teamRouter.post(
  '/invitations/:id/revoke',
  requirePermission(PERMISSIONS.USERS_MANAGE),
  controller.revokeInvitation,
);

teamRouter.post(
  '/owner-transfer',
  requirePermission(PERMISSIONS.USERS_MANAGE),
  controller.transferOwnership,
);
