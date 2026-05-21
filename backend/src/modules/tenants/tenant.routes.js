import { Router } from 'express';

import { authenticate } from '../../common/middlewares/authenticate.js';
import { getMyTenant, getTenantById } from './tenant.controller.js';

export const tenantsRouter = Router();

tenantsRouter.use(authenticate);
tenantsRouter.get('/me', getMyTenant);
tenantsRouter.get('/:id', getTenantById);
