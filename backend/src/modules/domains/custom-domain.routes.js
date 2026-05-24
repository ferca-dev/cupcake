import { Router } from 'express';

import * as domainController from './custom-domain.controller.js';
import { authenticate } from '../../common/middlewares/authenticate.js';
import { requireTenantContext } from '../../common/middlewares/authorize.js';

export const customDomainRouter = Router();

customDomainRouter.use(authenticate);
customDomainRouter.use(requireTenantContext({ allowSuperAdminGlobal: false }));

customDomainRouter.get('/', domainController.listDomains);
customDomainRouter.post('/', domainController.createDomain);
customDomainRouter.post('/:id/verify', domainController.verifyDomain);
customDomainRouter.patch('/:id/status', domainController.updateDomainStatus);
customDomainRouter.delete('/:id', domainController.deleteDomain);
