import { createHash } from 'node:crypto';

import { loadEnv } from '../../config/env.js';
import { RateLimitError, ValidationError } from '../../common/errors/index.js';
import { logger } from '../../common/utils/logger.js';
import { getCaptchaProvider } from './captcha/captcha.factory.js';
import {
  SuspiciousSubmission,
  SUSPICIOUS_SUBMISSION_REASONS,
} from './suspicious-submission.model.js';

const log = logger.child({ module: 'public-forms/anti-abuse' });

// Generic message returned to clients on any rate-limit rejection. Keeping it
// uniform across dimensions avoids leaking which dimension tripped (and
// therefore how to evade).
const RATE_LIMIT_MESSAGE = 'Too many submissions, please try again later.';

// Generic CAPTCHA failure message. Same rationale: do not tell a bot whether
// the token was missing, malformed, or rejected by the provider.
const CAPTCHA_FAILURE_MESSAGE =
  'Could not verify the security challenge. Please reload and try again.';

const HONEYPOT_GENERIC_MESSAGE = 'Submission rejected.';

const TOO_FAST_MESSAGE = 'Please take a moment to complete the form before submitting.';

const ipHash = (ip) => {
  if (!ip) return null;
  return createHash('sha256').update(`anti-abuse|${ip}`).digest('hex');
};

const truncate = (value, max) => (typeof value === 'string' ? value.slice(0, max) : value);

// In-process sliding-window counters keyed by `dimension:identifier`. Each
// entry is the list of unix-ms timestamps of recorded hits within the window.
// The counters reset when the process restarts, which is acceptable for the
// burst-protection use case — durable rate limits should be enforced by the
// reverse-proxy / WAF in production.
const COUNTERS = new Map();
const WINDOW_MS = 60_000;

const recordHit = (key, now) => {
  const arr = COUNTERS.get(key) ?? [];
  const cutoff = now - WINDOW_MS;
  // Trim old timestamps first so the array does not grow unbounded for
  // surveys that hover just under the limit.
  const fresh = arr.filter((t) => t > cutoff);
  fresh.push(now);
  COUNTERS.set(key, fresh);
  return fresh.length;
};

const peekCount = (key, now) => {
  const arr = COUNTERS.get(key);
  if (!arr) return 0;
  const cutoff = now - WINDOW_MS;
  return arr.filter((t) => t > cutoff).length;
};

/** Test helper — clears the in-process sliding-window counters. */
export const resetAntiAbuseCounters = () => {
  COUNTERS.clear();
};

const recordSuspicious = async ({
  tenantId,
  surveyId,
  surveySlug,
  submissionToken,
  ip,
  userAgent,
  reason,
  action,
  details,
}) => {
  if (!SUSPICIOUS_SUBMISSION_REASONS.includes(reason)) return;
  try {
    await SuspiciousSubmission.create({
      tenantId: tenantId ?? null,
      surveyId: surveyId ?? null,
      surveySlug: surveySlug ?? null,
      submissionToken: submissionToken ?? null,
      ip: truncate(ip, 64),
      ipHash: ipHash(ip),
      userAgent: truncate(userAgent, 500),
      reason,
      action,
      details: details ?? {},
    });
  } catch (err) {
    // The audit insert must never break the request flow — anti-abuse logging
    // is best-effort. A failed insert is logged so an operator can spot a
    // misconfigured collection without surfacing the failure to the client.
    log.warn({ err, reason }, 'Failed to persist suspicious submission record');
  }
};

const resolveLimit = ({ surveyOverride, envValue }) => {
  if (typeof surveyOverride === 'number' && surveyOverride >= 0) return surveyOverride;
  return envValue;
};

const resolveAntiAbuseSettings = (settings = {}) => {
  const raw = settings?.antiAbuse ?? {};
  return {
    captchaRequired: !loadEnv().PUBLIC_FORM_CAPTCHA_DISABLED && Boolean(raw.captchaRequired),
    honeypotEnabled: raw.honeypotEnabled !== false, // default on
    minFillSeconds:
      typeof raw.minFillSeconds === 'number' && raw.minFillSeconds >= 0 ? raw.minFillSeconds : null,
    perIpPerMinute:
      typeof raw.perIpPerMinute === 'number' && raw.perIpPerMinute >= 0 ? raw.perIpPerMinute : null,
    perTokenPerMinute:
      typeof raw.perTokenPerMinute === 'number' && raw.perTokenPerMinute >= 0
        ? raw.perTokenPerMinute
        : null,
    suspiciousAction: raw.suspiciousAction === 'flag' ? 'flag' : 'reject',
  };
};

/**
 * Returns the metadata the public form GET endpoint exposes so the renderer
 * knows whether to mount a CAPTCHA widget and which honeypot field to embed.
 */
export const buildAntiAbuseConfigForPublic = ({ effectiveSettings }) => {
  const env = loadEnv();
  const provider = getCaptchaProvider();
  const settings = resolveAntiAbuseSettings(effectiveSettings);
  return {
    captcha: {
      required: settings.captchaRequired,
      provider: provider.name,
      siteKey: settings.captchaRequired ? (provider.siteKey ?? null) : null,
    },
    honeypot: {
      enabled: settings.honeypotEnabled,
      fieldName: settings.honeypotEnabled ? env.PUBLIC_FORM_HONEYPOT_FIELD : null,
    },
    minFillSeconds: Math.max(env.PUBLIC_FORM_MIN_FILL_SECONDS, settings.minFillSeconds ?? 0),
  };
};

/**
 * Runs every anti-abuse check the platform enforces before a public response
 * is created. Each check either:
 *
 *   - throws a clear, generic error (when `suspiciousAction === 'reject'`,
 *     the default) so the caller never reaches `responses.create`, OR
 *   - records a suspicious-submission row and returns silently when the
 *     survey opted into `suspiciousAction: 'flag'` (allowing manual review
 *     while preserving the response).
 *
 * Honeypot violations always reject — accepting a honeypot-filled submission
 * would defeat the entire mechanism.
 *
 * CAPTCHA misconfiguration (provider disabled but `captchaRequired=true`)
 * always rejects to prevent silent bypass.
 */
export const runAntiAbuseChecks = async ({
  survey,
  effectiveSettings,
  payload,
  submissionToken,
  ip,
  userAgent,
  now = Date.now(),
}) => {
  const env = loadEnv();
  const settings = resolveAntiAbuseSettings(effectiveSettings);
  const honeypotFieldName = env.PUBLIC_FORM_HONEYPOT_FIELD;
  const surveyId = survey?._id?.toString() ?? null;
  const surveySlug = survey?.slug ?? null;
  const tenantId = survey?.tenantId ?? null;

  const baseContext = {
    tenantId,
    surveyId,
    surveySlug,
    submissionToken: submissionToken ?? null,
    ip,
    userAgent,
  };

  const violate = async ({ reason, message, details, errorCtor = RateLimitError }) => {
    await recordSuspicious({ ...baseContext, reason, action: settings.suspiciousAction, details });
    if (
      settings.suspiciousAction === 'flag' &&
      reason !== 'honeypot_filled' &&
      reason !== 'captcha_misconfigured'
    ) {
      // Flag mode: log and let the request through. Honeypot and CAPTCHA
      // misconfiguration are still hard-blocked because letting them through
      // would render the controls useless.
      return;
    }
    throw new errorCtor(message);
  };

  // 1. Honeypot — must fire before anything that depends on the payload so a
  // burst of honeypot-filled bots cannot be used to exhaust rate limits.
  if (settings.honeypotEnabled) {
    const honeypotValue = payload?.[honeypotFieldName];
    if (typeof honeypotValue === 'string' && honeypotValue.trim().length > 0) {
      await recordSuspicious({
        ...baseContext,
        reason: 'honeypot_filled',
        action: 'reject',
        details: { field: honeypotFieldName },
      });
      // Honeypot violations always reject. Use ValidationError so the
      // response surface looks like a malformed body to scrapers and does
      // not leak the existence of a hidden field.
      throw new ValidationError(HONEYPOT_GENERIC_MESSAGE, []);
    }
  }

  // 2. Minimum fill time — humans take seconds to read and answer; a bot
  // submitting in tens of milliseconds is suspicious.
  const minFill = Math.max(env.PUBLIC_FORM_MIN_FILL_SECONDS, settings.minFillSeconds ?? 0);
  if (minFill > 0) {
    const startedAtIso = payload?.metadata?.startedAt;
    const startedAt = startedAtIso ? new Date(startedAtIso) : null;
    if (startedAt && !Number.isNaN(startedAt.getTime())) {
      const elapsedSeconds = (now - startedAt.getTime()) / 1000;
      if (elapsedSeconds < minFill) {
        await violate({
          reason: 'too_fast',
          message: TOO_FAST_MESSAGE,
          details: { elapsedSeconds, minFill },
        });
      }
    }
  }

  // 3. Sliding-window rate limits. Each dimension uses its own counter so a
  // burst from one IP cannot mask itself by spreading across a tenant.
  const perIpLimit = resolveLimit({
    surveyOverride: settings.perIpPerMinute,
    envValue: env.PUBLIC_FORM_RATE_LIMIT_PER_IP_PER_MINUTE,
  });
  if (perIpLimit > 0 && ip) {
    const count = peekCount(`ip:${ip}`, now);
    if (count >= perIpLimit) {
      await violate({
        reason: 'rate_limit_ip',
        message: RATE_LIMIT_MESSAGE,
        details: { dimension: 'ip', count, limit: perIpLimit },
      });
    }
  }

  if (env.PUBLIC_FORM_RATE_LIMIT_PER_SURVEY_PER_MINUTE > 0 && surveyId) {
    const count = peekCount(`survey:${surveyId}`, now);
    if (count >= env.PUBLIC_FORM_RATE_LIMIT_PER_SURVEY_PER_MINUTE) {
      await violate({
        reason: 'rate_limit_survey',
        message: RATE_LIMIT_MESSAGE,
        details: {
          dimension: 'survey',
          count,
          limit: env.PUBLIC_FORM_RATE_LIMIT_PER_SURVEY_PER_MINUTE,
        },
      });
    }
  }

  if (env.PUBLIC_FORM_RATE_LIMIT_PER_TENANT_PER_MINUTE > 0 && tenantId) {
    const tenantKey = `tenant:${tenantId.toString()}`;
    const count = peekCount(tenantKey, now);
    if (count >= env.PUBLIC_FORM_RATE_LIMIT_PER_TENANT_PER_MINUTE) {
      await violate({
        reason: 'rate_limit_tenant',
        message: RATE_LIMIT_MESSAGE,
        details: {
          dimension: 'tenant',
          count,
          limit: env.PUBLIC_FORM_RATE_LIMIT_PER_TENANT_PER_MINUTE,
        },
      });
    }
  }

  const perTokenLimit = resolveLimit({
    surveyOverride: settings.perTokenPerMinute,
    envValue: env.PUBLIC_FORM_RATE_LIMIT_PER_TOKEN_PER_MINUTE,
  });
  if (perTokenLimit > 0 && submissionToken) {
    const count = peekCount(`token:${submissionToken}`, now);
    if (count >= perTokenLimit) {
      await violate({
        reason: 'rate_limit_token',
        message: RATE_LIMIT_MESSAGE,
        details: { dimension: 'token', count, limit: perTokenLimit },
      });
    }
  }

  // 4. CAPTCHA verification — verified last so the cheap checks short-circuit
  // before we make an outbound HTTP call to the provider.
  if (settings.captchaRequired) {
    const provider = getCaptchaProvider();
    if (!provider.isEnabled()) {
      await recordSuspicious({
        ...baseContext,
        reason: 'captcha_misconfigured',
        action: 'reject',
        details: { provider: provider.name },
      });
      // Always reject — flag mode does not apply to misconfiguration because
      // letting submissions through would defeat captchaRequired.
      throw new RateLimitError(CAPTCHA_FAILURE_MESSAGE);
    }
    const token = typeof payload?.captchaToken === 'string' ? payload.captchaToken.trim() : '';
    if (!token) {
      await violate({
        reason: 'captcha_missing',
        message: CAPTCHA_FAILURE_MESSAGE,
        details: {},
      });
    } else {
      const result = await provider.verify({ token, ip });
      if (!result?.ok) {
        await violate({
          reason: 'captcha_invalid',
          message: CAPTCHA_FAILURE_MESSAGE,
          details: { errorCodes: result?.errorCodes ?? [] },
        });
      }
    }
  }

  // 5. Record this hit so future checks within the same minute see the burst.
  // Recording happens after all checks pass to avoid double-counting a
  // rejected request when the same dimension would have tripped twice.
  if (ip) recordHit(`ip:${ip}`, now);
  if (surveyId) recordHit(`survey:${surveyId}`, now);
  if (tenantId) recordHit(`tenant:${tenantId.toString()}`, now);
  if (submissionToken) recordHit(`token:${submissionToken}`, now);
};
