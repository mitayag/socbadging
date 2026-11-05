#!/bin/sh
# Bridge Docker Compose file secrets into environment variables expected by the app.
# Secrets are never printed, logged, or placed in the image.
set -eu

load_secret() {
  variable="$1"
  path="$2"
  if [ -f "$path" ]; then
    value="$(cat "$path")"
    export "${variable}=${value}"
  fi
}

load_secret DATABASE_URL /run/secrets/database_url
load_secret SIGNER_TOKEN /run/secrets/signer_token
load_secret BREVO_SMTP_PASSWORD /run/secrets/brevo_smtp_password
load_secret BREVO_WEBHOOK_SECRET /run/secrets/brevo_webhook_secret
load_secret BOOTSTRAP_ADMIN_PASSWORD /run/secrets/bootstrap_admin_password

exec "$@"
