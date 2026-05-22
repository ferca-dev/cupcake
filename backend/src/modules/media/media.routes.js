import { Router } from 'express';

import * as mediaController from './media.controller.js';
import { parseImageUpload } from './media-upload.middleware.js';
import { authenticate } from '../../common/middlewares/authenticate.js';
import { requireTenantContext } from '../../common/middlewares/authorize.js';

export const mediaRouter = Router();

mediaRouter.use(authenticate);
mediaRouter.use(requireTenantContext({ allowSuperAdminGlobal: false }));

mediaRouter.post('/images', parseImageUpload, mediaController.uploadImage);
mediaRouter.get('/images', mediaController.listImages);
mediaRouter.get('/images/:id', mediaController.getImage);
mediaRouter.get('/images/:id/url', mediaController.getImageUrl);
mediaRouter.delete('/images/:id', mediaController.deleteImage);
