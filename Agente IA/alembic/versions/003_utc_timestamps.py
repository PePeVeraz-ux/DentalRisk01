"""Align existing UTC values with SQLModel's timezone-aware PostgreSQL type."""
from alembic import op
import sqlalchemy as sa

revision='003'
down_revision='002'
branch_labels=None
depends_on=None

TIMESTAMPS=[('agent_users','created_at'),('agent_sessions','expires_at'),
    ('agent_login_attempts','blocked_until'),('agent_audit','created_at'),
    ('agent_operations','created_at')]


def upgrade():
    bind=op.get_bind()
    if bind.dialect.name!='postgresql': return
    inspector=sa.inspect(bind)
    for table,column in TIMESTAMPS:
        existing=next(c for c in inspector.get_columns(table) if c['name']==column)
        if not getattr(existing['type'],'timezone',False):
            op.alter_column(table,column,type_=sa.DateTime(timezone=True),
                existing_type=sa.DateTime(timezone=False),
                postgresql_using=f"{column} AT TIME ZONE 'UTC'")


def downgrade():
    if op.get_bind().dialect.name!='postgresql': return
    for table,column in TIMESTAMPS:
        op.alter_column(table,column,type_=sa.DateTime(timezone=False),
            existing_type=sa.DateTime(timezone=True),
            postgresql_using=f"{column} AT TIME ZONE 'UTC'")
