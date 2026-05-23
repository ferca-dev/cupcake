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
  })
  .superRefine((value, ctx) => {
    if (value.APP_ENV === 'production' && value.STORAGE_DRIVER === 'local') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['STORAGE_DRIVER'],
        message: 'Production storage must use an object storage driver',
      });
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
