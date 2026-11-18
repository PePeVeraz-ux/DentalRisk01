"""Read-only evidence for the current shared PostgreSQL working dataset."""
import json
from datetime import datetime, timezone
from pathlib import Path

import psycopg

ROOT=Path(__file__).resolve().parents[1]
config=json.loads((ROOT/'.local/postgres-local.json').read_text())
with psycopg.connect(host='127.0.0.1',port=config['port'],user='dentalrisk_local_admin',
                     password=config['password'],dbname='dentalrisk',
                     options='-c default_transaction_read_only=on') as db:
    scalar=lambda sql: db.execute(sql).fetchone()[0]
    counts={table:scalar('SELECT count(*) FROM '+table) for table in
        ('users','dentists','services','stations','patients','cards','shifts',
         'calendar_days','appointments','attentions','assignments','rfid_events',
         'incidents','weekly_reports','agent_operations','agent_audit',
         'login_attempts','agent_login_attempts')}
    statuses={table:dict(db.execute('SELECT status,count(*) FROM '+table+' GROUP BY status'))
              for table in ('cards','appointments','attentions')}
    events=dict(db.execute("SELECT response->>'code',count(*) FROM rfid_events GROUP BY response->>'code'"))
    station_credentials=scalar('SELECT count(*) FROM stations WHERE token_hash IS NOT NULL')
    mismatched_completed=scalar("""SELECT count(*) FROM attentions a WHERE status='COMPLETED' AND
        ((SELECT count(*) FROM rfid_events e WHERE e.response->>'attention_id'=a.id AND
            e.response->>'code'='CHECK_IN')<>1 OR
         (SELECT count(*) FROM rfid_events e WHERE e.response->>'attention_id'=a.id AND
            e.response->>'code'='CHECK_OUT')<>1)""")
    calendar_mismatches=scalar("""SELECT count(*) FROM calendar_days c JOIN shifts s ON s.id=c.shift_id
        WHERE s.weekday<>extract(dow from c.day)""")
    empty_weeks=scalar("""SELECT count(*) FROM weekly_reports WHERE
        (payload->'summary'->>'attentions')::int=0""")
    old_qa=scalar("SELECT count(*) FROM patients WHERE reference LIKE 'QA-20261111-%'")
    result={'at':datetime.now(timezone.utc).isoformat(),'database':'dentalrisk',
        'marker':'QA-20261112','counts':counts,'statuses':statuses,'rfid_events_by_code':events,
        'stations_with_physical_credentials':station_credentials,
        'completed_without_matching_check_in_out':mismatched_completed,
        'calendar_weekday_mismatches':calendar_mismatches,'empty_weekly_reports':empty_weeks,
        'old_qa_patients_remaining':old_qa}
    assert counts['stations']==4 and counts['cards']==50 and counts['patients']==500
    assert counts['appointments']==500 and counts['attentions']==500
    assert counts['rfid_events']==956 and counts['incidents']==5
    assert statuses['attentions']=={'COMPLETED':475,'INCIDENT':5,'IN_PROGRESS':1,'PENDING':19}
    assert events=={'CHECK_IN':481,'CHECK_OUT':475}
    assert mismatched_completed==0 and calendar_mismatches==0 and old_qa==0
    assert empty_weeks==0
    result['status']='passed'
    output=ROOT/'docs/evidencias/datos-coherentes-2026-11-12.json'
    output.write_text(json.dumps(result,indent=2),encoding='utf-8')
    print(json.dumps(result,indent=2))
