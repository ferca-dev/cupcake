import { Tenant } from '../tenants/tenant.model.js';
import { AuthenticationError, AuthorizationError } from '../../common/errors/index.js';
import { authenticateApiKey } from './api-key.service.js';
import { resolvePermissionsForScopes } from './api-scopes.js';

const extractKey = (req) => {
  const header = req.get('authorization');
  if (typeof header === 'string') {
    const trimmed = header.trim();
    if (trimmed.toLowerCase().startsWith('bearer ')) {
      const token = trimmed.slice(7).trim();
      if (token.length > 0) return token;
    }
  }
  const explicit = req.get('x-api-key');
  if (typeof explicit === 'string' && explicit.trim().length > 0) {
    return explicit.trim();
  }
  return null;
};

/**
 * Authenticates a request using a tenant-scoped API key. The resolved key is
 * attached to `req.apiKey`, and `req.user`/`req.tenantContext` are populated
 * so downstream `requirePermission(...)` guards behave the same way they do
 * for interactive user sessions.
 *
 * API keys can NEVER grant super-admin permissions — the role is always
 * synthesised as `api_key` and the permission list is exactly the union of
 * the scopes' mapped permissions.
 */
export const authenticateWithApiKey = async (req, _res, next) => {
  try {
    const raw = extractKey(req);
    if (!raw) {
      throw new AuthenticationError('API key required');
    }
    const apiKey = await authenticateApiKey({ raw, ip: req.ip ?? null });

    const tenant = await Tenant.findById(apiKey.tenantId).select('status');
    if (!tenant) {
      throw new AuthenticationError('Tenant no longer exists');
    }
    if (tenant.status !== 'active') {
      throw new AuthenticationError('Tenant access has been disabled');
    }

    const permissions = resolvePermissionsForScopes(apiKey.scopes);

    req.apiKey = apiKey;
    req.user = {
      id: apiKey.createdBy?.toString() ?? null,
      role: 'api_key',
      tenantId: apiKey.tenantId.toString(),
      email: null,
      name: apiKey.name,
      status: 'active',
      permissions,
      isSuperAdmin: false,
      isApiKey: true,
      scopes: [...apiKey.scopes],
    };
    req.tenantContext = { tenantId: apiKey.tenantId.toString(), apiKey: true };

    return next();
  } catch (err) {
    return next(err);
  }
};

/**
 * Refines `requirePermission` for API key authenticated requests by also
 * checking the key carries the matching scope. Permission checks alone are
 * insufficient because all scopes map to permissions, but a single permission
 * can be granted by multiple scopes — this guard makes the integration
 * surface explicit ("this endpoint requires `responses:read`").
 */
export const requireScope = (...scopes) => {
  const required = scopes.flat();
  return (req, _res, next) => {
    try {
      if (!req.user) throw new AuthenticationError('Authentication required');
      if (!req.user.isApiKey) {
        // Interactive users are gated by permission middlewares; scope
        // guards only apply to API keys.
        return next();
      }
      const granted = req.user.scopes ?? [];
      const missing = required.filter((scope) => !granted.includes(scope));
      if (missing.length > 0) {
        throw new AuthorizationError('API key is missing required scopes', [
          { scopes: missing },
        ]);
      }
      return next();
    } catch (err) {
      return next(err);
    }
  };
};
