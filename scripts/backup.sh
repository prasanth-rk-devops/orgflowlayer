#!/usr/bin/env bash
# Dumps the OrgFlow database (compressed) to ./backups. Uploads live in the "uploads" volume; back that up too.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p backups
OUT="backups/orgflow-$(date +%F-%H%M).sql.gz"
docker compose exec -T db pg_dump -U orgflow --clean --if-exists orgflow | gzip > "$OUT"
echo "Backup written to $OUT ($(du -h "$OUT" | cut -f1))"
