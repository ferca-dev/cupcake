import { describe, expect, it } from 'vitest';

import { buildPublicSurveyUrl, PUBLIC_FORM_BASE_URL } from '../config/env.js';

describe('buildPublicSurveyUrl', () => {
  it('builds a URL for a valid slug', () => {
    expect(buildPublicSurveyUrl('customer-feedback')).toBe(
      `${PUBLIC_FORM_BASE_URL}/f/customer-feedback`,
    );
  });

  it('lowercases slugs and trims whitespace', () => {
    expect(buildPublicSurveyUrl(' Lead-Capture ')).toBe(`${PUBLIC_FORM_BASE_URL}/f/lead-capture`);
  });

  it('returns null when no slug is provided', () => {
    expect(buildPublicSurveyUrl('')).toBeNull();
    expect(buildPublicSurveyUrl(null)).toBeNull();
    expect(buildPublicSurveyUrl(undefined)).toBeNull();
  });

  it('returns null when the slug contains invalid characters', () => {
    expect(buildPublicSurveyUrl('not a slug')).toBeNull();
    expect(buildPublicSurveyUrl('UPPER_CASE')).toBeNull();
  });

  it('returns null for draft or archived surveys', () => {
    expect(buildPublicSurveyUrl('customer-feedback', { status: 'draft' })).toBeNull();
    expect(buildPublicSurveyUrl('customer-feedback', { status: 'archived' })).toBeNull();
  });

  it('returns a URL for published and paused surveys', () => {
    expect(buildPublicSurveyUrl('customer-feedback', { status: 'published' })).toBe(
      `${PUBLIC_FORM_BASE_URL}/f/customer-feedback`,
    );
    expect(buildPublicSurveyUrl('customer-feedback', { status: 'paused' })).toBe(
      `${PUBLIC_FORM_BASE_URL}/f/customer-feedback`,
    );
  });
});
