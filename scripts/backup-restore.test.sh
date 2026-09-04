#!/bin/sh
set -eu

PROJECT="hau_task7_backup_test"
DB_PORT="3312"
WORK_DIR="$(mktemp -d)"
BACKUP_DIR="$WORK_DIR/backup"
RESTORE_SOURCE="$WORK_DIR/restore-source"

cleanup() {
  docker compose -p "$PROJECT" down -v --remove-orphans >/dev/null 2>&1 || true
  rm -rf "$WORK_DIR"
}
trap cleanup EXIT INT TERM

export MARIADB_DATABASE="badging"
export MARIADB_USER="badging"
export MARIADB_PASSWORD="task7-disposable-db"
export MARIADB_ROOT_PASSWORD="task7-disposable-root"
export DATABASE_URL="mysql://badging:task7-disposable-db@db:3306/badging"
export APP_URL="http://localhost:3000"
export DB_HOST_PORT="$DB_PORT"

docker compose -p "$PROJECT" up -d --build db migrate media-init >/dev/null
for attempt in $(seq 1 40); do
  if docker compose -p "$PROJECT" exec -T db healthcheck.sh --connect --innodb_initialized >/dev/null 2>&1; then
    break
  fi
  [ "$attempt" -lt 40 ] || { docker compose -p "$PROJECT" logs db; exit 1; }
  sleep 1
done
MIGRATE_EXIT="$(docker wait "${PROJECT}-migrate-1")"
[ "$MIGRATE_EXIT" = "0" ] || { docker compose -p "$PROJECT" logs migrate; exit 1; }

docker compose -p "$PROJECT" exec -T db sh -lc \
  'mariadb -u"$MARIADB_USER" -p"$MARIADB_PASSWORD" "$MARIADB_DATABASE" -e "CREATE TABLE backup_probe (id INT PRIMARY KEY, public_id VARCHAR(64)); INSERT INTO backup_probe VALUES (1, '\''public-credential-1'\'');"'
docker compose -p "$PROJECT" exec -T db sh -lc \
  'exec mariadb -u"$MARIADB_USER" -p"$MARIADB_PASSWORD" "$MARIADB_DATABASE"' <<'SQL'
INSERT INTO users
  (id, name, email, normalized_email, password_hash, role, status, session_version, created_at, updated_at)
VALUES
  ('fixture-faculty', 'Backup Faculty', 'faculty@example.test', 'faculty@example.test', 'not-a-login-hash', 'FACULTY', 'ACTIVE', 0, NOW(3), NOW(3));
INSERT INTO classes
  (id, owner_user_id, course_code, title, section, term, academic_year, status, created_at, updated_at)
VALUES
  ('fixture-class', 'fixture-faculty', 'OPS-101', 'Operations', 'A', 'First', '2026-2027', 'ACTIVE', NOW(3), NOW(3));
INSERT INTO students
  (id, student_number, first_name, last_name, email, created_at, updated_at)
VALUES
  ('fixture-student', 'BACKUP-001', 'Test', 'Recipient', 'recipient@example.test', NOW(3), NOW(3));
INSERT INTO class_students
  (class_id, student_id, enrollment_status, created_at, updated_at)
VALUES
  ('fixture-class', 'fixture-student', 'ACTIVE', NOW(3), NOW(3));
INSERT INTO badge_templates
  (id, class_id, owner_user_id, name, description, criteria, image_path, status, created_at, updated_at)
VALUES
  ('fixture-badge', 'fixture-class', 'fixture-faculty', 'Backup Badge', 'Backup fixture', 'Pass the drill', 'badges/probe.txt', 'ACTIVE', NOW(3), NOW(3));
INSERT INTO badge_issuances
  (id, public_id, class_id, badge_template_id, student_id, issuer_user_id, status, issued_at, recipient_snapshot_json, achievement_snapshot_json, issuer_snapshot_json, credential_json, snapshot_version, created_at, updated_at)
VALUES
  ('fixture-issuance', 'public-credential-1', 'fixture-class', 'fixture-badge', 'fixture-student', 'fixture-faculty', 'ACTIVE', NOW(3), '{}', '{}', '{}', '{}', 1, NOW(3), NOW(3));
INSERT INTO notification_deliveries
  (id, issuance_id, type, status, recipient_email, recipient_first_name, badge_name, issuer_name, verification_url, occurred_at, attempt_count, next_attempt_at, created_at, updated_at)
VALUES
  ('fixture-notification', 'fixture-issuance', 'BADGE_ISSUED', 'PENDING', 'recipient@example.test', 'Test', 'Backup Badge', 'HAU SOC', 'https://example.test/credentials/public-credential-1', NOW(3), 0, NOW(3), NOW(3), NOW(3));
INSERT INTO audit_logs
  (id, actor_user_id, action, entity_type, entity_id, context_json, created_at)
VALUES
  ('fixture-audit', 'fixture-faculty', 'badge.issued', 'badge_issuance', 'fixture-issuance', '{}', NOW(3));
SQL
docker run --rm -v "${PROJECT}_media_data:/media" alpine:3.22 sh -lc \
  'mkdir -p /media/badges && printf "badge-media" > /media/badges/probe.txt'

EXPECTED="$(docker compose -p "$PROJECT" exec -T db sh -lc 'mariadb -N -u"$MARIADB_USER" -p"$MARIADB_PASSWORD" "$MARIADB_DATABASE" -e "SELECT CONCAT((SELECT COUNT(*) FROM users), '\'':'\'', (SELECT COUNT(*) FROM classes), '\'':'\'', (SELECT COUNT(*) FROM students), '\'':'\'', (SELECT COUNT(*) FROM badge_issuances), '\'':'\'', (SELECT COUNT(*) FROM notification_deliveries), '\'':'\'', (SELECT COUNT(*) FROM audit_logs), '\'':'\'', (SELECT public_id FROM badge_issuances WHERE id = '\''fixture-issuance'\''))"')"
[ "$EXPECTED" = "1:1:1:1:1:1:public-credential-1" ]

"$(dirname "$0")/backup.sh" --project "$PROJECT" --output "$BACKUP_DIR"
"$(dirname "$0")/verify-backup.sh" --input "$BACKUP_DIR"

docker compose -p "$PROJECT" exec -T db sh -lc \
  'mariadb -u"$MARIADB_USER" -p"$MARIADB_PASSWORD" "$MARIADB_DATABASE" -e "DELETE FROM backup_probe;"'
docker run --rm -v "${PROJECT}_media_data:/media" alpine:3.22 sh -lc 'rm -f /media/badges/probe.txt'

cp -R "$BACKUP_DIR" "$RESTORE_SOURCE"
"$(dirname "$0")/restore.sh" \
  --project "$PROJECT" \
  --input "$RESTORE_SOURCE" \
  --confirm-disposable "$PROJECT"

ROW="$(docker compose -p "$PROJECT" exec -T db sh -lc 'mariadb -N -u"$MARIADB_USER" -p"$MARIADB_PASSWORD" "$MARIADB_DATABASE" -e "SELECT CONCAT(id, '\'':'\'', public_id) FROM backup_probe"')"
[ "$ROW" = "1:public-credential-1" ]
RESTORED="$(docker compose -p "$PROJECT" exec -T db sh -lc 'mariadb -N -u"$MARIADB_USER" -p"$MARIADB_PASSWORD" "$MARIADB_DATABASE" -e "SELECT CONCAT((SELECT COUNT(*) FROM users), '\'':'\'', (SELECT COUNT(*) FROM classes), '\'':'\'', (SELECT COUNT(*) FROM students), '\'':'\'', (SELECT COUNT(*) FROM badge_issuances), '\'':'\'', (SELECT COUNT(*) FROM notification_deliveries), '\'':'\'', (SELECT COUNT(*) FROM audit_logs), '\'':'\'', (SELECT public_id FROM badge_issuances WHERE id = '\''fixture-issuance'\''))"')"
[ "$RESTORED" = "$EXPECTED" ]
MEDIA="$(docker run --rm -v "${PROJECT}_media_data:/media:ro" alpine:3.22 cat /media/badges/probe.txt)"
[ "$MEDIA" = "badge-media" ]

if "$(dirname "$0")/restore.sh" --project "$PROJECT" --input "$RESTORE_SOURCE" --confirm-disposable wrong-project >/dev/null 2>&1; then
  echo "restore accepted an incorrect disposable confirmation" >&2
  exit 1
fi

echo "Backup/restore disposable test passed."
