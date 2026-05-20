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
