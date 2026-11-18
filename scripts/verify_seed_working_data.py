"""Restore a fresh backup into a disposable database and exercise the seed."""
import json
import os
import subprocess
import sys
from pathlib import Path
from uuid import uuid4

import psycopg
from psycopg import sql

ROOT = Path(__file__).resolve().parents[1]
config = json.loads((ROOT/'.local/postgres-local.json').read_text())
backups = sorted((ROOT/'.local/backups').glob('before-synthetic-seed-*.dump'))
if not backups:
    raise RuntimeError('Falta el respaldo previo a la carga')
name = 'qa_seed_verify_' + uuid4().hex[:10]
env = os.environ.copy()
env.update(PGHOST='127.0.0.1', PGPORT=str(config['port']),
           PGUSER='dentalrisk_local_admin', PGPASSWORD=config['password'],
           PGDATABASE=name, SEED_DATABASE_NAME=name, ALLOW_LEGACY_QA_SEED='true')
admin = psycopg.connect(host='127.0.0.1',port=config['port'],user='dentalrisk_local_admin',
                        password=config['password'],dbname='postgres',autocommit=True)
try:
    admin.execute(sql.SQL('CREATE DATABASE {}').format(sql.Identifier(name)))
    subprocess.run([str(ROOT/'.local/pg-client/pg_restore.exe'),'--no-owner','--no-acl',
                    '--dbname',name,str(backups[-1])],env=env,check=True,capture_output=True)
    subprocess.run([sys.executable,str(ROOT/'scripts/seed_working_data.py')],
                   cwd=ROOT,env=env,check=True,capture_output=True)
    with psycopg.connect(host='127.0.0.1',port=config['port'],user='dentalrisk_local_admin',
                         password=config['password'],dbname=name) as db:
        assert db.execute("SELECT count(*) FROM attentions WHERE status='IN_PROGRESS'").fetchone()[0] == 1
        assert db.execute("SELECT count(*) FROM attentions WHERE status='COMPLETED'").fetchone()[0] == 499
        assert db.execute("SELECT count(*) FROM assignments WHERE released_at IS NULL").fetchone()[0] == 1
    print('Carga aislada, restauración, conteos y estados verificados.')
finally:
    admin.execute(sql.SQL('DROP DATABASE IF EXISTS {} WITH (FORCE)').format(sql.Identifier(name)))
    admin.close()
