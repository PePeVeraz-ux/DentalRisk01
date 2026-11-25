"""Cross-stack proof: agent creates a user, DentalRisk logs that user in."""
import json
import os
import subprocess
import sys
from pathlib import Path
from secrets import token_urlsafe
from uuid import uuid4

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import psycopg
from psycopg import sql
from sqlalchemy.engine import URL, make_url
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from dotenv import dotenv_values
from sqlmodel import Session
from core.config import Settings
from core.security import hash_password
from db.database import make_engine
from main import create_app
from models.user_model import User

ROOT = Path(__file__).resolve().parents[2]
AGENT = ROOT / 'Agente IA'
local = json.loads((ROOT / '.local/postgres-local.json').read_text(encoding='utf-8'))
name = 'shared_stack_' + uuid4().hex[:12]
url = URL.create('postgresql+psycopg', username='dentalrisk_local_admin',
    password=local['password'], host='127.0.0.1', port=local['port'], database=name)
admin = psycopg.connect(host='127.0.0.1', port=local['port'], dbname='postgres',
    user='dentalrisk_local_admin', password=local['password'], autocommit=True)
previous = os.environ.get('DATABASE_URL')


class ReadyStorage:
    def ready(self):
        return None


try:
    admin.execute(sql.SQL('CREATE DATABASE {}').format(sql.Identifier(name)))
    env = os.environ.copy()
    env['DATABASE_URL'] = url.render_as_string(hide_password=False)
    env['NODE_ENV'] = 'development'
    subprocess.run(['node', '--import', 'tsx', 'scripts/migrate.ts'], cwd=ROOT,
                   env=env, check=True, capture_output=True, timeout=60)
    os.environ['DATABASE_URL'] = env['DATABASE_URL']
    config = Config(str(AGENT / 'alembic.ini'))
    config.set_main_option('script_location', str(AGENT / 'alembic'))
    command.upgrade(config, 'head')
    with psycopg.connect(url.set(drivername='postgresql').render_as_string(
            hide_password=False)) as owner_db:
        owner_db.execute(sql.SQL('GRANT CONNECT ON DATABASE {} TO dentalrisk_agent').format(
            sql.Identifier(name)))
        owner_db.execute('GRANT USAGE ON SCHEMA public TO dentalrisk_agent')
        owner_db.execute('GRANT INSERT ON users TO dentalrisk_agent')
    agent_password = make_url(dotenv_values(AGENT / '.env')['DATABASE_URL']).password
    with psycopg.connect(host='127.0.0.1', port=local['port'], dbname=name,
                         user='dentalrisk_agent', password=agent_password) as agent_db:
        try:
            agent_db.execute("""INSERT INTO users(id,email,name,password_hash,role)
                VALUES ('forbidden-owner','forbidden@example.com','Forbidden','hash','ADMIN')""")
        except psycopg.errors.RaiseException:
            agent_db.rollback()
        else:
            raise AssertionError('El rol del agente pudo crear un administrador')
    engine = make_engine(env['DATABASE_URL'])
    settings = Settings(environment='test', database_url=env['DATABASE_URL'],
        secret_key=token_urlsafe(48), minio_access_key='test', minio_secret_key='test',
        clinical_connector_enabled=True, _env_file=None)
    owner_password = token_urlsafe(24)
    with Session(engine) as session:
        session.add(User(name='Owner isolated', email='owner@example.com',
            password_hash=hash_password(owner_password), role='ADMIN'))
        session.commit()
    created_password = token_urlsafe(24)
    app = create_app(settings, engine=engine, storage=ReadyStorage())
    with TestClient(app) as client:
        login = client.post('/api/v1/users/token', data={
            'username': 'owner@example.com', 'password': owner_password})
        assert login.status_code == 200, login.status_code
        headers = {'Authorization': 'Bearer ' + login.json()['access_token']}
        created = client.post('/api/v1/users', headers=headers, json={
            'name': 'Reception isolated', 'email': 'reception@example.com',
            'password': created_password, 'role': 'RECEPTION'})
        assert created.status_code == 201, (created.status_code,
            [(item['loc'], item['type']) for item in created.json().get('detail', [])])
    env['TEST_EMAIL'] = 'reception@example.com'
    env['TEST_PASSWORD'] = created_password
    node_code = """import { database } from './apps/api/src/db.ts';
import { buildApp } from './apps/api/src/app.ts';
const db = await database(); const app = await buildApp({db});
try { const response = await app.inject({method:'POST', url:'/api/v1/sessions',
headers:{origin:'http://localhost:3000'}, payload:{email:process.env.TEST_EMAIL,
password:process.env.TEST_PASSWORD}});
if(response.statusCode!==200 || response.json().user.role!=='RECEPTION')
throw Error('Shared account cannot enter DentalRisk');
console.log('Agente -> users -> inicio DentalRisk: HTTP 200, RECEPTION');
} finally { await app.close(); await db.close(); }"""
    result = subprocess.run(['node', '--import', 'tsx', '--input-type=module', '-e', node_code],
        cwd=ROOT, env=env, check=True, capture_output=True, text=True, timeout=60)
    print(result.stdout.strip())
    node_password = token_urlsafe(24)
    env['TEST_NODE_PASSWORD'] = node_password
    node_create = """import { database } from './apps/api/src/db.ts';
import argon2 from 'argon2'; import { randomUUID } from 'node:crypto';
const db=await database(); try { await db.query(
'INSERT INTO users(id,email,name,password_hash,role) VALUES($1,$2,$3,$4,$5)',
[randomUUID(),'node@example.com','Node isolated',
await argon2.hash(process.env.TEST_NODE_PASSWORD,{type:argon2.argon2id}),'RECEPTION']);
const row=(await db.query('SELECT password_hash FROM users WHERE email=$1',['node@example.com'])).rows[0];
if(!await argon2.verify(row.password_hash,process.env.TEST_NODE_PASSWORD)) throw Error('Node hash mismatch');
} finally { await db.close(); }"""
    subprocess.run(['node', '--import', 'tsx', '--input-type=module', '-e', node_create],
        cwd=ROOT, env=env, check=True, capture_output=True, text=True, timeout=60)
    engine = make_engine(env['DATABASE_URL'])
    app = create_app(settings, engine=engine, storage=ReadyStorage())
    with TestClient(app) as client:
        reverse = client.post('/api/v1/users/token', data={
            'username': 'node@example.com', 'password': node_password})
        assert reverse.status_code == 200, reverse.status_code
    print('DentalRisk -> users -> inicio Agente IA: HTTP 200, RECEPTION')
finally:
    if previous is None:
        os.environ.pop('DATABASE_URL', None)
    else:
        os.environ['DATABASE_URL'] = previous
    admin.execute(sql.SQL('DROP DATABASE IF EXISTS {} WITH (FORCE)').format(sql.Identifier(name)))
    admin.close()
