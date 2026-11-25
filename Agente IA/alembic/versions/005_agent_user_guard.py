"""Prevent a shared agent database credential from creating clinic owners."""
from alembic import op
import sqlalchemy as sa

revision = '005'
down_revision = '004'
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    if bind.dialect.name != 'postgresql':
        return
    if 'dentists' not in sa.inspect(bind).get_table_names():
        # Standalone agent demo databases do not contain the clinic schema.
        return
    op.execute('''CREATE OR REPLACE FUNCTION guard_shared_agent_user_write()
    RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF current_user = 'dentalrisk_agent' THEN
        IF TG_OP = 'INSERT' AND NEW.role = 'ADMIN' THEN
          RAISE EXCEPTION 'El agente no puede crear administradores';
        END IF;
        IF TG_OP = 'UPDATE' AND OLD.role = 'ADMIN' AND
           NEW.active IS DISTINCT FROM OLD.active THEN
          RAISE EXCEPTION 'El agente no puede desactivar administradores';
        END IF;
      END IF;
      RETURN NEW;
    END $$''')
    op.execute('''CREATE TRIGGER guard_shared_agent_user_write
    BEFORE INSERT OR UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION guard_shared_agent_user_write()''')


def downgrade():
    if op.get_bind().dialect.name != 'postgresql':
        return
    op.execute('DROP TRIGGER IF EXISTS guard_shared_agent_user_write ON users')
    op.execute('DROP FUNCTION IF EXISTS guard_shared_agent_user_write()')
