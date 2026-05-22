// Test environment defaults. Tests must run without a real database or .env
// file, so we populate the minimum set of variables that env.js requires and
// pick a value of APP_ENV=test so loggers and middleware adjust accordingly.

process.env.APP_ENV = process.env.APP_ENV ?? 'test';
process.env.APP_PORT = process.env.APP_PORT ?? '0';
process.env.APP_URL = process.env.APP_URL ?? 'http://localhost:4000';
process.env.FRONTEND_URL = process.env.FRONTEND_URL ?? 'http://localhost:5173';
process.env.MONGODB_URI = process.env.MONGODB_URI ?? 'mongodb://localhost:27017/cupcake-test';
process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET ?? 'test-access-secret-value-1234';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET ?? 'test-refresh-secret-value-1234';
process.env.CORS_ORIGIN = process.env.CORS_ORIGIN ?? 'http://localhost:5173';
process.env.LOG_LEVEL = process.env.LOG_LEVEL ?? 'silent';

// Token wallet defaults for tests. The default starting balance is set high
// so the long-standing campaign tests (written before the wallet existed)
// keep sending without explicit wallet setup. Token-specific tests override
// this by creating wallets with the balances they need.
process.env.DEFAULT_TOKEN_BALANCE = process.env.DEFAULT_TOKEN_BALANCE ?? '1000000';
process.env.DEFAULT_EMAIL_TOKEN_COST = process.env.DEFAULT_EMAIL_TOKEN_COST ?? '1';
process.env.DEFAULT_SMS_TOKEN_COST = process.env.DEFAULT_SMS_TOKEN_COST ?? '2';
process.env.DEFAULT_WHATSAPP_TOKEN_COST = process.env.DEFAULT_WHATSAPP_TOKEN_COST ?? '3';
process.env.TOKEN_FAILED_SEND_POLICY = process.env.TOKEN_FAILED_SEND_POLICY ?? 'refund';
process.env.TOKEN_PURCHASE_MODE = process.env.TOKEN_PURCHASE_MODE ?? 'manual';

process.env.STORAGE_DRIVER = process.env.STORAGE_DRIVER ?? 'local';
process.env.STORAGE_PUBLIC_BASE_URL =
  process.env.STORAGE_PUBLIC_BASE_URL ?? 'http://localhost:4000/uploads';
process.env.LOCAL_UPLOADS_DIR = process.env.LOCAL_UPLOADS_DIR ?? './tmp/test-uploads';
process.env.MAX_IMAGE_UPLOAD_MB = process.env.MAX_IMAGE_UPLOAD_MB ?? '5';
