import { Router } from 'express';

import * as settingsController from './settings.controller.js';
import { authenticate } from '../../common/middlewares/authenticate.js';

export const settingsRouter = Router();

// Every settings route operates on the authenticated user's own record. There
// are no tenant- or role-scoped permissions here; the surface is intentionally
// "self-service for the bearer of the token".
settingsRouter.use(authenticate);

settingsRouter.get('/profile', settingsController.getProfile);
settingsRouter.put('/profile', settingsController.updateProfile);
settingsRouter.put('/password', settingsController.updatePassword);
settingsRouter.put('/preferences', settingsController.updatePreferences);
