"""One-time, backed-up merge of the agent database into DentalRisk PostgreSQL."""
import json
import os
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from alembic import command
from alembic.config import Config
from dotenv import dotenv_values
from sqlalchemy import MetaData, Table, create_engine, func, select
from sqlalchemy.engine import URL, make_url

AGENT_ROOT = Path(__file__).resolve().parents[1]
PROJECT_ROOT = AGENT_ROOT.parent
AGENT_ENV = AGENT_ROOT / '.env'
CLINIC_ENV = PROJECT_ROOT / '.env'
LOCAL_CONFIG = PROJECT_ROOT / '.local' / 'postgres-local.json'
PG_DUMP = PROJECT_ROOT / '.local' / 'pg-client' / 'pg_dump.exe'
TABLES = ['agent_users', 'agent_login_attempts', 'agent_sessions',
          'agent_audit', 'agent_operations']


def backup(url, path):
    parsed = make_url(url)
    env = os.environ.copy()
    env['PGPASSWORD'] = parsed.password
    subprocess.run([str(PG_DUMP), '-h', parsed.host, '-p', str(parsed.port),
                    '-U', parsed.username, '-d', parsed.database,
                    '-Fc', '-f', str(path)], env=env, check=True,
                   capture_output=True, timeout=180)
    if not path.is_file() or not path.stat().st_size:
        raise RuntimeError('No se pudo comprobar el respaldo: ' + path.name)


def main():
    agent_values = dotenv_values(AGENT_ENV)
    clinic_values = dotenv_values(CLINIC_ENV)
    source_url = make_url(agent_values['DATABASE_URL']).set(drivername='postgresql+psycopg')
    clinic_url = make_url(clinic_values['DATABASE_URL']).set(drivername='postgresql+psycopg')
    if source_url.database == clinic_url.database:
        raise SystemExit('El agente ya apunta a la base clínica; no se repite la transferencia')
    if clinic_url.database != 'dentalrisk':
        raise SystemExit('Este procedimiento local solo admite la base destino dentalrisk')
    if source_url.host != clinic_url.host or source_url.port != clinic_url.port:
        raise SystemExit('El origen y el destino deben pertenecer al mismo servidor PostgreSQL local')
    if not LOCAL_CONFIG.is_file() or not PG_DUMP.is_file():
        raise SystemExit('Falta PostgreSQL local o pg_dump para respaldar ambas bases')
    local = json.loads(LOCAL_CONFIG.read_text(encoding='utf-8'))
    admin_url = URL.create('postgresql+psycopg', username='dentalrisk_local_admin',
        password=local['password'], host='127.0.0.1', port=local['port'],
        database=clinic_url.database)
    stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    backup_dir = PROJECT_ROOT / '.local' / 'backups'
    backup_dir.mkdir(parents=True, exist_ok=True)
    backup(source_url, backup_dir / f'agent-before-merge-{stamp}.dump')
    backup(admin_url, backup_dir / f'clinic-before-merge-{stamp}.dump')

    original_env = AGENT_ENV.read_text(encoding='utf-8')
    source = create_engine(source_url)
    target = create_engine(admin_url)
    prior_url = os.environ.get('DATABASE_URL')
    os.environ['DATABASE_URL'] = admin_url.render_as_string(hide_password=False)
    alembic = Config(str(AGENT_ROOT / 'alembic.ini'))
    alembic.set_main_option('script_location', str(AGENT_ROOT / 'alembic'))
    counts = {}
    try:
        command.upgrade(alembic, '003')
        metadata = MetaData()
        with target.begin() as dest, source.connect() as src:
            for name in TABLES:
                table = Table(name, metadata, autoload_with=target)
                if dest.scalar(select(func.count()).select_from(table)):
                    raise RuntimeError('La tabla destino ya tiene registros: ' + name)
                rows = [dict(row) for row in src.execute(select(table)).mappings()]
                if rows:
                    dest.execute(table.insert(), rows)
                actual = [dict(row) for row in dest.execute(select(table)).mappings()]
                canonical = lambda items: sorted(json.dumps(item, sort_keys=True, default=str)
                                                 for item in items)
                if canonical(rows) != canonical(actual):
                    raise RuntimeError('Contenido diferente después de copiar ' + name)
                counts[name] = len(rows)
        command.upgrade(alembic, 'head')
        with target.begin() as dest:
            role = source_url.username
            if not re.fullmatch(r'[a-zA-Z_][a-zA-Z_0-9]*', role):
                raise RuntimeError('Nombre de rol PostgreSQL inválido')
            dest.exec_driver_sql(f'GRANT CONNECT ON DATABASE dentalrisk TO "{role}"')
            dest.exec_driver_sql(f'GRANT USAGE ON SCHEMA public TO "{role}"')
            dest.exec_driver_sql(f'GRANT SELECT, INSERT, UPDATE ON users TO "{role}"')
            dest.exec_driver_sql(f'GRANT SELECT ON dentists, services, attentions, appointments TO "{role}"')
            dest.exec_driver_sql('GRANT SELECT, INSERT, UPDATE, DELETE ON '
                f'agent_sessions, agent_login_attempts, agent_audit, agent_operations TO "{role}"')
        shared_url = source_url.set(database=clinic_url.database)
        saved = AGENT_ROOT / '.local' / f'environment-before-shared-{stamp}.env'
        saved.parent.mkdir(parents=True, exist_ok=True)
        saved.write_text(original_env, encoding='utf-8')
        new_env = re.sub(r'^DATABASE_URL=.*$',
            lambda _: 'DATABASE_URL=' + shared_url.render_as_string(hide_password=False),
            original_env, count=1, flags=re.M)
        new_env += '\nCLINICAL_CONNECTOR_ENABLED=true\n'
        AGENT_ENV.write_text(new_env, encoding='utf-8')
        evidence = {'date': stamp, 'target_database': clinic_url.database,
                    'agent_tables_copied': counts, 'backups_created': True,
                    'shared_users': True, 'clinical_connector_enabled': True}
        (AGENT_ROOT / 'evidence' / 'merge-shared-database.json').write_text(
            json.dumps(evidence, indent=2), encoding='utf-8')
        print('Bases unificadas; respaldos y conteos verificados. Datos de origen conservados.')
    finally:
        if prior_url is None:
            os.environ.pop('DATABASE_URL', None)
        else:
            os.environ['DATABASE_URL'] = prior_url
        source.dispose()
        target.dispose()


if __name__ == '__main__':
    main()
