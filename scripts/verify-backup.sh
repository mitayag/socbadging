#!/bin/sh
set -eu

usage() { echo "Usage: $0 --input ABSOLUTE_BACKUP_DIRECTORY" >&2; exit 64; }
INPUT=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    --input) [ "$#" -ge 2 ] || usage; INPUT="$2"; shift 2 ;;
    *) usage ;;
  esac
done

case "$INPUT" in /*) ;; *) echo "Backup input must be an absolute path." >&2; exit 64 ;; esac
[ "$INPUT" != "/" ] || { echo "Refusing broad backup input path." >&2; exit 64; }
for file in database.sql media.tar.gz backup.properties SHA256SUMS; do
  [ -f "$INPUT/$file" ] || { echo "Missing backup artifact: $file" >&2; exit 65; }
done
grep -qx 'format=hau-soc-backup-v1' "$INPUT/backup.properties" || {
  echo "Unsupported backup format." >&2
  exit 65
}
if command -v shasum >/dev/null 2>&1; then
  (cd "$INPUT" && shasum -a 256 -c SHA256SUMS)
elif command -v sha256sum >/dev/null 2>&1; then
  (cd "$INPUT" && sha256sum -c SHA256SUMS)
else
  echo "A SHA-256 checksum utility (shasum or sha256sum) is required." >&2
  exit 69
fi
tar -tzf "$INPUT/media.tar.gz" >/dev/null
echo "Backup verification passed."
