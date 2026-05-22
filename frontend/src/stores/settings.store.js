import { defineStore } from 'pinia';

import { settingsService } from '../services/settings.service.js';
import { setLocale } from '../i18n/index.js';
import { useAuthStore } from './auth.store.js';

/**
 * Holds the loaded profile snapshot and view-level UI state for the settings
 * area. The auth store remains the source of truth for the active user,
 * tenant, and tokens — this store stays focused on async UI flows
 * (loading, saving, last error) so views can keep their templates simple.
 */
export const useSettingsStore = defineStore('settings', {
  state: () => ({
    profile: null,
    isLoading: false,
    isSavingProfile: false,
    isSavingPassword: false,
    isSavingPreferences: false,
    lastError: null,
    lastSuccess: null,
  }),

  getters: {
    locale: (state) => state.profile?.preferences?.locale ?? null,
    timezone: (state) => state.profile?.preferences?.timezone ?? null,
  },

  actions: {
    setProfile(profile) {
      this.profile = profile ?? null;
      if (profile) {
        const auth = useAuthStore();
        // Mirror the freshly-saved profile into the auth store so the topbar
        // and any other consumer that reads from `auth.user` stays in sync
        // without an extra `/auth/me` round-trip.
        auth.user = {
          ...(auth.user ?? {}),
          name: profile.name ?? auth.user?.name ?? '',
          email: profile.email ?? auth.user?.email ?? '',
          pendingEmail: profile.pendingEmail ?? null,
          phone: profile.phone ?? null,
          whatsappPhone: profile.whatsappPhone ?? null,
          preferences: profile.preferences ?? auth.user?.preferences ?? null,
        };
      }
    },

    async load() {
      this.isLoading = true;
      this.lastError = null;
      try {
        const data = await settingsService.getProfile();
        this.setProfile(data?.profile ?? null);
        return this.profile;
      } catch (err) {
        this.lastError = err?.message || 'Unable to load profile';
        throw err;
      } finally {
        this.isLoading = false;
      }
    },

    async updateProfile(payload) {
      this.isSavingProfile = true;
      this.lastError = null;
      this.lastSuccess = null;
      try {
        const data = await settingsService.updateProfile(payload);
        this.setProfile(data?.profile ?? null);
        this.lastSuccess = 'profile';
        return this.profile;
      } catch (err) {
        this.lastError = err?.message || 'Unable to update profile';
        throw err;
      } finally {
        this.isSavingProfile = false;
      }
    },

    async updatePassword(payload) {
      this.isSavingPassword = true;
      this.lastError = null;
      this.lastSuccess = null;
      try {
        const data = await settingsService.updatePassword(payload);
        this.lastSuccess = 'password';
        return data;
      } catch (err) {
        this.lastError = err?.message || 'Unable to update password';
        throw err;
      } finally {
        this.isSavingPassword = false;
      }
    },

    async updatePreferences(payload) {
      this.isSavingPreferences = true;
      this.lastError = null;
      this.lastSuccess = null;
      try {
        const data = await settingsService.updatePreferences(payload);
        this.setProfile(data?.profile ?? null);
        if (payload?.locale) {
          // Mirror the saved locale into the runtime i18n helper so the UI
          // re-renders in the chosen language immediately.
          setLocale(payload.locale);
        }
        this.lastSuccess = 'preferences';
        return this.profile;
      } catch (err) {
        this.lastError = err?.message || 'Unable to update preferences';
        throw err;
      } finally {
        this.isSavingPreferences = false;
      }
    },
  },
});
