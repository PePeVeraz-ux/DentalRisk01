import pytest
from sqlmodel import SQLModel,Session,select
from core.config import Settings
from db.database import make_engine
from scripts.bootstrap import bootstrap
from models.user_model import User,AuditEvent


def test_initial_owner_and_audit_created_atomically(tmp_path):
    settings=Settings(environment='test',database_url='sqlite:///'+str(tmp_path/'bootstrap.db'),
        secret_key='x'*48,minio_access_key='test',minio_secret_key='test',_env_file=None)
    engine=make_engine(settings.database_url)
    SQLModel.metadata.create_all(engine)
    bootstrap(settings,'initial@example.com','Dueño de prueba','Contraseña-segura-123!')
    with Session(engine) as session:
        owner=session.exec(select(User)).one()
        audit=session.exec(select(AuditEvent)).one()
        assert owner.role=='ADMIN' and audit.actor_id==owner.id
    with pytest.raises(ValueError):
        bootstrap(settings,'other@example.com','Otro dueño','Contraseña-segura-123!')
    engine.dispose()
