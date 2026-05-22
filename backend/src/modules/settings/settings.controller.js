import * as settingsService from './settings.service.js';
import {
  updateProfileSchema,
  updatePasswordSchema,
  updatePreferencesSchema,
} from './settings.validation.js';
import { asyncHandler } from '../../common/utils/async-handler.js';
import { sendSuccess } from '../../common/responses/index.js';

const requestContext = (req) => ({
  ip: req.ip,
  userAgent: req.get('user-agent') ?? null,
});

export const getProfile = asyncHandler(async (req, res) => {
  const profile = await settingsService.getProfile(req.user.id);
  return sendSuccess(res, { data: { profile }, message: 'Profile' });
});

export const updateProfile = asyncHandler(async (req, res) => {
  const payload = updateProfileSchema.parse(req.body ?? {});
  const profile = await settingsService.updateProfile({
    userId: req.user.id,
    payload,
    ...requestContext(req),
  });
  return sendSuccess(res, { data: { profile }, message: 'Profile updated' });
});

export const updatePassword = asyncHandler(async (req, res) => {
  const payload = updatePasswordSchema.parse(req.body ?? {});
  const result = await settingsService.updatePassword({
    userId: req.user.id,
    payload,
    ...requestContext(req),
  });
  return sendSuccess(res, {
    data: { passwordChangedAt: result.passwordChangedAt },
    message: 'Password updated',
  });
});

export const updatePreferences = asyncHandler(async (req, res) => {
  const payload = updatePreferencesSchema.parse(req.body ?? {});
  const profile = await settingsService.updatePreferences({
    userId: req.user.id,
    payload,
    ...requestContext(req),
  });
  return sendSuccess(res, { data: { profile }, message: 'Preferences updated' });
});
