#!/usr/bin/env bash
# Dump NinjaPay's Supabase database to a local, compressed file, and
# optionally prove the dump restores.
#
#   SUPABASE_DB_URL='postgresql://…' scripts/backup-db.sh            # dump
#   SUPABASE_DB_URL='…' RESTORE_TEST_URL='postgresql://…' scripts/backup-db.sh
#
# SUPABASE_DB_URL is the connection string from Supabase → Connect (session
# pooler or direct). Keep it in your shell or a password manager, never in the
# repo. RESTORE_TEST_URL is an empty, throwaway Postgres (a local Docker one is
# fine); the script restores into it and compares row counts. Never point it
# at the live database.
#
# The dump holds wallet addresses and claim records, so store it somewhere
# private. It holds no keys: NinjaPay never stores them.
set -euo pipefail

: "${SUPABASE_DB_URL:?Set SUPABASE_DB_URL to the database connection string}"
command -v pg_dump >/dev/null || { echo "pg_dump is not installed (it comes with PostgreSQL 15+)." >&2; exit 1; }

out_dir="${BACKUP_DIR:-backups}"
mkdir -p "$out_dir"
file="$out_dir/ninjapay-$(date -u +%Y%m%dT%H%M%SZ).dump"

# Only the app's own schema; Supabase manages auth, storage and the rest.
pg_dump "$SUPABASE_DB_URL" --schema=public --format=custom --no-owner --no-privileges --file="$file"
echo "Wrote $file ($(du -h "$file" | cut -f1))"

if [[ -n "${RESTORE_TEST_URL:-}" ]]; then
  if [[ "$RESTORE_TEST_URL" == "$SUPABASE_DB_URL" ]]; then
    echo "RESTORE_TEST_URL is the live database. Refusing." >&2
    exit 1
  fi
  pg_restore --dbname="$RESTORE_TEST_URL" --clean --if-exists --no-owner --no-privileges "$file"
  for table in claim_pools claims transactions; do
    live=$(psql "$SUPABASE_DB_URL" -Atc "select count(*) from public.$table")
    restored=$(psql "$RESTORE_TEST_URL" -Atc "select count(*) from public.$table")
    echo "$table: live $live, restored $restored"
    [[ "$live" == "$restored" ]] || { echo "Row counts differ for $table." >&2; exit 1; }
  done
  echo "Restore test passed."
fi
