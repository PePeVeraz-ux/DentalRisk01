"""Migrate agent tables and grant only its required rights in a shared DB."""
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import psycopg
from psycopg import sql
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url


def provision():
    owner_url = os.environ['DATABASE_URL']
    password = os.environ['AGENT_DB_PASSWORD']
    if len(password) < 24:
        raise ValueError('AGENT_DB_PASSWORD requiere al menos 24 caracteres')
    parsed = make_url(owner_url)
    if not parsed.drivername.startswith('postgresql'):
        raise ValueError('Se requiere PostgreSQL')
    engine = create_engine(parsed.set(drivername='postgresql+psycopg'))
    try:
        with engine.connect() as connection:
            for table in ('users', 'dentists', 'attentions', 'appointments'):
                if connection.scalar(text('SELECT to_regclass(:name)'),
                                     {'name': 'public.' + table}) is None:
                    raise RuntimeError('Aplique primero las migraciones clínicas: falta ' + table)
        config = Config(str(Path(__file__).resolve().parents[1] / 'alembic.ini'))
        config.set_main_option('script_location', str(Path(__file__).resolve().parents[1] / 'alembic'))
        command.upgrade(config, 'head')
        with psycopg.connect(parsed.set(drivername='postgresql').render_as_string(
                hide_password=False)) as connection:
            exists = connection.execute('SELECT 1 FROM pg_roles WHERE rolname=%s',
                                        ('dentalrisk_agent',)).fetchone()
            if exists:
                connection.execute(sql.SQL('ALTER ROLE dentalrisk_agent LOGIN PASSWORD {}').format(
                    sql.Literal(password)))
            else:
                connection.execute(sql.SQL('CREATE ROLE dentalrisk_agent LOGIN PASSWORD {}').format(
                    sql.Literal(password)))
            database_name = sql.Identifier(parsed.database)
            connection.execute(sql.SQL('GRANT CONNECT ON DATABASE {} TO dentalrisk_agent').format(
                database_name))
            connection.execute('GRANT USAGE ON SCHEMA public TO dentalrisk_agent')
            connection.execute('REVOKE CREATE ON SCHEMA public FROM dentalrisk_agent')
            connection.execute('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM dentalrisk_agent')
            connection.execute('GRANT SELECT, INSERT ON users TO dentalrisk_agent')
            connection.execute('GRANT UPDATE (password_hash, active, profile_object_key) '
                               'ON users TO dentalrisk_agent')
            connection.execute('GRANT SELECT ON dentists, services, attentions, appointments '
                               'TO dentalrisk_agent')
            connection.execute('GRANT SELECT (id, name, reference, active), INSERT '
                               'ON patients TO dentalrisk_agent')
            connection.execute('GRANT SELECT, INSERT, UPDATE, DELETE ON '
                               'agent_sessions, agent_login_attempts, agent_audit, '
                               'agent_operations TO dentalrisk_agent')
            connection.execute('GRANT SELECT, INSERT, UPDATE ON agent_patients '
                               'TO dentalrisk_agent')
            connection.execute('GRANT SELECT, INSERT ON agent_patient_operations '
                               'TO dentalrisk_agent')
            if connection.execute('SELECT 1 FROM pg_roles WHERE rolname=%s',
                                  ('dentalrisk_app',)).fetchone():
                connection.execute('REVOKE ALL ON agent_sessions, agent_login_attempts, '
                                   'agent_audit, agent_operations, agent_patients, '
                                   'agent_patient_operations FROM dentalrisk_app')
        print('Migración y permisos del agente aplicados en la base compartida.')
    finally:
        engine.dispose()


if __name__ == '__main__':
    provision()
