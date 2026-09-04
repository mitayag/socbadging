#!/bin/sh
set -eu

usage() {
  echo "Usage: $0 --project PROJECT --input ABSOLUTE_BACKUP_DIRECTORY --confirm-disposable PROJECT" >&2
  exit 64
}
PROJECT=""
INPUT=""
CONFIRM=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    --project) [ "$#" -ge 2 ] || usage; PROJECT="$2"; shift 2 ;;
    --input) [ "$#" -ge 2 ] || usage; INPUT="$2"; shift 2 ;;
    --confirm-disposable) [ "$#" -ge 2 ] || usage; CONFIRM="$2"; shift 2 ;;
    *) usage ;;
  esac
done

case "$PROJECT" in ""|*[!a-zA-Z0-9_-]*) usage ;; esac
[ "$CONFIRM" = "$PROJECT" ] || {
  echo "Restore requires --confirm-disposable to exactly match the target project." >&2
  exit 64
}
case "$INPUT" in /*) ;; *) echo "Backup input must be an absolute path." >&2; exit 64 ;; esac
[ "$INPUT" != "/" ] || { echo "Refusing broad backup input path." >&2; exit 64; }

"$(dirname "$0")/verify-backup.sh" --input "$INPUT" >/dev/null
docker compose -p "$PROJECT" exec -T db sh -lc \
  'exec mariadb -u"$MARIADB_USER" -p"$MARIADB_PASSWORD" "$MARIADB_DATABASE"' \
  < "$INPUT/database.sql"

MEDIA_VOLUME="${PROJECT}_media_data"
docker volume inspect "$MEDIA_VOLUME" >/dev/null
docker run --rm -v "$MEDIA_VOLUME:/restore" -v "$INPUT:/backup:ro" alpine:3.22 sh -lc \
  'find /restore -mindepth 1 -maxdepth 1 -exec rm -rf -- {} + && tar -xzf /backup/media.tar.gz -C /restore'
echo "Restore completed for disposable project $PROJECT."
