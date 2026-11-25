"""Use DentalRisk users as the only identity table for the agent."""
from alembic import op
import sqlalchemy as sa

revision = '004'
down_revision = '003'
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if 'users' not in inspector.get_table_names():
        # An isolated installation can still run the agent, but a shared
        # installation points this migration at the DentalRisk database.
        op.create_table('users',
            sa.Column('id', sa.Text(), primary_key=True),
            sa.Column('email', sa.Text(), nullable=False, unique=True),
            sa.Column('name', sa.Text(), nullable=False),
            sa.Column('password_hash', sa.Text(), nullable=False),
            sa.Column('role', sa.Text(), nullable=False),
            sa.Column('dentist_id', sa.Text()),
            sa.Column('active', sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column('profile_object_key', sa.Text()),
            sa.Column('created_at', sa.DateTime(timezone=True), nullable=False,
                      server_default=sa.text('now()')),
            sa.CheckConstraint("role IN ('ADMIN','RECEPTION','DENTIST','SUPPORT')"),
            sa.CheckConstraint("role <> 'DENTIST' OR dentist_id IS NOT NULL"))
    else:
        columns = {item['name'] for item in inspector.get_columns('users')}
        if 'profile_object_key' not in columns:
            op.add_column('users', sa.Column('profile_object_key', sa.Text()))
        if 'created_at' not in columns:
            op.add_column('users', sa.Column('created_at', sa.DateTime(timezone=True),
                nullable=False, server_default=sa.text('now()')))

    legacy = bind.execute(sa.text('SELECT * FROM agent_users ORDER BY id')).mappings().all()
    mapping = {}
    has_dentists = 'dentists' in sa.inspect(bind).get_table_names()
    for row in legacy:
        existing = bind.execute(sa.text('SELECT id,email,role,dentist_id,profile_object_key '
            'FROM users WHERE lower(email)=lower(:email) OR id=:id'),
            {'email': row['email'], 'id': row['id']}).mappings().all()
        if len(existing) > 1:
            raise RuntimeError('Identidad ambigua al unir usuarios; revise correos e IDs')
        if existing:
            target = existing[0]
            if target['email'].lower() != row['email'].lower() or target['role'] != row['role'] or \
                    target['dentist_id'] != row['dentist_id']:
                raise RuntimeError('Usuario duplicado con identidad o rol diferente: ' + row['email'])
            if row['profile_object_key'] and target['profile_object_key'] and \
                    row['profile_object_key'] != target['profile_object_key']:
                raise RuntimeError('Fotos de perfil incompatibles: ' + row['email'])
            if row['profile_object_key'] and not target['profile_object_key']:
                bind.execute(sa.text('UPDATE users SET profile_object_key=:key WHERE id=:id'),
                    {'key': row['profile_object_key'], 'id': target['id']})
            mapping[row['id']] = target['id']
        else:
            if has_dentists and row['dentist_id'] and not bind.scalar(sa.text(
                    'SELECT 1 FROM dentists WHERE id=:id'), {'id': row['dentist_id']}):
                raise RuntimeError('Dentista sin referencia clínica: ' + row['email'])
            bind.execute(sa.text('INSERT INTO users '
                '(id,email,name,password_hash,role,dentist_id,active,profile_object_key,created_at) '
                'VALUES (:id,:email,:name,:password_hash,:role,:dentist_id,:active,'
                ':profile_object_key,:created_at)'), dict(row))
            mapping[row['id']] = row['id']

    references = [('agent_sessions', 'user_id'), ('agent_audit', 'actor_id'),
                  ('agent_operations', 'owner_id'), ('agent_operations', 'user_id')]
    for table, column in references:
        for constraint in sa.inspect(bind).get_foreign_keys(table):
            if constraint['constrained_columns'] == [column]:
                op.drop_constraint(constraint['name'], table, type_='foreignkey')
                break
    for old_id, new_id in mapping.items():
        if old_id == new_id:
            continue
        for table, column in references:
            bind.execute(sa.text(f'UPDATE {table} SET {column}=:new WHERE {column}=:old'),
                {'new': new_id, 'old': old_id})
    for table, column in references:
        op.create_foreign_key(f'fk_{table}_{column}_users', table, 'users', [column], ['id'])
    op.drop_table('agent_users')

    if bind.dialect.name == 'postgresql':
        # Changes from the web application also revoke existing agent tokens.
        op.execute('''CREATE OR REPLACE FUNCTION revoke_agent_sessions_on_user_change()
        RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
          IF NEW.password_hash IS DISTINCT FROM OLD.password_hash OR
             NEW.role IS DISTINCT FROM OLD.role OR NEW.active IS DISTINCT FROM OLD.active THEN
            DELETE FROM agent_sessions WHERE user_id = NEW.id;
          END IF;
          RETURN NEW;
        END $$''')
        op.execute('''CREATE TRIGGER revoke_agent_sessions_on_user_change
        AFTER UPDATE OF password_hash, role, active ON users
        FOR EACH ROW EXECUTE FUNCTION revoke_agent_sessions_on_user_change()''')


def downgrade():
    raise RuntimeError('La unión de identidades se revierte desde el respaldo previo a la migración')
