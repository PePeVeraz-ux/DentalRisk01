"""Identidad, sesiones revocables, intentos y auditoría del agente."""
from alembic import op
import sqlalchemy as sa

revision = '001'
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    op.create_table('agent_users',
        sa.Column('id', sa.String(), primary_key=True),
        sa.Column('name', sa.String(120), nullable=False),
        sa.Column('email', sa.String(254), nullable=False),
        sa.Column('password_hash', sa.String(), nullable=False),
        sa.Column('role', sa.String(16), nullable=False),
        sa.Column('dentist_id', sa.String(64)),
        sa.Column('active', sa.Boolean(), nullable=False),
        sa.Column('profile_object_key', sa.String()),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.CheckConstraint("role IN ('ADMIN','RECEPTION','DENTIST','SUPPORT')"),
        sa.CheckConstraint("role <> 'DENTIST' OR dentist_id IS NOT NULL"))
    op.create_index('ix_agent_users_email','agent_users',['email'],unique=True)
    op.create_table('agent_sessions',
        sa.Column('token_hash',sa.String(),primary_key=True),
        sa.Column('user_id',sa.String(),sa.ForeignKey('agent_users.id'),nullable=False),
        sa.Column('expires_at',sa.DateTime(),nullable=False))
    op.create_index('ix_agent_sessions_user_id','agent_sessions',['user_id'])
    op.create_table('agent_login_attempts',
        sa.Column('key',sa.String(),primary_key=True),
        sa.Column('failures',sa.Integer(),nullable=False),
        sa.Column('blocked_until',sa.DateTime()))
    op.create_table('agent_audit',
        sa.Column('id',sa.String(),primary_key=True),
        sa.Column('actor_id',sa.String(),sa.ForeignKey('agent_users.id')),
        sa.Column('action',sa.String(64),nullable=False),
        sa.Column('entity_id',sa.String()),
        sa.Column('created_at',sa.DateTime(),nullable=False))


def downgrade():
    for table in ['agent_audit','agent_login_attempts','agent_sessions','agent_users']:
        op.drop_table(table)
