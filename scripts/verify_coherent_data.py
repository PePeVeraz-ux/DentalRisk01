"""Restore the pre-change backup into a disposable database and verify the new QA fixture."""
import json
import os
import subprocess
import sys
from pathlib import Path
from uuid import uuid4

import psycopg
from psycopg import sql

ROOT = Path(__file__).resolve().parents[1]
config = json.loads((ROOT / '.local/postgres-local.json').read_text(encoding='utf-8'))
backups = sorted((ROOT / '.local/backups').glob('before-coherent-reseed-*.dump'))
if not backups:
    raise RuntimeError('No hay respaldo previo a la sustitución de datos QA')
name = 'qa_coherent_' + uuid4().hex[:10]
environment = os.environ.copy()
environment.update(PGHOST='127.0.0.1',PGPORT=str(config['port']),
                   PGUSER='dentalrisk_local_admin',PGPASSWORD=config['password'],PGDATABASE=name)
admin = psycopg.connect(host='127.0.0.1',port=config['port'],user='dentalrisk_local_admin',
                        password=config['password'],dbname='postgres',autocommit=True)
try:
    admin.execute(sql.SQL('CREATE DATABASE {}').format(sql.Identifier(name)))
    subprocess.run([str(ROOT/'.local/pg-client/pg_restore.exe'),'--no-owner','--no-acl',
                    '--dbname',name,str(backups[-1])],env=environment,cwd=ROOT,
                   check=True,capture_output=True,timeout=120)
    subprocess.run([sys.executable,str(ROOT/'scripts/rebuild_coherent_data.py'),
                    '--database',name,'--stations','4'],cwd=ROOT,env=environment,
                   check=True,timeout=120)
    with psycopg.connect(host='127.0.0.1',port=config['port'],user='dentalrisk_local_admin',
                         password=config['password'],dbname=name) as db:
        scalar=lambda query: db.execute(query).fetchone()[0]
        assert scalar("SELECT count(*) FROM stations WHERE name LIKE 'QA Consultorio %'")==4
        assert scalar("SELECT count(*) FROM patients WHERE reference LIKE 'QA-20261112-P%'")==500
        assert scalar("SELECT count(*) FROM cards WHERE uid LIKE 'QA-20261112-CARD-%'")==50
        assert scalar('SELECT count(*) FROM attentions')==500
        assert scalar('SELECT count(*) FROM appointments')==500
        assert scalar("SELECT count(*) FROM attentions WHERE status='COMPLETED'")==475
        assert scalar("SELECT count(*) FROM attentions WHERE status='INCIDENT'")==5
        assert scalar("SELECT count(*) FROM attentions WHERE status='PENDING'")==19
        assert scalar("SELECT count(*) FROM attentions WHERE status='IN_PROGRESS'")==1
        assert scalar("SELECT count(*) FROM rfid_events WHERE response->>'code'='CHECK_OUT'")==475
        assert scalar("SELECT count(*) FROM rfid_events WHERE response->>'code'='CHECK_IN'")==481
        assert scalar('SELECT count(*) FROM incidents')==5
        assert scalar("SELECT count(*) FROM agent_operations WHERE kind='QA_SEED'")==0
        assert scalar("SELECT count(*) FROM login_attempts WHERE key LIKE 'QA-20261111-%'")==0
        assert scalar("SELECT count(*) FROM agent_login_attempts WHERE key LIKE 'QA-20261111-%'")==0
        assert scalar("SELECT count(*) FROM weekly_reports WHERE payload->>'synthetic'='true'")<30
        assert scalar("SELECT count(*) FROM users WHERE email='admin@dentalrisk.local'")==1
        mismatch=scalar("""SELECT count(*) FROM attentions a WHERE status='COMPLETED' AND
            (SELECT count(*) FROM rfid_events e WHERE e.response->>'attention_id'=a.id AND
                e.response->>'code'='CHECK_IN')<>1 OR status='COMPLETED' AND
            (SELECT count(*) FROM rfid_events e WHERE e.response->>'attention_id'=a.id AND
                e.response->>'code'='CHECK_OUT')<>1""")
        assert mismatch==0, mismatch
        assert scalar("""SELECT count(*) FROM calendar_days c JOIN shifts s ON s.id=c.shift_id
            WHERE s.weekday<>extract(dow from c.day)""")==0
        assert scalar("""SELECT count(*) FROM (
            SELECT card_id FROM assignments WHERE released_at IS NULL GROUP BY card_id HAVING count(*)>1
            ) duplicates""")==0
    print('Base aislada verificada: 4 consultorios, 50 tarjetas, 500 pacientes/citas/atenciones, '
          'entradas y salidas RFID conciliadas; sin cuotas falsas en bitácoras.')
finally:
    admin.execute(sql.SQL('DROP DATABASE IF EXISTS {} WITH (FORCE)').format(sql.Identifier(name)))
    admin.close()
