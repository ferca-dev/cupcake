// Anonymous device key used by surveys whose responseLimit is set to
// `one_per_device`. The value is generated client-side, scoped to the survey
// slug (so the same browser can answer multiple surveys), and persisted to
// localStorage. Hardware/browser fingerprinting is intentionally avoided —
// the server only sees an opaque random string and stores its hash.

const STORAGE_PREFIX = 'cupcake.devicekey.';

const isStorageAvailable = () => {
  try {
    return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
  } catch {
    return false;
  }
};

const toBase64Url = (bytes) => {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const base64 = typeof btoa === 'function' ? btoa(binary) : '';
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const generateRandomKey = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    return toBase64Url(bytes);
  }
  // Fallback for environments without `crypto.getRandomValues` (very old
  // browsers, SSR snapshots). The key still has more than enough entropy for
  // a survey-scoped dedupe key.
  let key = '';
  for (let i = 0; i < 32; i += 1) {
    key += Math.floor(Math.random() * 36).toString(36);
  }
  return key;
};

const storageKey = (slug) => `${STORAGE_PREFIX}${slug ?? 'global'}`;

export const getOrCreateDeviceKey = (slug) => {
  const key = storageKey(slug);
  if (!isStorageAvailable()) return generateRandomKey();
  try {
    const stored = window.localStorage.getItem(key);
    if (stored && /^[A-Za-z0-9_-]{8,128}$/.test(stored)) return stored;
  } catch {
    // Storage may be blocked (Safari private mode, etc.); fall through to a
    // session-local key. The user will appear as a new device on the next
    // page load, which is acceptable for the limited usefulness of the rule.
  }
  const generated = generateRandomKey();
  try {
    window.localStorage.setItem(key, generated);
  } catch {
    // Ignore quota / privacy errors — the request will still carry the
    // generated key for the current submission.
  }
  return generated;
};

export const clearDeviceKey = (slug) => {
  if (!isStorageAvailable()) return;
  try {
    window.localStorage.removeItem(storageKey(slug));
  } catch {
    // Best-effort cleanup; ignore failures.
  }
};
