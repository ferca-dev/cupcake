import { z } from 'zod';

const stringWithDefault = (defaultValue) =>
  z
    .string()
    .trim()
    .min(1)
    .default(defaultValue)
    .transform((value) => value.trim());

const optionalUrl = z
  .string()
  .trim()
  .default('')
  .refine((value) => value === '' || z.string().url().safeParse(value).success, {
    message: 'Must be a valid URL',
  });

const envSchema = z
  .object({
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

    // Twilio credentials shared by the SMS and WhatsApp providers. They stay
    // optional so the default mock setup works out of the box; each real
    // provider validates the subset of variables it actually requires when it
    // is initialised.
    TWILIO_ACCOUNT_SID: z.string().trim().default(''),
    TWILIO_AUTH_TOKEN: z.string().trim().default(''),
    TWILIO_MESSAGING_SERVICE_SID: z.string().trim().default(''),
    TWILIO_SMS_FROM: z.string().trim().default(''),
    TWILIO_WHATSAPP_FROM: z.string().trim().default(''),
    TWILIO_STATUS_CALLBACK_URL: z.string().trim().default(''),

    // Twilio SendGrid email credentials.
    TWILIO_SENDGRID_API_KEY: z.string().trim().default(''),
    TWILIO_SENDGRID_FROM_EMAIL: z.string().trim().default(''),
    TWILIO_SENDGRID_FROM_NAME: z.string().trim().default('Cupcake'),
    TWILIO_SENDGRID_EVENT_WEBHOOK_SECRET: z.string().trim().default(''),

    // Signed public unsubscribe tokens use this HMAC secret when set. If left
    // empty the backend falls back to JWT_ACCESS_SECRET.
    UNSUBSCRIBE_TOKEN_SECRET: z.string().trim().default(''),

    // Token wallet / billing configuration. Tokens are internal prepaid
    // credits, not cryptocurrency. The mode controls how purchases settle:
    //   - `manual`: clients submit purchase requests, a super admin approves
    //     them, and the wallet is credited on approval. No real payment is
    //     captured.
    //   - any other non-empty value: name of a future payment provider; the
    //     model already stores the provider/reference so wiring it later is a
    //     code-only change.
    TOKEN_PURCHASE_MODE: stringWithDefault('manual'),
    DEFAULT_TOKEN_BALANCE: z.coerce.number().int().min(0).default(0),
    DEFAULT_EMAIL_TOKEN_COST: z.coerce.number().int().min(1).default(1),
    DEFAULT_SMS_TOKEN_COST: z.coerce.number().int().min(1).default(2),
    DEFAULT_WHATSAPP_TOKEN_COST: z.coerce.number().int().min(1).default(3),
    // Policy applied when a provider call fails after the wallet was already
    // debited:
    //   - `refund` (default): immediately credit the tokens back via a refund
    //     ledger entry. Safe for retries and for transient provider outages.
    //   - `charge`: keep the debit. Use when the upstream provider attempts
    //     delivery and the cost is unavoidable.
    //   - `hold`: keep the debit and surface the recipient for manual review.
    TOKEN_FAILED_SEND_POLICY: z.enum(['refund', 'charge', 'hold']).default('refund'),

    // Mercado Pago online payments configuration. The provider mode controls
    // how preferences and subscriptions are created. `mock` keeps the flow
    // self-contained for local development and tests; `mercadopago` requires
    // real credentials and is asserted below.
    MERCADOPAGO_ENV: z.enum(['sandbox', 'production']).default('sandbox'),
    MERCADOPAGO_PUBLIC_KEY: z.string().trim().default(''),
    MERCADOPAGO_ACCESS_TOKEN: z.string().trim().default(''),
    MERCADOPAGO_WEBHOOK_SECRET: z.string().trim().default(''),
    MERCADOPAGO_SUCCESS_URL: z
      .string()
      .trim()
      .url()
      .default('http://localhost:5173/billing/payment/success'),
    MERCADOPAGO_FAILURE_URL: z
      .string()
      .trim()
      .url()
      .default('http://localhost:5173/billing/payment/failure'),
    MERCADOPAGO_PENDING_URL: z
      .string()
      .trim()
      .url()
      .default('http://localhost:5173/billing/payment/pending'),
    MERCADOPAGO_NOTIFICATION_URL: z
      .string()
      .trim()
      .url()
      .default('http://localhost:4000/api/v1/webhooks/mercadopago'),
    MERCADOPAGO_STATEMENT_DESCRIPTOR: stringWithDefault('CUPCAKE'),
    PAYMENT_PROVIDER: z.enum(['mock', 'mercadopago']).default('mock'),
    PAYMENT_REMINDER_DAYS_BEFORE: z.coerce.number().int().min(0).max(60).default(3),
    LOW_TOKEN_BALANCE_THRESHOLD: z.coerce.number().int().min(0).default(100),

    STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
    STORAGE_PUBLIC_BASE_URL: z.string().trim().url().default('http://localhost:4000/uploads'),
    LOCAL_UPLOADS_DIR: stringWithDefault('./uploads'),
    MAX_IMAGE_UPLOAD_MB: z.coerce.number().positive().max(25).default(5),
    S3_ENDPOINT: z.string().trim().default(''),
    S3_REGION: z.string().trim().default(''),
    S3_BUCKET: z.string().trim().default(''),
    S3_ACCESS_KEY_ID: z.string().trim().default(''),
    S3_SECRET_ACCESS_KEY: z.string().trim().default(''),
    S3_PUBLIC_BASE_URL: optionalUrl,

    // Public form anti-abuse. The CAPTCHA provider is intentionally `none` by
    // default so local development and the seed flow keep working without
    // external credentials. `turnstile` requires both Turnstile keys and is
    // asserted below so a misconfigured environment fails fast at boot.
    PUBLIC_FORM_CAPTCHA_PROVIDER: z.enum(['none', 'turnstile']).default('none'),
    TURNSTILE_SITE_KEY: z.string().trim().default(''),
    TURNSTILE_SECRET_KEY: z.string().trim().default(''),
    // Hidden field name embedded in the rendered public form. Real browsers
    // never see it (it is off-screen and aria-hidden) so any non-empty value
    // is treated as a bot submission.
    PUBLIC_FORM_HONEYPOT_FIELD: stringWithDefault('website_url'),
    // Sliding-window rate limits used by the anti-abuse service. These guard
    // the public submission endpoint by IP, survey, tenant, and submission
    // token. `0` disables a particular dimension. The defaults are tuned so
    // legitimate respondents are unaffected.
    PUBLIC_FORM_RATE_LIMIT_PER_IP_PER_MINUTE: z.coerce.number().int().min(0).default(30),
    PUBLIC_FORM_RATE_LIMIT_PER_SURVEY_PER_MINUTE: z.coerce.number().int().min(0).default(120),
    PUBLIC_FORM_RATE_LIMIT_PER_TENANT_PER_MINUTE: z.coerce.number().int().min(0).default(600),
    PUBLIC_FORM_RATE_LIMIT_PER_TOKEN_PER_MINUTE: z.coerce.number().int().min(0).default(10),
    // Floor for the time spent on the form before a submission is allowed.
    // Bots fill and post forms in milliseconds; humans take seconds. The
    // value is a global floor; surveys can opt for a stricter floor in
    // their anti-abuse settings.
    PUBLIC_FORM_MIN_FILL_SECONDS: z.coerce.number().int().min(0).max(600).default(0),

    CORS_ORIGIN: stringWithDefault('http://localhost:5173'),

    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    REQUEST_BODY_LIMIT: stringWithDefault('100kb'),

    RATE_LIMIT_WINDOW_MS: z.coerce
      .number()
      .int()
      .positive()
      .default(15 * 60 * 1000),
    RATE_LIMIT_MAX: z.coerce.number().int().positive().default(300),

    // Background job queue. `memory` is a Mongo-backed in-process queue safe
    // for local development and single-node deployments. `redis` is reserved
    // for the future Redis adapter (not yet implemented; selecting it fails
    // fast at startup). `inline` skips queueing entirely and runs each job
    // synchronously inside the enqueueing process — only intended for tests.
    JOB_QUEUE_DRIVER: z.enum(['memory', 'redis', 'inline']).default('memory'),
    REDIS_URL: z.string().trim().default(''),
    JOB_CONCURRENCY: z.coerce.number().int().min(1).max(64).default(5),
    JOB_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(20).default(5),
    JOB_BACKOFF_SECONDS: z.coerce.number().int().min(1).max(86400).default(30),
    // How often the worker polls the job collection. Kept short so jobs
    // dispatched from the API are picked up promptly without busy-looping.
    JOB_POLL_INTERVAL_MS: z.coerce.number().int().min(50).max(60000).default(500),
    // Lock TTL — if a worker dies mid-job the lock is reclaimable after this.
    JOB_LOCK_TIMEOUT_MS: z.coerce.number().int().min(1000).max(3_600_000).default(60_000),

    // Outbound webhook + API key integration surface (Phase 32). The signing
    // secret feeds the HMAC used to derive `apiKey.secretHash` so rotating it
    // forces a re-issue of every key. Blank falls back to the JWT access
    // secret so local development keeps working without extra config.
    WEBHOOK_SIGNING_SECRET: z.string().trim().default(''),
    // Per-API-key request quota target. Phase 32 does not yet enforce this
    // at the middleware level (the global rate limiter still applies); the
    // value is exposed in env so a future phase can wire it without changing
    // the configuration contract.
    API_KEY_DEFAULT_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(1).max(10_000).default(60),

    // Observability. `ERROR_MONITORING_DSN` is intentionally provider-neutral:
    // the integration hook logs structured events today and can be adapted to
    // Sentry, Honeybadger, or another collector without changing callers.
    ERROR_MONITORING_DSN: z.string().trim().default(''),
    ERROR_MONITORING_ENVIRONMENT: z.string().trim().default(''),
    OPERATIONS_ALERT_EMAIL: z.string().trim().email().or(z.literal('')).default(''),
  })
  .superRefine((value, ctx) => {
    const isProduction = value.APP_ENV === 'production';
    const addIssue = (path, message) =>
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message });

    if (isProduction) {
      const unsafeSecret = (secret) =>
        secret.length < 32 ||
        /replace-me|changeme|change-me|secret|password|local|demo/i.test(secret);

      if (unsafeSecret(value.JWT_ACCESS_SECRET)) {
        addIssue(
          'JWT_ACCESS_SECRET',
          'Production JWT_ACCESS_SECRET must be a random value of at least 32 characters',
        );
      }
      if (unsafeSecret(value.JWT_REFRESH_SECRET)) {
        addIssue(
          'JWT_REFRESH_SECRET',
          'Production JWT_REFRESH_SECRET must be a random value of at least 32 characters',
        );
      }
      if (/changeme|change-me/i.test(value.SUPER_ADMIN_PASSWORD)) {
        addIssue('SUPER_ADMIN_PASSWORD', 'Production super admin password must be rotated');
      }
      for (const key of ['APP_URL', 'FRONTEND_URL']) {
        const parsed = new URL(value[key]);
        if (parsed.protocol !== 'https:') addIssue(key, `${key} must use HTTPS in production`);
        if (['localhost', '127.0.0.1', '0.0.0.0'].includes(parsed.hostname)) {
          addIssue(key, `${key} must not point at localhost in production`);
        }
      }
      const corsOrigins = value.CORS_ORIGIN.split(',').map((origin) => origin.trim());
      for (const origin of corsOrigins) {
        if (origin === '*') addIssue('CORS_ORIGIN', 'Wildcard CORS is forbidden in production');
        if (/localhost|127\.0\.0\.1|0\.0\.0\.0/.test(origin)) {
          addIssue('CORS_ORIGIN', 'Production CORS origins must not point at localhost');
        }
        if (origin && !origin.startsWith('https://')) {
          addIssue('CORS_ORIGIN', 'Production CORS origins must use HTTPS');
        }
      }
      if (value.PAYMENT_PROVIDER === 'mock') {
        addIssue('PAYMENT_PROVIDER', 'Production payments must not use the mock provider');
      }
      if (value.TOKEN_PURCHASE_MODE === 'manual') {
        addIssue('TOKEN_PURCHASE_MODE', 'Production token purchases must not use manual mode');
      }
      if (value.EMAIL_PROVIDER === 'mock') {
        addIssue('EMAIL_PROVIDER', 'Production email must not use the mock provider');
      }
      if (value.SMS_PROVIDER === 'mock') {
        addIssue('SMS_PROVIDER', 'Production SMS must not use the mock provider');
      }
      if (value.WHATSAPP_PROVIDER === 'mock') {
        addIssue('WHATSAPP_PROVIDER', 'Production WhatsApp must not use the mock provider');
      }
      if (!value.WEBHOOK_SIGNING_SECRET || unsafeSecret(value.WEBHOOK_SIGNING_SECRET)) {
        addIssue(
          'WEBHOOK_SIGNING_SECRET',
          'Production webhook/API-key signing secret must be a random value of at least 32 characters',
        );
      }
      if (!value.UNSUBSCRIBE_TOKEN_SECRET || unsafeSecret(value.UNSUBSCRIBE_TOKEN_SECRET)) {
        addIssue(
          'UNSUBSCRIBE_TOKEN_SECRET',
          'Production unsubscribe token secret must be a random value of at least 32 characters',
        );
      }
      if (value.PUBLIC_FORM_CAPTCHA_PROVIDER === 'none') {
        addIssue(
          'PUBLIC_FORM_CAPTCHA_PROVIDER',
          'Production public forms must use a CAPTCHA provider',
        );
      }
    }

    if (value.APP_ENV === 'production' && value.STORAGE_DRIVER === 'local') {
      addIssue('STORAGE_DRIVER', 'Production storage must use an object storage driver');
    }

    if (value.STORAGE_DRIVER === 's3') {
      for (const key of ['S3_REGION', 'S3_BUCKET', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY']) {
        if (!value[key]) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [key],
            message: `${key} is required when STORAGE_DRIVER=s3`,
          });
        }
      }
      if (isProduction) {
        if (value.S3_PUBLIC_BASE_URL && !value.S3_PUBLIC_BASE_URL.startsWith('https://')) {
          addIssue('S3_PUBLIC_BASE_URL', 'Production S3_PUBLIC_BASE_URL must use HTTPS');
        }
        if (
          value.STORAGE_PUBLIC_BASE_URL &&
          !value.STORAGE_PUBLIC_BASE_URL.startsWith('https://')
        ) {
          addIssue('STORAGE_PUBLIC_BASE_URL', 'Production STORAGE_PUBLIC_BASE_URL must use HTTPS');
        }
      }
    }

    if (value.EMAIL_PROVIDER === 'sendgrid') {
      for (const key of ['TWILIO_SENDGRID_API_KEY', 'TWILIO_SENDGRID_FROM_EMAIL']) {
        if (!value[key]) addIssue(key, `${key} is required when EMAIL_PROVIDER=sendgrid`);
      }
      if (isProduction && value.TWILIO_SENDGRID_FROM_EMAIL.endsWith('@cupcake.local')) {
        addIssue('TWILIO_SENDGRID_FROM_EMAIL', 'Production SendGrid sender must use a real domain');
      }
    }

    if (value.SMS_PROVIDER === 'twilio' || value.WHATSAPP_PROVIDER === 'twilio') {
      for (const key of ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN']) {
        if (!value[key]) addIssue(key, `${key} is required when a Twilio channel is enabled`);
      }
    }

    if (
      value.SMS_PROVIDER === 'twilio' &&
      !value.TWILIO_MESSAGING_SERVICE_SID &&
      !value.TWILIO_SMS_FROM
    ) {
      addIssue(
        'TWILIO_SMS_FROM',
        'TWILIO_SMS_FROM or TWILIO_MESSAGING_SERVICE_SID is required when SMS_PROVIDER=twilio',
      );
    }

    if (
      value.WHATSAPP_PROVIDER === 'twilio' &&
      !value.TWILIO_MESSAGING_SERVICE_SID &&
      !value.TWILIO_WHATSAPP_FROM
    ) {
      addIssue(
        'TWILIO_WHATSAPP_FROM',
        'TWILIO_WHATSAPP_FROM or TWILIO_MESSAGING_SERVICE_SID is required when WHATSAPP_PROVIDER=twilio',
      );
    }

    if (value.PAYMENT_PROVIDER === 'mercadopago') {
      for (const key of ['MERCADOPAGO_PUBLIC_KEY', 'MERCADOPAGO_ACCESS_TOKEN']) {
        if (!value[key]) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [key],
            message: `${key} is required when PAYMENT_PROVIDER=mercadopago`,
          });
        }
      }
    }

    if (value.PUBLIC_FORM_CAPTCHA_PROVIDER === 'turnstile') {
      for (const key of ['TURNSTILE_SITE_KEY', 'TURNSTILE_SECRET_KEY']) {
        if (!value[key]) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [key],
            message: `${key} is required when PUBLIC_FORM_CAPTCHA_PROVIDER=turnstile`,
          });
        }
      }
    }

    if (value.JOB_QUEUE_DRIVER === 'redis') {
      // The Redis-backed driver is documented as a future adapter. Until it
      // ships, selecting it must fail fast rather than silently fall back
      // because losing job state would be much worse than refusing to boot.
      if (!value.REDIS_URL) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['REDIS_URL'],
          message: 'REDIS_URL is required when JOB_QUEUE_DRIVER=redis',
        });
      }
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['JOB_QUEUE_DRIVER'],
        message:
          'JOB_QUEUE_DRIVER=redis is not implemented yet; use `memory` for production single-node or `inline` for tests',
      });
    }
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
    MAX_IMAGE_UPLOAD_BYTES: Math.floor(result.data.MAX_IMAGE_UPLOAD_MB * 1024 * 1024),
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
