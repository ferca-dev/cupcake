import {
  registerSchema,
  loginSchema,
  refreshSchema,
  logoutSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from './auth.validation.js';
import * as authService from './auth.service.js';
import { asyncHandler } from '../../common/utils/async-handler.js';
import { sendSuccess } from '../../common/responses/index.js';
import { HTTP_STATUS } from '../../common/constants/index.js';
import { getPermissionsForRole } from '../../common/auth/index.js';

const requestContext = (req) => ({
  ip: req.ip,
  userAgent: req.get('user-agent') ?? null,
});

const extractRefreshToken = (req) => {
  if (req.body && typeof req.body.refreshToken === 'string' && req.body.refreshToken.length > 0) {
    return req.body.refreshToken;
  }
  const header = req.get('x-refresh-token');
  if (typeof header === 'string' && header.length > 0) return header;
  return null;
};

export const register = asyncHandler(async (req, res) => {
  const payload = registerSchema.parse(req.body ?? {});
  const result = await authService.register({
    ...payload,
    ...requestContext(req),
  });
  return sendSuccess(res, {
    statusCode: HTTP_STATUS.CREATED,
    data: {
      user: result.user,
      tenant: result.tenant,
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      permissions: getPermissionsForRole(result.user.role),
    },
    message: 'Account created successfully',
  });
});

export const login = asyncHandler(async (req, res) => {
  const payload = loginSchema.parse(req.body ?? {});
  const result = await authService.login({
    ...payload,
    ...requestContext(req),
  });
  return sendSuccess(res, {
    data: {
      user: result.user,
      tenant: result.tenant,
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      permissions: getPermissionsForRole(result.user.role),
    },
    message: 'Logged in successfully',
  });
});

export const refresh = asyncHandler(async (req, res) => {
  refreshSchema.parse(req.body);
  const token = extractRefreshToken(req);
  const result = await authService.refresh({
    refreshToken: token,
    ...requestContext(req),
  });
  return sendSuccess(res, {
    data: {
      user: result.user,
      tenant: result.tenant,
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      permissions: getPermissionsForRole(result.user.role),
    },
    message: 'Token refreshed',
  });
});

export const logout = asyncHandler(async (req, res) => {
  logoutSchema.parse(req.body);
  const token = extractRefreshToken(req);
  const result = await authService.logout({
    refreshToken: token,
    user: req.user ?? null,
    ...requestContext(req),
  });
  return sendSuccess(res, {
    data: { revoked: result.revoked },
    message: 'Logged out',
  });
});

export const me = asyncHandler(async (req, res) => {
  const result = await authService.getCurrentUser(req.user.id);
  return sendSuccess(res, {
    data: {
      user: result.user,
      tenant: result.tenant,
      permissions: getPermissionsForRole(result.user.role),
      isSuperAdmin: result.isSuperAdmin,
    },
    message: 'Current user',
  });
});

export const forgotPassword = asyncHandler(async (req, res) => {
  const payload = forgotPasswordSchema.parse(req.body ?? {});
  await authService.requestPasswordReset({
    ...payload,
    ...requestContext(req),
  });
  // Intentionally generic so the response shape does not reveal account existence.
  return sendSuccess(res, {
    data: { delivered: false },
    message: 'If the email exists, a reset link will be sent shortly',
  });
});

export const resetPassword = asyncHandler(async (req, res) => {
  resetPasswordSchema.parse(req.body ?? {});
  await authService.resetPassword();
  return sendSuccess(res, {
    data: null,
    message: 'Password reset is not available yet',
  });
});
