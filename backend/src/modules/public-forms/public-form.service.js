import mongoose from 'mongoose';

import * as surveyRepo from '../surveys/survey.repository.js';
import * as responseRepo from '../responses/response.repository.js';
import * as campaignRepo from '../campaigns/campaign.repository.js';
import {
  ConflictError,
  NotFoundError,
  ResponseLimitError,
  ValidationError,
} from '../../common/errors/index.js';
import { hashResponseKey } from '../../common/utils/hashing.js';
import { DEFAULT_RESPONSE_LIMIT_MESSAGE, RESPONSE_LIMIT_MODES } from '../surveys/survey.model.js';
import { validateAnswersAgainstSchema } from './answer.validator.js';
import { assertQuota, consumeMonthlyQuota } from '../plans/plan.service.js';
import { QUOTA_KEYS } from '../plans/plan.constants.js';
import { buildAntiAbuseConfigForPublic, runAntiAbuseChecks } from './anti-abuse.service.js';
import { loadEnv } from '../../config/env.js';
import { resolveActiveDomainForHost } from '../domains/custom-domain.service.js';
import { Tenant } from '../tenants/tenant.model.js';
import { buildPublicBrandingForTenant } from '../branding/branding.service.js';

const PUBLIC_VIEW_STATUSES = new Set(['published', 'paused']);

/**
 * Returns the live response-limit configuration for a survey, falling back to
 * the legacy `oneResponsePerContact` boolean so older drafts keep working.
 */
const resolveResponseLimit = (settings = {}) => {
  const raw = settings?.responseLimit ?? {};
  let mode = RESPONSE_LIMIT_MODES.includes(raw?.mode) ? raw.mode : 'unlimited';
  if (mode === 'unlimited' && settings?.oneResponsePerContact) {
    mode = 'one_per_contact';
  }
  return {
    mode,
    deviceKeyRequired: Boolean(raw?.deviceKeyRequired) || mode === 'one_per_device',
    ipRequired: Boolean(raw?.ipRequired) || mode === 'one_per_ip',
    message:
      typeof raw?.message === 'string' && raw.message.trim().length > 0
        ? raw.message
        : DEFAULT_RESPONSE_LIMIT_MESSAGE,
  };
};

const toPublicResponseLimit = (limit) => ({
  mode: limit.mode,
  deviceKeyRequired: limit.deviceKeyRequired,
  ipRequired: limit.ipRequired,
  message: limit.message,
});

const plainSettings = (settings) => {
  if (!settings) return {};
  if (typeof settings.toObject === 'function') return settings.toObject();
  return { ...settings };
};

const mergeEffectiveSettings = (survey, version) => {
  // The version snapshot is authoritative for messages and limits because it
  // freezes whatever the survey looked like when it was published. The live
  // survey doc is used only when the snapshot is missing (older versions
  // published before settings were copied across).
  const fromSurvey = plainSettings(survey?.settings);
  const fromVersion = plainSettings(version?.settings);
  return { ...fromSurvey, ...fromVersion };
};

const toPublicSchemaView = async ({ survey, version, domain = null }) => {
  const effectiveSettings = mergeEffectiveSettings(survey, version);
  const responseLimit = resolveResponseLimit(effectiveSettings);
  const antiAbuse = buildAntiAbuseConfigForPublic({ effectiveSettings });
  const tenant = await Tenant.findById(survey.tenantId).select('settings.branding');
  const branding = await buildPublicBrandingForTenant({
    tenantId: survey.tenantId.toString(),
    branding: tenant?.settings?.branding,
  });
  return {
    survey: {
      id: survey._id.toString(),
      slug: survey.slug,
      title: survey.title,
      description: survey.description ?? null,
      status: survey.status,
      settings: {
        allowAnonymous: Boolean(effectiveSettings.allowAnonymous),
        requireContactData: Boolean(effectiveSettings.requireContactData),
        thankYouMessage: effectiveSettings.thankYouMessage ?? null,
        closeMessage: effectiveSettings.closeMessage ?? null,
        pausedMessage: effectiveSettings.pausedMessage ?? null,
        oneResponsePerContact: Boolean(effectiveSettings.oneResponsePerContact),
        collectIp: Boolean(effectiveSettings.collectIp),
        locationCapture: {
          mode: effectiveSettings.locationCapture?.mode ?? 'optional',
          minimumAccuracyMeters: effectiveSettings.locationCapture?.minimumAccuracyMeters ?? 100,
          allowIpFallback: Boolean(effectiveSettings.locationCapture?.allowIpFallback ?? true),
          storeRawIp: Boolean(effectiveSettings.locationCapture?.storeRawIp ?? false),
          requiredMessage:
            effectiveSettings.locationCapture?.requiredMessage ??
            'Location is required to submit this survey.',
        },
        responseLimit: toPublicResponseLimit(responseLimit),
        antiAbuse,
      },
    },
    version: {
      id: version._id.toString(),
      versionNumber: version.versionNumber,
      schema: version.schema,
    },
    branding,
    domain: domain
      ? {
          id: domain.id,
          hostname: domain.hostname,
          tenantId: domain.tenantId,
          sslMode: domain.sslMode,
        }
      : null,
    acceptingResponses: survey.status === 'published',
    pausedMessage: survey.status === 'paused' ? (effectiveSettings.pausedMessage ?? null) : null,
  };
};

const loadPublishedSurveyContext = async ({ slug, host = null }) => {
  const domain = await resolveActiveDomainForHost(host);
  const survey = await surveyRepo.findSurveyBySlug(slug, {
    tenantId: domain?.tenantId ?? null,
  });
  if (!survey) {
    throw new NotFoundError('Survey not found');
  }
  if (!PUBLIC_VIEW_STATUSES.has(survey.status)) {
    // draft/archived surveys are not visible at all on the public surface
    throw new NotFoundError('Survey not found');
  }
  if (!survey.publishedVersionId) {
    throw new NotFoundError('Survey not found');
  }
  const version = await surveyRepo.findVersionById({
    id: survey.publishedVersionId,
    tenantId: survey.tenantId,
  });
  if (!version) {
    throw new NotFoundError('Survey version not found');
  }
  return { survey, version, domain };
};

export const getPublicForm = async ({ slug, host = null }) => {
  const ctx = await loadPublishedSurveyContext({ slug, host });
  return toPublicSchemaView(ctx);
};

export const getPublicFormByToken = async ({ slug, submissionToken, host = null }) => {
  const ctx = await loadPublishedSurveyContext({ slug, host });
  // A token without a matching recipient is still accepted (the frontend can
  // submit responses with `allowAnonymous`) but campaign association requires
  // a real recipient. We surface the recipient channel/contact when found so
  // the renderer can pre-fill or display context.
  const recipient = await campaignRepo.findRecipientByToken({
    submissionToken,
    tenantId: ctx.survey.tenantId,
  });
  return {
    ...(await toPublicSchemaView(ctx)),
    submissionToken,
    recipient: recipient
      ? {
          id: recipient._id.toString(),
          campaignId: recipient.campaignId.toString(),
          channel: recipient.channel,
          contactId: recipient.contactId ? recipient.contactId.toString() : null,
        }
      : null,
  };
};

const truncate = (value, max) => (typeof value === 'string' ? value.slice(0, max) : value);

const isDuplicateKeyError = (err) => err?.code === 11000 || err?.code === 11001;

/**
 * Computes the dedupe hashes that need to be persisted on a response so the
 * configured response-limit can be enforced. Returns the hashes alongside the
 * pre-write existence checks the service runs to surface a friendly error
 * before relying on the partial-unique indexes as the race-condition guard.
 */
const buildLimitContext = ({ surveyId, limit, deviceKey, ip, recipient, submissionToken }) => {
  const ctx = {
    deviceKeyHash: null,
    ipHash: null,
    contactKeyHash: null,
  };

  if (limit.mode === 'one_per_device') {
    if (!deviceKey) {
      throw new ValidationError('A device key is required for this survey', [
        { path: ['deviceKey'], message: 'Device key is required' },
      ]);
    }
    ctx.deviceKeyHash = hashResponseKey({ kind: 'device', surveyId, value: deviceKey });
  }

  if (limit.mode === 'one_per_ip') {
    if (!ip) {
      throw new ValidationError('An IP address is required for this survey', [
        { path: ['metadata', 'ip'], message: 'IP address required' },
      ]);
    }
    ctx.ipHash = hashResponseKey({ kind: 'ip', surveyId, value: ip });
  }

  if (limit.mode === 'one_per_contact') {
    // Prefer the resolved contact id; fall back to the submission token so
    // tokenized links without an attached contact still dedupe per link.
    const value = recipient?.contactId ? recipient.contactId.toString() : (submissionToken ?? null);
    if (!value) {
      // No contact context at all means the rule cannot be enforced —
      // surface a clear error instead of silently allowing duplicates.
      throw new ResponseLimitError('This survey requires a personal link to respond.');
    }
    ctx.contactKeyHash = hashResponseKey({
      kind: 'contact',
      surveyId,
      value,
    });
  }

  return ctx;
};

export const submitPublicResponse = async ({
  slug,
  host = null,
  submissionToken = null,
  payload,
  ip = null,
  userAgent = null,
}) => {
  const { survey, version } = await loadPublishedSurveyContext({ slug, host });

  if (survey.status === 'paused') {
    throw new ConflictError(survey.settings?.pausedMessage ?? 'This survey is temporarily paused.');
  }
  if (survey.status !== 'published') {
    throw new ConflictError('This survey is no longer accepting responses.');
  }
  const effectiveSettings = mergeEffectiveSettings(survey, version);
  if (!effectiveSettings.allowAnonymous && !submissionToken) {
    throw new ConflictError('This survey requires a personal submission link.');
  }

  // Anti-abuse runs before any expensive work (quota check, schema
  // validation, response insert). Honeypot, rate limits, and CAPTCHA all
  // fire here so a flood of bot traffic cannot push the tenant past their
  // monthly quota or consume DB time per request.
  const env = loadEnv();
  const honeypotFieldName = env.PUBLIC_FORM_HONEYPOT_FIELD;
  const honeypotValue =
    payload?.honeypot && typeof payload.honeypot === 'object'
      ? payload.honeypot[honeypotFieldName]
      : undefined;
  await runAntiAbuseChecks({
    survey,
    effectiveSettings,
    payload: {
      captchaToken: payload?.captchaToken,
      [honeypotFieldName]: honeypotValue,
      metadata: payload?.metadata,
    },
    submissionToken,
    ip,
    userAgent,
  });

  const locationCapture = effectiveSettings.locationCapture || {};
  const loc = payload?.metadata?.location || {};
  const hasCoords = typeof loc.latitude === 'number' && typeof loc.longitude === 'number';

  if (locationCapture.mode === 'required') {
    if (!hasCoords) {
      if (!locationCapture.allowIpFallback) {
        throw new ConflictError(
          locationCapture.requiredMessage || 'Location is required to submit this survey.',
        );
      }
    } else if (
      typeof loc.accuracyMeters === 'number' &&
      typeof locationCapture.minimumAccuracyMeters === 'number' &&
      loc.accuracyMeters > locationCapture.minimumAccuracyMeters
    ) {
      throw new ConflictError(
        locationCapture.requiredMessage || 'Location is required to submit this survey.',
      );
    }
  }

  // Enforce the tenant's monthly response quota before validating the body so
  // a tenant that has run out of their plan does not consume CPU for nothing.
  // The error code is machine-readable so the public form can surface a
  // "this workspace has reached its monthly limit" message.
  await assertQuota({
    tenantId: survey.tenantId.toString(),
    quotaKey: QUOTA_KEYS.RESPONSES_MONTHLY,
  });

  const answers = validateAnswersAgainstSchema(version.schema, payload?.answers ?? []);

  // Match the token to a campaign recipient so the submitted response carries
  // campaign/recipient context for reporting and the recipient state moves to
  // `clicked` to mark engagement.
  const recipient = submissionToken
    ? await campaignRepo.findRecipientByToken({
        submissionToken,
        tenantId: survey.tenantId,
      })
    : null;

  const limit = resolveResponseLimit(effectiveSettings);
  const surveyIdString = survey._id.toString();
  const limitContext = buildLimitContext({
    surveyId: surveyIdString,
    limit,
    deviceKey: payload?.deviceKey ?? null,
    ip,
    recipient,
    submissionToken,
  });

  // Pre-flight existence checks return a friendly error before the insert
  // fires. The unique index remains the source of truth for race conditions.
  if (limitContext.deviceKeyHash) {
    const exists = await responseRepo.existsResponseByDeviceKey({
      surveyId: survey._id,
      deviceKeyHash: limitContext.deviceKeyHash,
    });
    if (exists) throw new ResponseLimitError(limit.message);
  }
  if (limitContext.ipHash) {
    const exists = await responseRepo.existsResponseByIpHash({
      surveyId: survey._id,
      ipHash: limitContext.ipHash,
    });
    if (exists) throw new ResponseLimitError(limit.message);
  }
  if (limitContext.contactKeyHash) {
    const exists = await responseRepo.existsResponseByContactKey({
      surveyId: survey._id,
      contactKeyHash: limitContext.contactKeyHash,
    });
    if (exists) throw new ResponseLimitError(limit.message);
  }

  const submittedAt = new Date();
  const startedAt = payload?.metadata?.startedAt ? new Date(payload.metadata.startedAt) : null;
  const completionTimeSeconds =
    typeof payload?.metadata?.completionTimeSeconds === 'number'
      ? payload.metadata.completionTimeSeconds
      : startedAt && !Number.isNaN(startedAt.getTime())
        ? Math.max(0, Math.round((submittedAt.getTime() - startedAt.getTime()) / 1000))
        : null;

  let response;
  try {
    response = await responseRepo.createResponse({
      tenantId: survey.tenantId,
      surveyId: survey._id,
      surveyVersionId: version._id,
      campaignId: recipient ? recipient.campaignId : null,
      campaignRecipientId: recipient ? recipient._id : null,
      contactId: recipient ? (recipient.contactId ?? null) : null,
      submissionToken: submissionToken ?? null,
      answers,
      metadata: {
        ip: locationCapture.storeRawIp ? truncate(ip, 64) : null,
        ipHash:
          limitContext.ipHash ||
          hashResponseKey({ kind: 'ip', surveyId: surveyIdString, value: ip }),
        deviceKeyHash: limitContext.deviceKeyHash,
        contactKeyHash: limitContext.contactKeyHash,
        location: {
          latitude: loc.latitude ?? null,
          longitude: loc.longitude ?? null,
          accuracyMeters: loc.accuracyMeters ?? null,
          permissionStatus: loc.permissionStatus ?? null,
          source: loc.source ?? null,
          capturedAt: loc.capturedAt ? new Date(loc.capturedAt) : null,
        },
        userAgent: truncate(userAgent, 500),
        startedAt: startedAt && !Number.isNaN(startedAt.getTime()) ? startedAt : null,
        submittedAt,
        completionTimeSeconds,
      },
    });
  } catch (err) {
    if (isDuplicateKeyError(err)) {
      // Race condition: another submission inserted the same dedupe key
      // between our existence check and this insert. The partial-unique
      // indexes catch it; surface the same friendly message as the pre-write
      // check would have produced.
      throw new ResponseLimitError(limit.message);
    }
    if (err instanceof mongoose.Error.ValidationError) {
      throw new ValidationError('Invalid response payload', [{ message: err.message }]);
    }
    throw err;
  }

  if (recipient && ['sent', 'delivered'].includes(recipient.status)) {
    recipient.status = 'clicked';
    recipient.clickedAt = submittedAt;
    await recipient.save();
  }

  // Counter increment runs after the response is committed so a failed insert
  // does not consume the quota.
  await consumeMonthlyQuota({
    tenantId: survey.tenantId.toString(),
    quotaKey: QUOTA_KEYS.RESPONSES_MONTHLY,
  });

  return {
    id: response._id.toString(),
    surveyId: survey._id.toString(),
    surveyVersionId: version._id.toString(),
    submittedAt,
    thankYouMessage: effectiveSettings.thankYouMessage ?? null,
  };
};
