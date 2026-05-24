# Backup and restore procedures

This document is the operational source of truth for MongoDB and object storage
backup/restore.

## MongoDB backups

Production must use provider snapshots when available, plus an application-owned
logical dump for portability.

Recommended schedule:

- Continuous provider snapshots with point-in-time recovery enabled.
- Daily `mongodump` archive retained for 30 days.
- Weekly archive retained for 12 weeks.
- Monthly archive retained for 12 months.

Run a logical backup from an operator workstation or one-off job:

```bash
MONGODB_URI="mongodb+srv://..." BACKUP_DIR="./backups/mongodb" pnpm backup:mongodb
```

The script writes a timestamped `.tar.gz` archive under `BACKUP_DIR`.

## Restore drill

Restores must be tested in a non-production environment before launch and at
least quarterly after launch.

```bash
MONGODB_RESTORE_URI="mongodb://localhost:27017/cupcake_restore_drill" \
BACKUP_ARCHIVE="./backups/mongodb/20260524T120000Z.tar.gz" \
pnpm restore-drill:mongodb
```

The restore drill script refuses URIs that look like production. After restore:

1. Start the backend against the restored database.
2. Open `/api/v1/health/ready`.
3. Sign in with a test account from the backup.
4. Verify surveys, campaigns, media metadata, payments, jobs, and webhook
   deliveries are present.
5. Run `pnpm smoke:critical` against the drill environment.
6. Record the backup archive, restore duration, operator, and result in the
   incident/change log.

## Object storage backup

Production media uses S3-compatible storage. MongoDB stores object keys and
metadata; the object bucket stores image bytes.

Required bucket controls:

- Versioning enabled.
- Server-side encryption enabled.
- Lifecycle retention aligned with customer deletion policy.
- Cross-region replication for production-critical deployments.
- Access logs or cloud audit logs enabled.

Retention strategy:

- Active objects: retain while referenced by media metadata.
- Soft-deleted media: retain at least 30 days before physical purge.
- Bucket versions: retain previous versions for at least 30 days.

Restore strategy:

1. Restore MongoDB first.
2. Restore or point to the matching object bucket/version.
3. Run a media URL spot check through `/api/v1/media/images/:id/url`.
4. Verify public forms that reference image blocks and branding logos.

## Backup alerts

Alert when:

- No MongoDB backup completed in the last 26 hours.
- A restore drill has not been recorded in the last 90 days.
- Object replication is delayed beyond the provider SLA.
- Media cleanup deletes more objects than expected for the day.
