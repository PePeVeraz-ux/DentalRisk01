from io import BytesIO
import os
from uuid import uuid4
from sqlalchemy import create_engine, text
import pytest
from fastapi.testclient import TestClient
from PIL import Image
from sqlmodel import Session, SQLModel
from main import create_app
from core.config import Settings
from core.security import hash_password
from db.database import make_engine
from models.user_model import User

PASSWORD = 'Prueba-local-segura-2026!'


class MemoryStorage:
    def __init__(self):
        self.objects = {}
    def put(self, user_id, content):
        from uuid import uuid4
        key = f'profiles/{user_id}/{uuid4()}.jpg'
        self.objects[key] = content
        return key
    def get(self, key):
        return self.objects[key]
    def delete(self, key):
        self.objects.pop(key, None)
    def ready(self):
        return None


@pytest.fixture
def context():
    settings = Settings(environment='test', secret_key='x'*48,
        database_url='sqlite:///:memory:', minio_access_key='test-key',
        minio_secret_key='test-secret', _env_file=None)
    test_url = os.environ.get('TEST_DATABASE_URL')
    schema = 'test_' + uuid4().hex
    if test_url:
        # Each test owns a new schema; public application tables are never touched.
        admin_engine = make_engine(test_url)
        with admin_engine.begin() as connection:
            connection.execute(text(f'CREATE SCHEMA "{schema}"'))
        engine = create_engine(test_url, connect_args={'options': f'-csearch_path={schema}'})
    else:
        engine = make_engine(settings.database_url)
    SQLModel.metadata.create_all(engine)
    storage = MemoryStorage()
    app = create_app(settings, engine=engine, storage=storage)
    with Session(engine) as session:
        for role in ['ADMIN','RECEPTION','DENTIST','SUPPORT']:
            session.add(User(id=role, email=f'{role.lower()}@example.com', name=role,
                password_hash=hash_password(PASSWORD), role=role,
                dentist_id='dentist-external-1' if role == 'DENTIST' else None))
        session.commit()
    with TestClient(app) as client:
        yield client, engine, storage
    engine.dispose()
    if test_url:
        with admin_engine.begin() as connection:
            connection.execute(text(f'DROP SCHEMA "{schema}" CASCADE'))
        admin_engine.dispose()


def auth(client, role='ADMIN'):
    response = client.post('/api/v1/users/token', data={'username':f'{role.lower()}@example.com','password':PASSWORD})
    assert response.status_code == 200, response.text
    return {'Authorization':f"Bearer {response.json()['access_token']}"}


def png():
    buffer = BytesIO()
    Image.new('RGB',(20,20),'blue').save(buffer, format='PNG')
    return buffer.getvalue()
