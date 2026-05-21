// Centralised access to Vite environment variables so views/services never
// touch `import.meta.env` directly. Add a sensible runtime fallback so the
// frontend still mounts when an env file is missing in a fresh checkout.

const env = import.meta.env ?? {};

export const APP_NAME = env.VITE_APP_NAME?.trim() || 'Cupcake';
export const API_BASE_URL = (
  env.VITE_API_BASE_URL?.trim() || 'http://localhost:4000/api/v1'
).replace(/\/+$/, '');
export const IS_DEV = Boolean(env.DEV);
export const IS_PROD = Boolean(env.PROD);

export const appConfig = Object.freeze({
  appName: APP_NAME,
  apiBaseUrl: API_BASE_URL,
  isDev: IS_DEV,
  isProd: IS_PROD,
});
