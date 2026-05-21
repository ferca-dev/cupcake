import { randomBytes } from 'node:crypto';

const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Converts an arbitrary string into a lowercase, hyphen-separated slug
 * containing only `[a-z0-9-]`. Empty input falls back to a random token.
 */
export const slugify = (input) => {
  const base = String(input ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return base.length > 0 ? base : randomBytes(6).toString('hex');
};

export const isValidSlug = (value) =>
  typeof value === 'string' && value.length > 0 && SLUG_REGEX.test(value);

/**
 * Returns a slug guaranteed to be unique within the collection accessed by
 * `existsFn`. Caller supplies an async `(candidate) => boolean` probe.
 */
export const uniqueSlug = async (input, existsFn, { maxAttempts = 5 } = {}) => {
  const base = slugify(input);
  if (!(await existsFn(base))) return base;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const candidate = `${base}-${randomBytes(2).toString('hex')}`;
    if (!(await existsFn(candidate))) return candidate;
  }
  return `${base}-${randomBytes(4).toString('hex')}`;
};
