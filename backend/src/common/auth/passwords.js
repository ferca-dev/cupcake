import bcrypt from 'bcryptjs';

const DEFAULT_SALT_ROUNDS = 12;

const getSaltRounds = () => {
  const raw = Number.parseInt(process.env.BCRYPT_SALT_ROUNDS ?? '', 10);
  if (Number.isFinite(raw) && raw >= 4 && raw <= 15) return raw;
  return DEFAULT_SALT_ROUNDS;
};

export const hashPassword = (plain) => bcrypt.hash(plain, getSaltRounds());

export const verifyPassword = (plain, hash) => {
  if (typeof plain !== 'string' || typeof hash !== 'string' || hash.length === 0) {
    return Promise.resolve(false);
  }
  return bcrypt.compare(plain, hash);
};
