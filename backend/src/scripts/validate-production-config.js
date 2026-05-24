import { loadEnv } from '../config/env.js';

try {
  const env = loadEnv();
  process.stdout.write(
    `${JSON.stringify(
      {
        ok: true,
        appEnv: env.APP_ENV,
        appUrl: env.APP_URL,
        frontendUrl: env.FRONTEND_URL,
        storageDriver: env.STORAGE_DRIVER,
        jobQueueDriver: env.JOB_QUEUE_DRIVER,
        paymentProvider: env.PAYMENT_PROVIDER,
        emailProvider: env.EMAIL_PROVIDER,
        smsProvider: env.SMS_PROVIDER,
        whatsappProvider: env.WHATSAPP_PROVIDER,
      },
      null,
      2,
    )}\n`,
  );
} catch (err) {
  console.error(err.message);
  process.exitCode = 1;
}
