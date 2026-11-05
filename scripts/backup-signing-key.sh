#!/bin/sh
set -eu

usage() {
  echo "Usage: $0 --input ABSOLUTE_KEY_FILE --output ABSOLUTE_DIRECTORY --passphrase-file ABSOLUTE_FILE [--public-metadata ABSOLUTE_FILE]" >&2
  exit 64
}

INPUT=""
OUTPUT=""
PASSPHRASE_FILE=""
PUBLIC_METADATA=""

while [ "$#" -gt 0 ]; do
  case "$1" in
    --input) [ "$#" -ge 2 ] || usage; INPUT="$2"; shift 2 ;;
    --output) [ "$#" -ge 2 ] || usage; OUTPUT="$2"; shift 2 ;;
    --passphrase-file) [ "$#" -ge 2 ] || usage; PASSPHRASE_FILE="$2"; shift 2 ;;
    --public-metadata) [ "$#" -ge 2 ] || usage; PUBLIC_METADATA="$2"; shift 2 ;;
    *) usage ;;
  esac
done

case "$INPUT" in /*) ;; *) echo "Key input must be an absolute path." >&2; exit 64 ;; esac
case "$OUTPUT" in /*) ;; *) echo "Backup output must be an absolute path." >&2; exit 64 ;; esac
case "$PASSPHRASE_FILE" in /*) ;; *) echo "Passphrase file must be an absolute path." >&2; exit 64 ;; esac
[ -f "$INPUT" ] || { echo "Key input does not exist." >&2; exit 66; }
[ -f "$PASSPHRASE_FILE" ] || { echo "Passphrase file does not exist." >&2; exit 66; }
[ ! -e "$OUTPUT" ] || { echo "Backup output must not already exist." >&2; exit 73; }
[ -d "$(dirname "$OUTPUT")" ] || { echo "Backup output parent does not exist." >&2; exit 72; }
if [ -n "$PUBLIC_METADATA" ]; then
  case "$PUBLIC_METADATA" in /*) ;; *) echo "Public metadata must be an absolute path." >&2; exit 64 ;; esac
  [ -f "$PUBLIC_METADATA" ] || { echo "Public metadata does not exist." >&2; exit 66; }
fi

mkdir -m 700 "$OUTPUT"
STAGE="$OUTPUT/.stage"
mkdir -m 700 "$STAGE"
trap 'rm -rf "$STAGE"; rm -f "$OUTPUT"/*.partial' EXIT INT TERM

cp "$INPUT" "$STAGE/$(basename "$INPUT")"
chmod 600 "$STAGE/$(basename "$INPUT")"
if [ -n "$PUBLIC_METADATA" ]; then
  cp "$PUBLIC_METADATA" "$STAGE/$(basename "$PUBLIC_METADATA")"
  chmod 600 "$STAGE/$(basename "$PUBLIC_METADATA")"
fi

tar -czf "$OUTPUT/signing-key.tar.gz.partial" -C "$STAGE" .
openssl enc -aes-256-cbc -salt -pbkdf2 -iter 600000 \
  -in "$OUTPUT/signing-key.tar.gz.partial" \
  -out "$OUTPUT/signing-key.tar.gz.enc.partial" \
  -pass "file:$PASSPHRASE_FILE"
rm -rf "$STAGE"
rm -f "$OUTPUT/signing-key.tar.gz.partial"
mv "$OUTPUT/signing-key.tar.gz.enc.partial" "$OUTPUT/signing-key.tar.gz.enc"

{
  echo "format=hau-soc-signing-key-backup-v1"
  echo "created_at=$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
  echo "key_filename=$(basename "$INPUT")"
} > "$OUTPUT/backup.properties"

if command -v shasum >/dev/null 2>&1; then
  (cd "$OUTPUT" && shasum -a 256 signing-key.tar.gz.enc backup.properties > SHA256SUMS)
elif command -v sha256sum >/dev/null 2>&1; then
  (cd "$OUTPUT" && sha256sum signing-key.tar.gz.enc backup.properties > SHA256SUMS)
else
  echo "A SHA-256 checksum utility (shasum or sha256sum) is required." >&2
  exit 69
fi
chmod 600 "$OUTPUT"/*
echo "Encrypted signing-key backup created at $OUTPUT"
