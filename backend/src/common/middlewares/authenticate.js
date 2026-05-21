import { User } from '../../modules/users/user.model.js';
import { verifyAccessToken, getPermissionsForRole, isSuperAdmin } from '../auth/index.js';
import { AuthenticationError } from '../errors/index.js';

const extractBearer = (header) => {
  if (typeof header !== 'string') return null;
  const trimmed = header.trim();
  if (!trimmed.toLowerCase().startsWith('bearer ')) return null;
  const token = trimmed.slice(7).trim();
  return token.length > 0 ? token : null;
};

/**
 * Verifies the bearer access token and attaches the resolved user, tenant
 * context, and permissions to the request. Throws `AuthenticationError` for
 * missing, malformed, expired, or invalid tokens.
 */
export const authenticate = async (req, _res, next) => {
  try {
    const token = extractBearer(req.get('authorization'));
    if (!token) {
      throw new AuthenticationError('Authentication required');
    }

    const payload = verifyAccessToken(token);

    const user = await User.findById(payload.sub);
    if (!user) {
      throw new AuthenticationError('User no longer exists');
    }
    if (user.status !== 'active') {
      throw new AuthenticationError('User account is not active');
    }

    req.user = {
      id: user._id.toString(),
      role: user.role,
      tenantId: user.tenantId ? user.tenantId.toString() : null,
      email: user.email,
      name: user.name,
      status: user.status,
      permissions: getPermissionsForRole(user.role),
      isSuperAdmin: isSuperAdmin(user.role),
    };

    // Tenant context only exists for authenticated, non-super-admin users.
    // Super admins must explicitly opt into a tenant filter (no implicit
    // tenant inheritance so a slip-up cannot expose another tenant's data).
    req.tenantContext = req.user.isSuperAdmin
      ? null
      : req.user.tenantId
        ? { tenantId: req.user.tenantId }
        : null;

    return next();
  } catch (err) {
    return next(err);
  }
};
