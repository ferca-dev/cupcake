import { z } from 'zod';

const stringWithDefault = (defaultValue) =>
  z
    .string()
    .trim()
    .min(1)
    .default(defaultValue)
    .transform((value) => value.trim());

const envSchema = z.object({
  APP_NAME: stringWithDefault('Cupcake'),
  APP_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
  APP_PORT: z.coerce.number().int().min(0).max(65535).default(4000),
  APP_URL: z.string().url().default('http://localhost:4000'),
  FRONTEND_URL: z.string().url().default('http://localhost:5173'),

  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),

  JWT_ACCESS_SECRET: z.string().min(16, 'JWT_ACCESS_SECRET must be at least 16 characters'),
  JWT_REFRESH_SECRET: z.string().min(16, 'JWT_REFRESH_SECRET must be at least 16 characters'),
  JWT_ACCESS_EXPIRES_IN: stringWithDefault('15m'),
  JWT_REFRESH_EXPIRES_IN: stringWithDefault('7d'),

  SUPER_ADMIN_NAME: stringWithDefault('Super Admin'),
  SUPER_ADMIN_EMAIL: z.string().email().default('admin@cupcake.local'),
  SUPER_ADMIN_PASSWORD: z.string().min(8).default('ChangeMe123!'),

  DEMO_CLIENT_NAME: stringWithDefault('Demo Client'),
  DEMO_CLIENT_EMAIL: z.string().email().default('client@cupcake.local'),
  DEMO_CLIENT_PASSWORD: z.string().min(8).default('ChangeMe123!'),
  DEMO_TENANT_NAME: stringWithDefault('Demo Company'),

  EMAIL_PROVIDER: stringWithDefault('mock'),
  SMS_PROVIDER: stringWithDefault('mock'),
  WHATSAPP_PROVIDER: stringWithDefault('mock'),

  CORS_ORIGIN: stringWithDefault('http://localhost:5173'),

  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  REQUEST_BODY_LIMIT: stringWithDefault('100kb'),

  RATE_LIMIT_WINDOW_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(15 * 60 * 1000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(300),
});

let cachedEnv = null;

/**
 * Parses, validates, and freezes process.env using the env schema.
 * Fails fast with a readable error if any required variable is missing or invalid.
 */
export const loadEnv = () => {
  if (cachedEnv) return cachedEnv;

  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    const error = new Error(`Invalid environment configuration:\n${issues}`);
    error.name = 'EnvValidationError';
    throw error;
  }

  const env = Object.freeze({
    ...result.data,
    isProduction: result.data.APP_ENV === 'production',
    isDevelopment: result.data.APP_ENV === 'development',
    isTest: result.data.APP_ENV === 'test',
    corsOrigins: result.data.CORS_ORIGIN.split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
  });

  cachedEnv = env;
  return env;
};

/**
 * Resets the cached env (test helper).
 */
export const resetEnvCache = () => {
  cachedEnv = null;
};
