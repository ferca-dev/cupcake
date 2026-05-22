import path from 'node:path';

export const normalizeObjectKey = (key) => {
  const normalized = key.replace(/\\/g, '/').replace(/^\/+/, '');
  const parts = normalized.split('/').filter(Boolean);
  if (parts.length === 0 || parts.some((part) => part === '.' || part === '..')) {
    throw new Error('Invalid storage key');
  }
  return parts.join('/');
};

export const assertPathInside = (baseDir, candidate) => {
  const relative = path.relative(baseDir, candidate);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('Storage path escaped uploads directory');
  }
};

export const joinPublicUrl = (baseUrl, key) => {
  if (!baseUrl) return null;
  const encodedKey = normalizeObjectKey(key)
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/');
  return `${baseUrl.replace(/\/+$/, '')}/${encodedKey}`;
};
