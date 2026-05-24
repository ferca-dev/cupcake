#!/usr/bin/env bash
set -euo pipefail

: "${MONGODB_URI:?MONGODB_URI is required}"
BACKUP_DIR="${BACKUP_DIR:-./backups/mongodb}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
TARGET="${BACKUP_DIR}/${STAMP}"

mkdir -p "${TARGET}"
mongodump --uri="${MONGODB_URI}" --out="${TARGET}"
tar -C "${BACKUP_DIR}" -czf "${TARGET}.tar.gz" "${STAMP}"
rm -rf "${TARGET}"

echo "MongoDB backup written to ${TARGET}.tar.gz"
