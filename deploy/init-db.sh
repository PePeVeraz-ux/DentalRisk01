#!/bin/sh
set -eu
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -v app_password="$APP_DB_PASSWORD" -v backup_password="$BACKUP_DB_PASSWORD" <<'SQL'
CREATE ROLE dentalrisk_app LOGIN PASSWORD :'app_password';
CREATE ROLE dentalrisk_backup LOGIN PASSWORD :'backup_password';
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO dentalrisk_app;
ALTER DEFAULT PRIVILEGES FOR ROLE dentalrisk_owner IN SCHEMA public GRANT SELECT, INSERT, UPDATE ON TABLES TO dentalrisk_app;
GRANT USAGE ON SCHEMA public TO dentalrisk_backup;
ALTER DEFAULT PRIVILEGES FOR ROLE dentalrisk_owner IN SCHEMA public GRANT SELECT ON TABLES TO dentalrisk_backup;
SQL
