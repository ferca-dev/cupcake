import { pino } from 'pino';
import { loadEnv } from '../../config/env.js';

const env = loadEnv();

const redactPaths = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["set-cookie"]',
  'req.body.password',
  'req.body.newPassword',
  'req.body.currentPassword',
  'req.body.passwordConfirmation',
  'req.body.token',
  'req.body.refreshToken',
  'req.body.accessToken',
  'res.headers["set-cookie"]',
  '*.password',
  '*.passwordHash',
  '*.refreshToken',
  '*.accessToken',
  '*.token',
];

const baseOptions = {
  level: env.LOG_LEVEL,
  base: { app: env.APP_NAME, env: env.APP_ENV },
  redact: { paths: redactPaths, censor: '[REDACTED]' },
  timestamp: pino.stdTimeFunctions.isoTime,
};

const transport =
  env.isDevelopment || env.isTest
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:HH:MM:ss.l',
          ignore: 'pid,hostname,app,env',
          singleLine: false,
        },
      }
    : undefined;

export const logger = pino(transport ? { ...baseOptions, transport } : baseOptions);
