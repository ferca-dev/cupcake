import { describe, it, expect, afterEach } from 'vitest';

import { loadEnv, resetEnvCache } from '../config/env.js';
import {
  getMetricsSnapshot,
  recordHttpRequest,
  recordOperationalEvent,
  resetMetrics,
} from '../modules/observability/metrics.service.js';

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
  resetEnvCache();
  resetMetrics();
});

describe('production environment validation', () => {
  it('rejects unsafe production defaults', () => {
    process.env = {
      ...originalEnv,
      APP_ENV: 'production',
      APP_URL: 'http://localhost:4000',
      FRONTEND_URL: 'http://localhost:5173',
      MONGODB_URI: 'mongodb://localhost:27017/cupcake',
      JWT_ACCESS_SECRET: 'replace-me-access-secret',
      JWT_REFRESH_SECRET: 'replace-me-refresh-secret',
      SUPER_ADMIN_PASSWORD: 'ChangeMe123!',
      CORS_ORIGIN: '*',
      STORAGE_DRIVER: 'local',
      PAYMENT_PROVIDER: 'mock',
      TOKEN_PURCHASE_MODE: 'manual',
      EMAIL_PROVIDER: 'mock',
      SMS_PROVIDER: 'mock',
      WHATSAPP_PROVIDER: 'mock',
      PUBLIC_FORM_CAPTCHA_PROVIDER: 'none',
      WEBHOOK_SIGNING_SECRET: '',
      UNSUBSCRIBE_TOKEN_SECRET: '',
      JOB_QUEUE_DRIVER: 'memory',
    };
    resetEnvCache();

    expect(() => loadEnv()).toThrow(/Production JWT_ACCESS_SECRET/);
    expect(() => loadEnv()).toThrow(/Wildcard CORS/);
  });

  it('accepts a hardened production-shaped configuration', () => {
    process.env = {
      ...originalEnv,
      APP_ENV: 'production',
      APP_URL: 'https://api.example.com',
      FRONTEND_URL: 'https://app.example.com',
      MONGODB_URI: 'mongodb://mongo.example.com:27017/cupcake',
      JWT_ACCESS_SECRET: 'a'.repeat(48),
      JWT_REFRESH_SECRET: 'b'.repeat(48),
      SUPER_ADMIN_PASSWORD: 'RotatedPassword123!',
      CORS_ORIGIN: 'https://app.example.com',
      STORAGE_DRIVER: 's3',
      STORAGE_PUBLIC_BASE_URL: 'https://cdn.example.com/uploads',
      S3_REGION: 'us-east-1',
      S3_BUCKET: 'cupcake-prod',
      S3_ACCESS_KEY_ID: 'access-key',
      S3_SECRET_ACCESS_KEY: 'secret-key',
      S3_PUBLIC_BASE_URL: 'https://cdn.example.com',
      PAYMENT_PROVIDER: 'mercadopago',
      TOKEN_PURCHASE_MODE: 'online',
      MERCADOPAGO_PUBLIC_KEY: 'pk_live_123',
      MERCADOPAGO_ACCESS_TOKEN: 'mp-token',
      MERCADOPAGO_WEBHOOK_SECRET: 'mp-webhook-secret',
      EMAIL_PROVIDER: 'sendgrid',
      TWILIO_SENDGRID_API_KEY: 'sg-token',
      TWILIO_SENDGRID_FROM_EMAIL: 'no-reply@example.com',
      SMS_PROVIDER: 'twilio',
      WHATSAPP_PROVIDER: 'twilio',
      TWILIO_ACCOUNT_SID: 'AC123',
      TWILIO_AUTH_TOKEN: 'twilio-token',
      TWILIO_MESSAGING_SERVICE_SID: 'MG123',
      PUBLIC_FORM_CAPTCHA_PROVIDER: 'turnstile',
      TURNSTILE_SITE_KEY: 'site-key',
      TURNSTILE_SECRET_KEY: 'secret-key',
      WEBHOOK_SIGNING_SECRET: 'c'.repeat(48),
      UNSUBSCRIBE_TOKEN_SECRET: 'd'.repeat(48),
      JOB_QUEUE_DRIVER: 'memory',
    };
    resetEnvCache();

    expect(loadEnv().isProduction).toBe(true);
  });
});

describe('observability metrics hooks', () => {
  it('records HTTP and operational counters without storing payloads', () => {
    recordHttpRequest({
      method: 'GET',
      route: '/api/v1/health/live',
      statusCode: 200,
      durationMs: 42,
    });
    recordOperationalEvent('storage_errors_total', { driver: 's3', operation: 'uploadImage' });

    const snapshot = getMetricsSnapshot();
    expect(snapshot.httpLatency.count).toBe(1);
    expect(snapshot.counters).toHaveProperty(
      'http_requests_total{method=GET,route=/api/v1/health/live,status=200,statusClass=2xx}',
      1,
    );
    expect(snapshot.counters).toHaveProperty(
      'storage_errors_total{driver=s3,operation=uploadImage}',
      1,
    );
  });
});
