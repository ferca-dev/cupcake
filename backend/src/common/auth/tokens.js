import { createHash, randomBytes } from 'node:crypto';
import jwt from 'jsonwebtoken';

import { loadEnv } from '../../config/env.js';
import { AuthenticationError } from '../errors/index.js';

const env = loadEnv();

const ACCESS_TOKEN_TYPE = 'access';
const REFRESH_TOKEN_TYPE = 'refresh';
const TOKEN_ISSUER = env.APP_NAME;

const signOptions = (expiresIn, subject, jti) => ({
  expiresIn,
  issuer: TOKEN_ISSUER,
  subject,
  ...(jti ? { jwtid: jti } : {}),
});

/**
 * Signs a short-lived access token bound to the user id.
 */
export const signAccessToken = ({ userId, role, tenantId }) =>
  jwt.sign(
    {
      type: ACCESS_TOKEN_TYPE,
      role,
      tenantId: tenantId ? String(tenantId) : null,
    },
    env.JWT_ACCESS_SECRET,
    signOptions(env.JWT_ACCESS_EXPIRES_IN, String(userId)),
  );

/**
 * Signs a refresh token that carries the refresh-token document id (jti).
 * The opaque token value is what gets persisted (hashed) on the server.
 */
export const signRefreshToken = ({ userId, jti }) =>
  jwt.sign(
    {
      type: REFRESH_TOKEN_TYPE,
    },
    env.JWT_REFRESH_SECRET,
    signOptions(env.JWT_REFRESH_EXPIRES_IN, String(userId), jti),
  );

const verifyToken = (token, secret, expectedType) => {
  try {
    const payload = jwt.verify(token, secret, { issuer: TOKEN_ISSUER });
    if (payload.type !== expectedType) {
      throw new AuthenticationError('Invalid token type');
    }
    return payload;
  } catch (err) {
    if (err instanceof AuthenticationError) throw err;
    if (err?.name === 'TokenExpiredError') {
      throw new AuthenticationError('Token has expired');
    }
    throw new AuthenticationError('Invalid token');
  }
};

export const verifyAccessToken = (token) =>
  verifyToken(token, env.JWT_ACCESS_SECRET, ACCESS_TOKEN_TYPE);

export const verifyRefreshToken = (token) =>
  verifyToken(token, env.JWT_REFRESH_SECRET, REFRESH_TOKEN_TYPE);

/**
 * Hash refresh-token values for at-rest storage. We use SHA-256 (not bcrypt)
 * because the input is already a high-entropy random secret — we only need a
 * deterministic, fast one-way digest so lookups by hash stay O(1).
 */
export const hashTokenValue = (value) => createHash('sha256').update(value).digest('hex');

export const generateOpaqueToken = (bytes = 48) => randomBytes(bytes).toString('hex');

/**
 * Parses a duration string (`"15m"`, `"7d"`, `"3600"`) into milliseconds.
 * Kept local because we only need a small subset of the formats jsonwebtoken
 * supports for `expiresIn`.
 */
export const durationToMs = (value) => {
  if (typeof value === 'number') return value * 1000;
  const trimmed = String(value).trim();
  if (/^\d+$/.test(trimmed)) return Number.parseInt(trimmed, 10) * 1000;
  const match = trimmed.match(/^(\d+)\s*(ms|s|m|h|d|w|y)$/i);
  if (!match) {
    throw new Error(`Cannot parse duration: ${value}`);
  }
  const amount = Number.parseInt(match[1], 10);
  const unit = match[2].toLowerCase();
  const multipliers = {
    ms: 1,
    s: 1000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
    w: 604_800_000,
    y: 31_536_000_000,
  };
  return amount * multipliers[unit];
};

export const refreshTokenExpiryDate = () =>
  new Date(Date.now() + durationToMs(env.JWT_REFRESH_EXPIRES_IN));

export { ACCESS_TOKEN_TYPE, REFRESH_TOKEN_TYPE };
