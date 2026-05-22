import { defineStore } from 'pinia';

import { authService } from '../services/auth.service.js';
import { apiClient, setAuthProvider, setRefreshHandler, ApiError } from '../services/apiClient.js';
import { setLocale } from '../i18n/index.js';

const STORAGE_KEY = 'cupcake.auth.session';

// Persisted shape kept intentionally small. The backend's `/auth/me` is the
// source of truth for permissions; we re-fetch it on initialise to detect a
// revoked session before any guards run.
const readSession = () => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage?.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    if (!parsed.accessToken || !parsed.refreshToken) return null;
    return parsed;
  } catch {
    return null;
  }
};

const writeSession = (session) => {
  if (typeof window === 'undefined') return;
  try {
    if (session && session.accessToken && session.refreshToken) {
      window.localStorage?.setItem(STORAGE_KEY, JSON.stringify(session));
    } else {
      window.localStorage?.removeItem(STORAGE_KEY);
    }
  } catch {
    // Ignore quota / privacy errors — the session simply will not survive a reload.
  }
};

const SUPER_ADMIN_ROLE = 'super_admin';

export const useAuthStore = defineStore('auth', {
  state: () => ({
    user: null,
    tenant: null,
    permissions: [],
    accessToken: null,
    refreshToken: null,
    isSuperAdmin: false,
    isInitialized: false,
    isLoading: false,
    lastError: null,
  }),

  getters: {
    isAuthenticated: (state) => Boolean(state.accessToken && state.user),
    role: (state) => state.user?.role ?? null,
    displayName: (state) => state.user?.name || state.user?.email || '',
    hasPermission: (state) => (permission) => {
      if (!permission) return true;
      if (state.isSuperAdmin) return true;
      return state.permissions.includes(permission);
    },
    hasRole: (state) => (roles) => {
      const required = Array.isArray(roles) ? roles : [roles];
      if (required.length === 0) return true;
      return required.includes(state.user?.role);
    },
  },

  actions: {
    bindHttpClient() {
      setAuthProvider({
        getAccessToken: () => this.accessToken,
        onUnauthorized: () => {
          this.clearSession();
        },
      });
      setRefreshHandler(() => this.refreshSession());
    },

    setSession({ user, tenant, accessToken, refreshToken, permissions, isSuperAdmin }) {
      this.user = user ?? null;
      this.tenant = tenant ?? null;
      this.accessToken = accessToken ?? null;
      this.refreshToken = refreshToken ?? null;
      this.permissions = Array.isArray(permissions) ? permissions : [];
      this.isSuperAdmin =
        typeof isSuperAdmin === 'boolean' ? isSuperAdmin : user?.role === SUPER_ADMIN_ROLE;
      writeSession({
        accessToken: this.accessToken,
        refreshToken: this.refreshToken,
      });
      // Sync the runtime locale with the server-side preference so a user who
      // logs in on a fresh browser immediately sees their saved language.
      const preferredLocale = user?.preferences?.locale;
      if (preferredLocale) setLocale(preferredLocale);
    },

    clearSession() {
      this.user = null;
      this.tenant = null;
      this.permissions = [];
      this.accessToken = null;
      this.refreshToken = null;
      this.isSuperAdmin = false;
      writeSession(null);
    },

    async initialize() {
      if (this.isInitialized) return;
      this.bindHttpClient();
      const persisted = readSession();
      if (persisted) {
        this.accessToken = persisted.accessToken;
        this.refreshToken = persisted.refreshToken;
        try {
          await this.fetchCurrentUser();
        } catch (err) {
          // Persisted tokens were invalid or expired beyond refresh — clear them.
          if (err instanceof ApiError && (err.isAuth || err.status === 401)) {
            this.clearSession();
          } else {
            // Network or unknown error: keep tokens so a later retry can succeed,
            // but do not block app boot.
            this.lastError = err?.message || 'Unable to verify session';
          }
        }
      }
      this.isInitialized = true;
    },

    async fetchCurrentUser() {
      const data = await authService.me();
      this.setSession({
        user: data?.user ?? null,
        tenant: data?.tenant ?? null,
        accessToken: this.accessToken,
        refreshToken: this.refreshToken,
        permissions: data?.permissions ?? [],
        isSuperAdmin: data?.isSuperAdmin,
      });
      return data;
    },

    async login(credentials) {
      this.isLoading = true;
      this.lastError = null;
      try {
        const data = await authService.login(credentials);
        this.setSession({
          user: data?.user ?? null,
          tenant: data?.tenant ?? null,
          accessToken: data?.accessToken ?? null,
          refreshToken: data?.refreshToken ?? null,
          permissions: data?.permissions ?? [],
        });
        return data;
      } catch (err) {
        this.lastError = err?.message ?? 'Login failed';
        throw err;
      } finally {
        this.isLoading = false;
      }
    },

    async register(payload) {
      this.isLoading = true;
      this.lastError = null;
      try {
        const data = await authService.register(payload);
        this.setSession({
          user: data?.user ?? null,
          tenant: data?.tenant ?? null,
          accessToken: data?.accessToken ?? null,
          refreshToken: data?.refreshToken ?? null,
          permissions: data?.permissions ?? [],
        });
        return data;
      } catch (err) {
        this.lastError = err?.message ?? 'Registration failed';
        throw err;
      } finally {
        this.isLoading = false;
      }
    },

    async logout() {
      const token = this.refreshToken;
      this.clearSession();
      if (!token) return;
      try {
        await authService.logout(token);
      } catch {
        // Server-side revocation failures should not block client logout.
      }
    },

    async refreshSession() {
      if (!this.refreshToken) return false;
      try {
        const data = await authService.refresh(this.refreshToken);
        if (!data?.accessToken || !data?.refreshToken) {
          this.clearSession();
          return false;
        }
        this.setSession({
          user: data.user ?? this.user,
          tenant: data.tenant ?? this.tenant,
          accessToken: data.accessToken,
          refreshToken: data.refreshToken,
          permissions: data.permissions ?? this.permissions,
        });
        return true;
      } catch {
        this.clearSession();
        return false;
      }
    },

    async forgotPassword(email) {
      this.isLoading = true;
      try {
        return await authService.forgotPassword(email);
      } finally {
        this.isLoading = false;
      }
    },
  },
});

// Convenience export to allow tests to inspect the storage key used by the
// persistence layer without reaching into the store implementation.
export const __testing = Object.freeze({
  STORAGE_KEY,
  apiClient,
});
