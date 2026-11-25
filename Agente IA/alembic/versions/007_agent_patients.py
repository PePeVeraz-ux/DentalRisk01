"""Track patient records and private profile images created by the ESP."""
from alembic import op
import sqlalchemy as sa

revision = '007'
down_revision = '006'
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    tables = set(sa.inspect(bind).get_table_names())
    patient_constraints = [sa.ForeignKeyConstraint(['owner_id'], ['users.id'])]
    operation_constraints = [sa.ForeignKeyConstraint(['owner_id'], ['users.id'])]
    if 'patients' in tables:
        patient_constraints.append(sa.ForeignKeyConstraint(['id'], ['patients.id']))
        operation_constraints.append(sa.ForeignKeyConstraint(['patient_id'], ['patients.id']))
    op.create_table('agent_patients',
        sa.Column('id', sa.Text(), primary_key=True),
        sa.Column('owner_id', sa.Text(), nullable=False),
        sa.Column('profile_object_key', sa.Text()),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text('now()')),
        *patient_constraints)
    op.create_index('ix_agent_patients_owner_id', 'agent_patients', ['owner_id'])
    op.create_table('agent_patient_operations',
        sa.Column('id', sa.Text(), primary_key=True),
        sa.Column('owner_id', sa.Text(), nullable=False),
        sa.Column('patient_id', sa.Text(), nullable=False),
        sa.Column('kind', sa.Text(), nullable=False),
        sa.Column('request_hash', sa.Text(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text('now()')),
        *operation_constraints)
    op.create_index('ix_agent_patient_operations_owner_id',
                    'agent_patient_operations', ['owner_id'])
    op.create_index('ix_agent_patient_operations_patient_id',
                    'agent_patient_operations', ['patient_id'])
    if bind.dialect.name == 'postgresql' and 'dentalrisk_agent' in {
            role['rolname'] for role in bind.execute(sa.text(
                'SELECT rolname FROM pg_roles')).mappings()}:
        op.execute('GRANT SELECT (id, name, reference, active), INSERT ON patients TO dentalrisk_agent') if 'patients' in tables else None
        op.execute('GRANT SELECT, INSERT, UPDATE ON agent_patients TO dentalrisk_agent')
        op.execute('GRANT SELECT, INSERT ON agent_patient_operations TO dentalrisk_agent')


def downgrade():
    raise RuntimeError('La creación de pacientes delegada y sus fotos privadas no debe revertirse')
