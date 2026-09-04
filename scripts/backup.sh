#!/bin/sh
set -eu

usage() { echo "Usage: $0 --project PROJECT --output ABSOLUTE_DIRECTORY" >&2; exit 64; }
PROJECT=""
OUTPUT=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    --project) [ "$#" -ge 2 ] || usage; PROJECT="$2"; shift 2 ;;
    --output) [ "$#" -ge 2 ] || usage; OUTPUT="$2"; shift 2 ;;
    *) usage ;;
  esac
done

case "$PROJECT" in ""|*[!a-zA-Z0-9_-]*) usage ;; esac
case "$OUTPUT" in /*) ;; *) echo "Backup output must be an absolute path." >&2; exit 64 ;; esac
[ "$OUTPUT" != "/" ] || { echo "Refusing broad backup output path." >&2; exit 64; }
[ ! -e "$OUTPUT" ] || { echo "Backup output must not already exist." >&2; exit 73; }
[ -d "$(dirname "$OUTPUT")" ] || { echo "Backup output parent does not exist." >&2; exit 72; }

mkdir -m 700 "$OUTPUT"
trap 'rm -f "$OUTPUT/database.sql.partial" "$OUTPUT/media.tar.gz.partial"' EXIT INT TERM

docker compose -p "$PROJECT" exec -T db sh -lc \
  'exec mariadb-dump --single-transaction --routines --triggers --hex-blob -u"$MARIADB_USER" -p"$MARIADB_PASSWORD" "$MARIADB_DATABASE"' \
  > "$OUTPUT/database.sql.partial"
mv "$OUTPUT/database.sql.partial" "$OUTPUT/database.sql"

MEDIA_VOLUME="${PROJECT}_media_data"
docker volume inspect "$MEDIA_VOLUME" >/dev/null
docker run --rm -v "$MEDIA_VOLUME:/source:ro" -v "$OUTPUT:/backup" alpine:3.22 \
  sh -lc 'cd /source && tar -czf /backup/media.tar.gz.partial .'
mv "$OUTPUT/media.tar.gz.partial" "$OUTPUT/media.tar.gz"

{
  echo "format=hau-soc-backup-v1"
  echo "project=$PROJECT"
  echo "created_at=$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
} > "$OUTPUT/backup.properties"

if command -v shasum >/dev/null 2>&1; then
  (cd "$OUTPUT" && shasum -a 256 database.sql media.tar.gz backup.properties > SHA256SUMS)
elif command -v sha256sum >/dev/null 2>&1; then
  (cd "$OUTPUT" && sha256sum database.sql media.tar.gz backup.properties > SHA256SUMS)
else
  echo "A SHA-256 checksum utility (shasum or sha256sum) is required." >&2
  exit 69
fi
chmod 600 "$OUTPUT"/*
echo "Backup created at $OUTPUT"
