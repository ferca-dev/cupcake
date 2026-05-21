import { AuditLog } from './audit-log.model.js';
import { logger } from '../../common/utils/logger.js';

/**
 * Action codes used by the auth module. Centralised here so other modules can
 * reuse them without depending on string literals.
 */
export const AUDIT_ACTIONS = Object.freeze({
  AUTH_REGISTER: 'auth.register',
  AUTH_LOGIN_SUCCESS: 'auth.login.success',
  AUTH_LOGIN_FAILURE: 'auth.login.failure',
  AUTH_LOGOUT: 'auth.logout',
  AUTH_REFRESH: 'auth.refresh',
  AUTH_REFRESH_REUSE_DETECTED: 'auth.refresh.reuse_detected',
  AUTH_PASSWORD_RESET_REQUESTED: 'auth.password_reset.requested',
  AUTH_PASSWORD_RESET_COMPLETED: 'auth.password_reset.completed',
});

/**
 * Minimal audit recorder used by the auth module. Persists when the database
 * is reachable; otherwise logs the event so unit tests and offline tooling do
 * not fail because of audit-side effects. This stub can be replaced with the
 * full audit module in a later phase without changing the call sites.
 */
export const recordAuditEvent = async ({
  action,
  entityType,
  entityId = null,
  userId = null,
  tenantId = null,
  metadata = {},
  ip = null,
  userAgent = null,
}) => {
  try {
    await AuditLog.create({
      action,
      entityType,
      entityId,
      userId,
      tenantId,
      metadata,
      ip,
      userAgent,
    });
  } catch (err) {
    logger.warn(
      { err, action, entityType, entityId },
      'Audit log write failed; falling back to logger',
    );
  }
};
