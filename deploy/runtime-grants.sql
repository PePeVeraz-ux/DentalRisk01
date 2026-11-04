-- Apply as migration owner after the migration and initial account creation.
GRANT SELECT,INSERT,UPDATE ON ALL TABLES IN SCHEMA public TO dentalrisk_app;
GRANT DELETE ON sessions,login_attempts TO dentalrisk_app;
REVOKE INSERT,UPDATE,DELETE ON schema_migrations FROM dentalrisk_app;
REVOKE UPDATE,DELETE ON audit,incidents FROM dentalrisk_app;
REVOKE INSERT,UPDATE,DELETE ON operation_mutex FROM dentalrisk_app;
-- SELECT FOR UPDATE on the serialization row requires UPDATE privilege on at least one column.
GRANT UPDATE(id) ON operation_mutex TO dentalrisk_app;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO dentalrisk_backup;
GRANT INSERT ON audit TO dentalrisk_backup;
GRANT UPDATE(id) ON operation_mutex TO dentalrisk_backup;
