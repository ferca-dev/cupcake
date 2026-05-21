import en from './en.js';
import es from './es.js';

// Lightweight i18n helper. Components import `useI18n` and call `t(key)` or
// `t(key, { name: 'Ada' })`. Strings live exclusively in `src/i18n/*.js` so
// they can later be swapped out for a full library (vue-i18n) without
// touching the views. Missing keys fall back to the English bundle and then
// to the raw key, which makes drift obvious in development.

import { computed, ref } from 'vue';

const SUPPORTED_LOCALES = Object.freeze(['en', 'es']);
const DEFAULT_LOCALE = 'en';
const STORAGE_KEY = 'cupcake.locale';

const bundles = { en, es };

const resolveInitialLocale = () => {
  if (typeof window !== 'undefined') {
    const stored = window.localStorage?.getItem(STORAGE_KEY);
    if (stored && SUPPORTED_LOCALES.includes(stored)) return stored;
    const nav = window.navigator?.language?.slice(0, 2);
    if (nav && SUPPORTED_LOCALES.includes(nav)) return nav;
  }
  return DEFAULT_LOCALE;
};

const locale = ref(resolveInitialLocale());

const lookup = (bundle, key) => {
  return key.split('.').reduce((acc, segment) => {
    if (acc && typeof acc === 'object' && segment in acc) return acc[segment];
    return undefined;
  }, bundle);
};

const interpolate = (template, vars) => {
  if (!vars || typeof template !== 'string') return template;
  return template.replace(/\{(\w+)\}/g, (match, name) =>
    Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : match,
  );
};

export const t = (key, vars) => {
  const primary = lookup(bundles[locale.value] ?? {}, key);
  if (typeof primary === 'string') return interpolate(primary, vars);
  const fallback = lookup(bundles[DEFAULT_LOCALE], key);
  if (typeof fallback === 'string') return interpolate(fallback, vars);
  return key;
};

export const setLocale = (next) => {
  if (!SUPPORTED_LOCALES.includes(next)) return;
  locale.value = next;
  if (typeof window !== 'undefined') {
    window.localStorage?.setItem(STORAGE_KEY, next);
    document.documentElement.setAttribute('lang', next);
  }
};

export const useI18n = () => ({
  t,
  locale: computed(() => locale.value),
  supportedLocales: SUPPORTED_LOCALES,
  setLocale,
});
