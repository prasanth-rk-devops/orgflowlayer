#!/usr/bin/env bash
# Restores a backup made by backup.sh. This REPLACES the current database contents.
set -euo pipefail
cd "$(dirname "$0")/.."
FILE="${1:-}"
[ -f "$FILE" ] || { echo "Usage: $0 backups/orgflow-YYYY-MM-DD-HHMM.sql.gz"; exit 1; }
read -r -p "This will overwrite the current database with $FILE. Type 'yes' to continue: " ok
[ "$ok" = "yes" ] || { echo "Cancelled."; exit 1; }
docker compose stop backend
gunzip -c "$FILE" | docker compose exec -T db psql -U orgflow -d orgflow -v ON_ERROR_STOP=1
docker compose start backend
echo "Restore complete."
