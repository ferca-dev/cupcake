import mongoose from 'mongoose';

import { DEFAULT_PUBLIC_BRANDING, PUBLIC_FORM_THEMES } from './branding.constants.js';
import { Tenant } from '../tenants/tenant.model.js';
import { MediaAsset } from '../media/media-asset.model.js';
import { assertFeature, tenantHasFeature } from '../plans/plan.service.js';
import { FEATURE_KEYS } from '../plans/plan.constants.js';
import {
  AuthorizationError,
  NotFoundError,
  ValidationError,
} from '../../common/errors/index.js';
import { recordAuditEvent } from '../audit/audit.service.js';

export const BRANDING_AUDIT_ACTIONS = Object.freeze({
  UPDATED: 'tenant.branding.updated',
});

const ENTITY_TYPE = 'tenant';

const ensureTenant = (tenantId) => {
  if (!tenantId) throw new AuthorizationError('Tenant context is required');
  if (!mongoose.isValidObjectId(tenantId)) throw new ValidationError('Invalid tenant id');
  return tenantId.toString();
};

const normalizeHex = (value, fallback = null) => {
  if (value === null || value === undefined || value === '') return fallback;
  const raw = String(value).trim();
  const hex = raw.startsWith('#') ? raw.slice(1) : raw;
  if (hex.length === 3) {
    return `#${hex
      .split('')
      .map((part) => `${part}${part}`)
      .join('')}`.toLowerCase();
  }
  return `#${hex}`.toLowerCase();
};

const hexToRgb = (value) => {
  const normalized = normalizeHex(value);
  if (!normalized) return null;
  const raw = normalized.slice(1);
  return {
    r: Number.parseInt(raw.slice(0, 2), 16),
    g: Number.parseInt(raw.slice(2, 4), 16),
    b: Number.parseInt(raw.slice(4, 6), 16),
  };
};

const channel = (value) => {
  const next = value / 255;
  return next <= 0.03928 ? next / 12.92 : ((next + 0.055) / 1.055) ** 2.4;
};

const contrastRatio = (a, b) => {
  const first = hexToRgb(a);
  const second = hexToRgb(b);
  if (!first || !second) return null;
  const l1 = 0.2126 * channel(first.r) + 0.7152 * channel(first.g) + 0.0722 * channel(first.b);
  const l2 =
    0.2126 * channel(second.r) + 0.7152 * channel(second.g) + 0.0722 * channel(second.b);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
};

const toIdString = (value) => (value ? value.toString() : null);

export const normalizeBranding = (branding = {}, { whiteLabelAllowed = true } = {}) => {
  const raw = branding && typeof branding.toObject === 'function' ? branding.toObject() : branding;
  const publicFormTheme = PUBLIC_FORM_THEMES.includes(raw?.publicFormTheme)
    ? raw.publicFormTheme
    : DEFAULT_PUBLIC_BRANDING.publicFormTheme;
  return {
    logoUrl: raw?.logoUrl ?? null,
    logoMediaAssetId: toIdString(raw?.logoMediaAssetId),
    faviconUrl: raw?.faviconUrl ?? null,
    faviconMediaAssetId: toIdString(raw?.faviconMediaAssetId),
    primaryColor: normalizeHex(raw?.primaryColor, DEFAULT_PUBLIC_BRANDING.primaryColor),
    accentColor: normalizeHex(raw?.accentColor, DEFAULT_PUBLIC_BRANDING.accentColor),
    backgroundColor: normalizeHex(raw?.backgroundColor, DEFAULT_PUBLIC_BRANDING.backgroundColor),
    textColor: normalizeHex(raw?.textColor, DEFAULT_PUBLIC_BRANDING.textColor),
    publicFormTheme,
    whiteLabel: whiteLabelAllowed ? Boolean(raw?.whiteLabel) : false,
  };
};

export const buildPublicBrandingForTenant = async ({ tenantId, branding }) => {
  const tenant = ensureTenant(tenantId);
  const hasBranding = await tenantHasFeature({
    tenantId: tenant,
    feature: FEATURE_KEYS.SURVEYS_CUSTOM_BRANDING,
  });
  if (!hasBranding) return { ...DEFAULT_PUBLIC_BRANDING };

  const whiteLabelAllowed = await tenantHasFeature({
    tenantId: tenant,
    feature: FEATURE_KEYS.SURVEYS_WHITE_LABEL,
  });
  return normalizeBranding(branding, { whiteLabelAllowed });
};

const requireTenantDoc = async (tenantId) => {
  const tenant = await Tenant.findById(ensureTenant(tenantId));
  if (!tenant) throw new NotFoundError('Tenant not found');
  return tenant;
};

const requireBrandingAsset = async ({ id, tenantId, field }) => {
  if (id === null || id === undefined) return null;
  if (!mongoose.isValidObjectId(id)) throw new ValidationError(`Invalid ${field}`);
  const asset = await MediaAsset.findOne({
    _id: id,
    tenantId,
    status: 'active',
    purpose: 'tenant_branding',
  });
  if (!asset) {
    throw new ValidationError('Branding media asset not found', [
      {
        path: [field],
        message: 'Asset must exist in this tenant and use the tenant_branding purpose',
      },
    ]);
  }
  return asset;
};

const validateContrast = (branding) => {
  const ratio = contrastRatio(branding.textColor, branding.backgroundColor);
  if (ratio !== null && ratio < 4.5) {
    throw new ValidationError('Branding colors do not meet accessibility contrast requirements', [
      {
        path: ['textColor'],
        message: 'Text and background colors must have at least 4.5:1 contrast',
      },
    ]);
  }
};

export const getBranding = async ({ tenantId }) => {
  const tenant = await requireTenantDoc(tenantId);
  const [customBrandingEnabled, whiteLabelEnabled, customDomainsEnabled] = await Promise.all([
    tenantHasFeature({
      tenantId: tenant._id.toString(),
      feature: FEATURE_KEYS.SURVEYS_CUSTOM_BRANDING,
    }),
    tenantHasFeature({
      tenantId: tenant._id.toString(),
      feature: FEATURE_KEYS.SURVEYS_WHITE_LABEL,
    }),
    tenantHasFeature({
      tenantId: tenant._id.toString(),
      feature: FEATURE_KEYS.SURVEYS_CUSTOM_DOMAINS,
    }),
  ]);
  return {
    branding: normalizeBranding(tenant.settings?.branding, {
      whiteLabelAllowed: whiteLabelEnabled,
    }),
    capabilities: {
      customBranding: customBrandingEnabled,
      whiteLabel: whiteLabelEnabled,
      customDomains: customDomainsEnabled,
    },
  };
};

export const updateBranding = async ({ tenantId, payload, actor = null, ip = null, userAgent = null }) => {
  const tenant = await requireTenantDoc(tenantId);
  await assertFeature({
    tenantId: tenant._id.toString(),
    feature: FEATURE_KEYS.SURVEYS_CUSTOM_BRANDING,
  });

  if (payload.whiteLabel === true) {
    await assertFeature({
      tenantId: tenant._id.toString(),
      feature: FEATURE_KEYS.SURVEYS_WHITE_LABEL,
    });
  }

  const [logoAsset, faviconAsset] = await Promise.all([
    requireBrandingAsset({
      id: payload.logoMediaAssetId,
      tenantId: tenant._id,
      field: 'logoMediaAssetId',
    }),
    requireBrandingAsset({
      id: payload.faviconMediaAssetId,
      tenantId: tenant._id,
      field: 'faviconMediaAssetId',
    }),
  ]);

  const current = normalizeBranding(tenant.settings?.branding);
  const patch = { ...current };
  for (const [key, value] of Object.entries(payload)) {
    if (key.endsWith('Color')) patch[key] = normalizeHex(value);
    else patch[key] = value;
  }
  if (logoAsset && payload.logoUrl === undefined) patch.logoUrl = logoAsset.publicUrl ?? current.logoUrl;
  if (faviconAsset && payload.faviconUrl === undefined) {
    patch.faviconUrl = faviconAsset.publicUrl ?? current.faviconUrl;
  }
  validateContrast(patch);

  tenant.settings = {
    ...(tenant.settings?.toObject?.() ?? tenant.settings ?? {}),
    branding: patch,
  };
  tenant.markModified('settings');
  await tenant.save();

  await recordAuditEvent({
    action: BRANDING_AUDIT_ACTIONS.UPDATED,
    entityType: ENTITY_TYPE,
    entityId: tenant._id.toString(),
    tenantId: tenant._id,
    userId: actor?.id ?? null,
    ip,
    userAgent,
    metadata: { changedKeys: Object.keys(payload) },
  });

  return getBranding({ tenantId: tenant._id.toString() });
};

export const __testing = { contrastRatio, normalizeHex };
