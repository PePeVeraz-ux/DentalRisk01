"""Exercise the shared-user Alembic migration in a disposable PostgreSQL DB."""
import json
import os
from pathlib import Path
from uuid import uuid4

import psycopg
from psycopg import sql
from sqlalchemy import create_engine, text
from sqlalchemy.engine import URL
from alembic import command
from alembic.config import Config

root = Path(__file__).resolve().parents[2]
local = json.loads((root / '.local/postgres-local.json').read_text(encoding='utf-8'))
name = 'shared_verify_' + uuid4().hex[:12]
url = URL.create('postgresql+psycopg', username='dentalrisk_local_admin',
    password=local['password'], host='127.0.0.1', port=local['port'], database=name)
admin = psycopg.connect(host='127.0.0.1', port=local['port'], dbname='postgres',
    user='dentalrisk_local_admin', password=local['password'], autocommit=True)
previous = os.environ.get('DATABASE_URL')
try:
    admin.execute(sql.SQL('CREATE DATABASE {}').format(sql.Identifier(name)))
    os.environ['DATABASE_URL'] = url.render_as_string(hide_password=False)
    config = Config(str(Path(__file__).resolve().parents[1] / 'alembic.ini'))
    config.set_main_option('script_location', str(Path(__file__).resolve().parents[1] / 'alembic'))
    command.upgrade(config, '003')
    engine = create_engine(url)
    with engine.begin() as connection:
        connection.execute(text("""INSERT INTO agent_users
          (id,name,email,password_hash,role,dentist_id,active,created_at)
          VALUES ('test-user','Prueba','test@example.test','hash','RECEPTION',NULL,true,now())"""))
        connection.execute(text("""INSERT INTO agent_sessions
          (token_hash,user_id,expires_at) VALUES ('token','test-user',now()+interval '1 hour')"""))
    engine.dispose()
    command.upgrade(config, 'head')
    command.check(config)
    engine = create_engine(url)
    with engine.begin() as connection:
        assert connection.scalar(text("SELECT id FROM users WHERE email='test@example.test'")) == 'test-user'
        assert connection.scalar(text("SELECT user_id FROM agent_sessions WHERE token_hash='token'")) == 'test-user'
        connection.execute(text("UPDATE users SET active=false WHERE id='test-user'"))
        assert connection.scalar(text("SELECT count(*) FROM agent_sessions WHERE token_hash='token'")) == 0
        # The clinic role has no DELETE privilege on agent_sessions.
        connection.execute(text('GRANT USAGE ON SCHEMA public TO dentalrisk'))
        connection.execute(text('GRANT SELECT, UPDATE ON users TO dentalrisk'))
        connection.execute(text("INSERT INTO agent_sessions (token_hash,user_id,expires_at) "
                                "VALUES ('token2','test-user',now()+interval '1 hour')"))
        connection.execute(text('SET ROLE dentalrisk'))
        try:
            connection.execute(text("UPDATE users SET password_hash='new-hash' "
                                    "WHERE id='test-user'"))
        finally:
            connection.execute(text('RESET ROLE'))
        assert connection.scalar(text("SELECT count(*) FROM agent_sessions WHERE token_hash='token2'")) == 0
    engine.dispose()
    print('Migración compartida, identidad, referencias y revocación verificadas.')
finally:
    if previous is None:
        os.environ.pop('DATABASE_URL', None)
    else:
        os.environ['DATABASE_URL'] = previous
    admin.execute(sql.SQL('DROP DATABASE IF EXISTS {} WITH (FORCE)').format(sql.Identifier(name)))
    admin.close()
