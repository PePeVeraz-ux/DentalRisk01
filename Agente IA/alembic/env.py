from alembic import context
from sqlmodel import SQLModel
from core.config import Settings
from db.database import make_engine
from models import user_model  # noqa: F401

settings = Settings()
managed_tables = {'users', 'agent_sessions', 'agent_login_attempts',
                  'agent_audit', 'agent_operations', 'agent_patients',
                  'agent_patient_operations'}


def include_name(name, type_, parent_names):
    return type_ != 'table' or name in managed_tables


def include_object(obj, name, type_, reflected, compare_to):
    # The clinic owns the users -> dentists relationship and all other tables.
    if type_ == 'foreign_key_constraint' and obj.table.name == 'users':
        return False
    if type_ == 'foreign_key_constraint' and obj.table.name in {
            'agent_patients', 'agent_patient_operations'}:
        return False
    return True


if context.is_offline_mode():
    context.configure(url=settings.database_url, target_metadata=SQLModel.metadata,
                      include_name=include_name, include_object=include_object,
                      literal_binds=True)
    with context.begin_transaction():
        context.run_migrations()
else:
    engine = make_engine(settings.database_url)
    with engine.connect() as connection:
        context.configure(connection=connection, target_metadata=SQLModel.metadata,
                          include_name=include_name, include_object=include_object)
        with context.begin_transaction():
            context.run_migrations()
    engine.dispose()
