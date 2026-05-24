import { Router } from 'express';

import * as brandingController from './branding.controller.js';
import { authenticate } from '../../common/middlewares/authenticate.js';
import { requireTenantContext } from '../../common/middlewares/authorize.js';

export const brandingRouter = Router();

brandingRouter.use(authenticate);
brandingRouter.use(requireTenantContext({ allowSuperAdminGlobal: false }));

brandingRouter.get('/', brandingController.getBranding);
brandingRouter.put('/', brandingController.updateBranding);
