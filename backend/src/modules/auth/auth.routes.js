import { Router } from 'express';

import * as authController from './auth.controller.js';
import { authenticate } from '../../common/middlewares/authenticate.js';
import { createAuthRateLimiter } from '../../common/middlewares/rate-limiters.js';
import { loadEnv } from '../../config/env.js';

const env = loadEnv();

export const authRouter = Router();

const limiter = env.isTest ? (_req, _res, next) => next() : createAuthRateLimiter();

authRouter.post('/register', limiter, authController.register);
authRouter.post('/login', limiter, authController.login);
authRouter.post('/refresh', limiter, authController.refresh);
authRouter.post('/logout', authController.logout);
authRouter.get('/me', authenticate, authController.me);
authRouter.post('/forgot-password', limiter, authController.forgotPassword);
authRouter.post('/reset-password', limiter, authController.resetPassword);
