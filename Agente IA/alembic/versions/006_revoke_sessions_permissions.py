"""Allow clinic user updates to revoke agent sessions without table grants."""
from alembic import op
import sqlalchemy as sa

revision = '006'
down_revision = '005'
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    if bind.dialect.name != 'postgresql':
        return
    if 'agent_sessions' not in sa.inspect(bind).get_table_names():
        return
    op.execute('''CREATE OR REPLACE FUNCTION public.revoke_agent_sessions_on_user_change()
    RETURNS trigger
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = pg_catalog
    AS $$
    BEGIN
      IF NEW.password_hash IS DISTINCT FROM OLD.password_hash OR
         NEW.role IS DISTINCT FROM OLD.role OR NEW.active IS DISTINCT FROM OLD.active THEN
        DELETE FROM public.agent_sessions WHERE user_id = NEW.id;
      END IF;
      RETURN NEW;
    END $$''')


def downgrade():
    raise RuntimeError('La revocación segura de sesiones no debe revertirse')
