import { Router } from 'express';

import * as apiKeys from './api-key.controller.js';
import * as webhooks from './webhook-endpoint.controller.js';
import { authenticate } from '../../common/middlewares/authenticate.js';
import { requirePermission, requireTenantContext } from '../../common/middlewares/authorize.js';
import { PERMISSIONS } from '../../common/auth/index.js';

/**
 * Developer surface for tenants: API key management and outbound webhook
 * configuration. Mounted at `/api/v1/developer`. Every route is bearer-auth
 * protected and requires tenant context. `USERS_MANAGE` gates both API key
 * issuance and webhook configuration so the same staff who control tenant
 * membership control integration credentials.
 */
export const developerRouter = Router();

developerRouter.use(authenticate);
developerRouter.use(requireTenantContext());
developerRouter.use(requirePermission(PERMISSIONS.USERS_MANAGE));

developerRouter.get('/api-keys', apiKeys.list);
developerRouter.post('/api-keys', apiKeys.create);
developerRouter.post('/api-keys/:id/rotate', apiKeys.rotate);
developerRouter.post('/api-keys/:id/revoke', apiKeys.revoke);
developerRouter.delete('/api-keys/:id', apiKeys.destroy);

developerRouter.get('/webhooks', webhooks.list);
developerRouter.post('/webhooks', webhooks.create);
developerRouter.put('/webhooks/:id', webhooks.update);
developerRouter.delete('/webhooks/:id', webhooks.destroy);
developerRouter.get('/webhooks/:id/deliveries', webhooks.listDeliveries);
developerRouter.post('/webhooks/:id/test', webhooks.sendTest);
