// Centralised access to Vite environment variables so views/services never
// touch `import.meta.env` directly. Add a sensible runtime fallback so the
// frontend still mounts when an env file is missing in a fresh checkout.

const env = import.meta.env ?? {};

const trimTrailingSlash = (value) => value.replace(/\/+$/, '');

const resolvePublicFormBaseUrl = () => {
  const configured = env.VITE_PUBLIC_FORM_BASE_URL?.trim();
  if (configured) return trimTrailingSlash(configured);
  if (typeof window !== 'undefined' && window.location?.origin) {
    return trimTrailingSlash(window.location.origin);
  }
  return 'http://localhost:5173';
};

export const APP_NAME = env.VITE_APP_NAME?.trim() || 'Cupcake';
export const API_BASE_URL = trimTrailingSlash(
  env.VITE_API_BASE_URL?.trim() || 'http://localhost:4000/api/v1',
);
export const PUBLIC_FORM_BASE_URL = resolvePublicFormBaseUrl();
export const IS_DEV = Boolean(env.DEV);
export const IS_PROD = Boolean(env.PROD);

export const appConfig = Object.freeze({
  appName: APP_NAME,
  apiBaseUrl: API_BASE_URL,
  publicFormBaseUrl: PUBLIC_FORM_BASE_URL,
  isDev: IS_DEV,
  isProd: IS_PROD,
});

const SLUG_PATTERN = /^[a-z0-9-]+$/;

// Build a fully-qualified public survey URL such as `https://forms.example.com/f/customer-feedback`.
// Returns `null` when the survey has no public slug yet (e.g. drafts) or when the slug is invalid.
export const buildPublicSurveyUrl = (slug, { status } = {}) => {
  if (!slug || typeof slug !== 'string') return null;
  const normalised = slug.trim().toLowerCase();
  if (!normalised || !SLUG_PATTERN.test(normalised)) return null;
  if (status && !['published', 'paused'].includes(status)) return null;
  return `${PUBLIC_FORM_BASE_URL}/f/${normalised}`;
};
