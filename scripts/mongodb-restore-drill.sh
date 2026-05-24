#!/usr/bin/env bash
set -euo pipefail

: "${MONGODB_RESTORE_URI:?MONGODB_RESTORE_URI is required and must point at a non-production drill database}"
: "${BACKUP_ARCHIVE:?BACKUP_ARCHIVE must point at a .tar.gz created by scripts/mongodb-backup.sh}"

if [[ "${MONGODB_RESTORE_URI}" == *"prod"* || "${MONGODB_RESTORE_URI}" == *"production"* ]]; then
  echo "Refusing to run restore drill against a URI that appears to be production." >&2
  exit 1
fi

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "${TMP_DIR}"' EXIT

tar -xzf "${BACKUP_ARCHIVE}" -C "${TMP_DIR}"
DUMP_DIR="$(find "${TMP_DIR}" -mindepth 1 -maxdepth 1 -type d | head -n 1)"

mongorestore --uri="${MONGODB_RESTORE_URI}" --drop "${DUMP_DIR}"
echo "Restore drill completed into ${MONGODB_RESTORE_URI}"
