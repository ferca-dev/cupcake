# Operations runbooks

Use these runbooks for production incidents. Keep customer-facing updates
separate from internal notes; do not paste secrets, access tokens, raw payment
payloads, or personal data into incident channels.

## Monitoring endpoints

| Endpoint                           | Access      | Purpose                                                                             |
| ---------------------------------- | ----------- | ----------------------------------------------------------------------------------- |
| `/api/v1/health/live`              | Public      | Process liveness. Does not check dependencies.                                      |
| `/api/v1/health/ready`             | Public      | Readiness gate. Returns `503` when critical dependencies are unavailable.           |
| `/api/v1/health/dependencies`      | Public      | Sanitized dependency summary.                                                       |
| `/api/v1/admin/operations/summary` | Super admin | Jobs, webhook failures, payment failures, storage counters, and in-process metrics. |
| `/api/v1/admin/operations/metrics` | Super admin | JSON metrics or Prometheus text when `Accept: text/plain` is sent.                  |

Recommended alert thresholds:

- Readiness failing for 2 consecutive minutes.
- HTTP 5xx rate above 1% for 5 minutes.
- p95 API latency above 1.5s for 10 minutes.
- Job `dead_letter` count greater than 0.
- Queued jobs older than 15 minutes.
- Webhook dead letters greater than 0 in 24 hours.
- Payment webhook failures greater than 0 in 15 minutes.
- Storage errors greater than 0 in 15 minutes.

## Payment incident

Symptoms: Mercado Pago checkout errors, pending payments not crediting tokens,
or payment webhooks failing.

1. Check `/api/v1/admin/operations/summary` for `payments.failedWebhooks`.
2. Review `/api/v1/admin/payment-webhooks` for failed or skipped events.
3. Verify `PAYMENT_PROVIDER`, `MERCADOPAGO_ACCESS_TOKEN`,
   `MERCADOPAGO_WEBHOOK_SECRET`, and notification URL configuration.
4. Confirm Mercado Pago service status outside the app.
5. Reconcile affected payments from `/api/v1/admin/payments/reconcile`.
6. If tokens were not credited, approve or adjust through the token wallet
   admin flow. Record the payment id and ledger entry id.

## Failed webhooks

Symptoms: tenant integrations are not receiving events.

1. Check the tenant endpoint delivery log in the developer console.
2. Inspect `/api/v1/admin/operations/summary` for failed/dead-letter counts.
3. Confirm the endpoint URL is reachable and returns a 2xx response in under
   10 seconds.
4. Ask the tenant to verify signature handling using the endpoint secret.
5. Retry dead-letter jobs only after the receiver is fixed.
6. Rotate the webhook secret if the endpoint was compromised.

## Campaign failures

Symptoms: sends stuck, skipped unexpectedly, or provider failures.

1. Check `/api/v1/admin/jobs` for campaign send jobs in `failed` or
   `dead_letter`.
2. Review the campaign report for skipped and failed recipient reasons.
3. Check token balance, send limits, and channel pricing.
4. Verify provider credentials and provider status.
5. Retry failed jobs only after the root cause is fixed.
6. If provider charges were incurred but sends failed, apply the configured
   failed-send policy and record any manual token adjustment.

## Queue backlog

Symptoms: queued jobs growing or scheduled jobs not running.

1. Check `/api/v1/admin/jobs/stats`.
2. Confirm at least one worker process is running with the same env as the API.
3. Check worker logs for handler errors or Mongo connectivity issues.
4. Scale worker concurrency only after Mongo health is stable.
5. Retry or dead-letter individual jobs after identifying the failing handler.

## Storage outage

Symptoms: media upload/download failures, broken public images, or readiness
storage check failing.

1. Check `/api/v1/health/ready` and `/api/v1/admin/operations/summary`.
2. Verify S3 bucket, credentials, endpoint, region, and CDN health.
3. Disable destructive media cleanup jobs until storage is stable.
4. If metadata exists but objects are missing, restore object versions from the
   bucket backup.
5. Run media URL spot checks after recovery.

## Restore

Use [backup-and-restore.md](backup-and-restore.md). Never restore into
production without an approved change window and a current backup.

## Compromised credentials

1. Revoke the affected secret in the provider console or secrets manager.
2. Rotate app env values and redeploy API and worker processes.
3. For JWT compromise, rotate both JWT secrets and force all users to sign in
   again by revoking refresh tokens.
4. For API key compromise, revoke affected tenant API keys and rotate
   `WEBHOOK_SIGNING_SECRET` only if hash derivation itself was exposed.
5. For webhook endpoint compromise, rotate endpoint secrets from the developer
   console.
6. Review audit logs for unusual admin, payment, and developer actions.

## Secret rotation cadence

| Secret                                   | Cadence                     | Notes                                           |
| ---------------------------------------- | --------------------------- | ----------------------------------------------- |
| JWT access/refresh secrets               | 90 days or incident         | Rotation invalidates existing sessions.         |
| Twilio/Auth/SendGrid keys                | 90 days or personnel change | Rotate in provider first, then deploy env.      |
| Mercado Pago access token/webhook secret | 90 days or incident         | Coordinate with webhook signature verification. |
| S3 access keys                           | 90 days                     | Prefer workload identity over static keys.      |
| API keys                                 | Customer-controlled         | Revoke and reissue from developer console.      |
| Webhook endpoint secrets                 | On receiver compromise      | Rotating returns the new secret once.           |
