import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

import { useSettingsStore } from '../stores/settings.store.js';
import { useAuthStore } from '../stores/auth.store.js';
import { setAuthProvider, setRefreshHandler } from '../services/apiClient.js';

const buildJsonResponse = (body, init = {}) =>
  new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
  });

const seededProfile = {
  id: 'user-1',
  email: 'demo@cupcake.local',
  name: 'Demo User',
  role: 'client_admin',
  preferences: { locale: 'en', timezone: 'UTC' },
};

describe('settings store', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    setAuthProvider(null);
    setRefreshHandler(null);
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  it('loads the profile and mirrors it into the auth store', async () => {
    const settings = useSettingsStore();
    const auth = useAuthStore();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => buildJsonResponse({ success: true, data: { profile: seededProfile } })),
    );
    auth.bindHttpClient();

    await settings.load();

    expect(settings.profile?.email).toBe('demo@cupcake.local');
    expect(auth.user?.email).toBe('demo@cupcake.local');
    expect(settings.locale).toBe('en');
  });

  it('applies the new locale to the i18n runtime on save', async () => {
    const settings = useSettingsStore();
    useAuthStore().bindHttpClient();

    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        buildJsonResponse({
          success: true,
          data: {
            profile: {
              ...seededProfile,
              preferences: { locale: 'es', timezone: 'UTC' },
            },
          },
        }),
      ),
    );

    await settings.updatePreferences({ locale: 'es' });

    expect(settings.locale).toBe('es');
    expect(document.documentElement.getAttribute('lang')).toBe('es');
  });

  it('surfaces server errors through lastError', async () => {
    const settings = useSettingsStore();
    useAuthStore().bindHttpClient();

    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        buildJsonResponse(
          {
            success: false,
            error: { code: 'AUTHENTICATION_ERROR', message: 'Current password is incorrect' },
          },
          { status: 401 },
        ),
      ),
    );

    await expect(
      settings.updatePassword({ currentPassword: 'bad', newPassword: 'NewPass99!' }),
    ).rejects.toThrow();
    expect(settings.lastError).toMatch(/current password/i);
  });
});
