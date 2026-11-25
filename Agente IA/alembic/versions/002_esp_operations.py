"""Idempotency and ownership for delegated ESP operations."""
from alembic import op
import sqlalchemy as sa

revision = '002'
down_revision = '001'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table('agent_operations',
        sa.Column('id',sa.String(),primary_key=True),
        sa.Column('owner_id',sa.String(),sa.ForeignKey('agent_users.id'),nullable=False),
        sa.Column('user_id',sa.String(),sa.ForeignKey('agent_users.id'),nullable=False),
        sa.Column('kind',sa.String(32),nullable=False),
        sa.Column('request_hash',sa.String(),nullable=False),
        sa.Column('created_at',sa.DateTime(),nullable=False))
    op.create_index('ix_agent_operations_owner_id','agent_operations',['owner_id'])
    op.create_index('ix_agent_operations_user_id','agent_operations',['user_id'])


def downgrade():
    op.drop_table('agent_operations')
