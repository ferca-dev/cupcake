import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getOrCreateDeviceKey, clearDeviceKey } from '../features/public-form/device-key.js';

describe('public-form device key', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  it('returns the same key on a second call for the same slug', () => {
    const a = getOrCreateDeviceKey('demo-survey');
    const b = getOrCreateDeviceKey('demo-survey');
    expect(a).toEqual(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]{8,128}$/);
  });

  it('generates different keys per survey slug', () => {
    const a = getOrCreateDeviceKey('survey-one');
    const b = getOrCreateDeviceKey('survey-two');
    expect(a).not.toEqual(b);
  });

  it('reissues after clear()', () => {
    const a = getOrCreateDeviceKey('demo-survey');
    clearDeviceKey('demo-survey');
    const b = getOrCreateDeviceKey('demo-survey');
    expect(a).not.toEqual(b);
  });
});
