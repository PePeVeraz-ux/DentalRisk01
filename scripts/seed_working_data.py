"""Populate the local shared PostgreSQL database with linked, marked test data."""
import json
import os
import secrets
from collections import Counter
from datetime import datetime, timedelta, timezone
from pathlib import Path
from uuid import uuid4
from zoneinfo import ZoneInfo

import psycopg
from argon2 import PasswordHasher

if (os.environ.get('ALLOW_LEGACY_QA_SEED') != 'true' or
        not os.environ.get('SEED_DATABASE_NAME','').startswith('qa_seed_verify_')):
    raise RuntimeError('Esta carga uniforme QA fue sustituida por rebuild_coherent_data.py. '
                       'Solo se permite reproducirla intencionalmente en una base aislada '
                       'con ALLOW_LEGACY_QA_SEED=true.')

ROOT = Path(__file__).resolve().parents[1]
CONFIG = json.loads((ROOT / '.local/postgres-local.json').read_text(encoding='utf-8'))
TARGET = 500
MARK = 'QA-20261111'
NOW = datetime.now(timezone.utc)
new_id = lambda: str(uuid4())
database_name = os.environ.get('SEED_DATABASE_NAME','dentalrisk')
if database_name != 'dentalrisk' and not database_name.startswith('qa_seed_verify_'):
    raise ValueError('Solo se permiten dentalrisk o una base de verificación qa_seed_verify_')
conn = psycopg.connect(host='127.0.0.1', port=CONFIG['port'],
    user='dentalrisk_local_admin', password=CONFIG['password'], dbname=database_name)
creds = []
counts = {}

def count(cur, table):
    return cur.execute('SELECT count(*) FROM public.' + table).fetchone()[0]

def add(cur, table, columns, rows):
    if not rows:
        return
    cols = ','.join(columns)
    params = ','.join(['%s'] * len(columns))
    cur.executemany(f'INSERT INTO public.{table} ({cols}) VALUES ({params})', rows)

try:
    with conn.transaction():
        with conn.cursor() as cur:
            cur.execute('SELECT id FROM operation_mutex WHERE id=1 FOR UPDATE')
            if cur.execute('SELECT 1 FROM users WHERE email=%s',
                    (f'qa.seed.0001@dentalrisk.local',)).fetchone():
                raise RuntimeError('La carga QA ya existe. No se duplica.')
            admin = cur.execute("SELECT id FROM users WHERE role='ADMIN' AND active=true ORDER BY id LIMIT 1").fetchone()[0]
            ph = PasswordHasher()
            disabled_hash = ph.hash(secrets.token_urlsafe(32))
            for table in ['dentists','users','services','stations','patients','cards','shifts',
                          'calendar_days','appointments','attentions','assignments','rfid_events',
                          'incidents','audit','weekly_reports','agent_operations','agent_audit',
                          'login_attempts','agent_login_attempts']:
                counts[table] = count(cur, table)
            needed = lambda t: max(0, TARGET-counts[t])
            dentists = [(new_id(), f'QA Dentista {i:04}', 'Odontología general', True)
                        for i in range(1, needed('dentists')+1)]
            add(cur,'dentists',['id','name','specialty','active'],dentists)
            all_dentists = [r[0] for r in cur.execute('SELECT id FROM dentists ORDER BY id').fetchall()]
            roles = ['DENTIST','RECEPTION','SUPPORT']
            users = []
            for i in range(1, needed('users')+1):
                role = roles[(i-1)%3]
                email = f'qa.seed.{i:04}@dentalrisk.local'
                active = i <= 3
                password = secrets.token_urlsafe(24) if active else None
                users.append((new_id(),f'QA {role} {i:04}',email,
                              ph.hash(password) if active else disabled_hash,role,
                              all_dentists[(i-1)%len(all_dentists)] if role=='DENTIST' else None,
                              active))
                if active:
                    creds.append({'role':role,'email':email,'password':password})
            add(cur,'users',['id','name','email','password_hash','role','dentist_id','active'],users)
            services = [(new_id(),f'QA Servicio {i:04}',10000+(i%20)*2500,True)
                        for i in range(1,needed('services')+1)]
            add(cur,'services',['id','name','price_cents','active'],services)
            stations = [(new_id(),f'QA Consultorio {i:04}',True)
                        for i in range(1,needed('stations')+1)]
            add(cur,'stations',['id','name','active'],stations)
            patients = [(new_id(),f'QA Paciente {i:04}',f'{MARK}-P{i:04}',True)
                        for i in range(1,needed('patients')+1)]
            add(cur,'patients',['id','name','reference','active'],patients)
            cards = [(new_id(),f'{MARK}-CARD-{i:04}','ASSIGNED' if i==needed('cards') else 'AVAILABLE')
                     for i in range(1,needed('cards')+1)]
            add(cur,'cards',['id','uid','status'],cards)
            shifts = [(new_id(),f'QA Turno {i:04}',i%7,'08:00','18:00',True)
                      for i in range(1,needed('shifts')+1)]
            add(cur,'shifts',['id','name','weekday','start_time','end_time','active'],shifts)
            # The 500 worked dates are spread over recent history; each has an operated shift.
            local_today = NOW.astimezone(ZoneInfo('America/Tijuana')).date()
            days = [local_today-timedelta(days=i) for i in range(needed('calendar_days')-1,-1,-1)]
            shifts_by_weekday = {day: [s[0] for s in shifts if s[2]==day] for day in range(7)}
            day_rows = [(new_id(),shifts_by_weekday[day.isoweekday()%7][i%len(shifts_by_weekday[day.isoweekday()%7])],day,True,'[]')
                        for i,day in enumerate(days)]
            add(cur,'calendar_days',['id','shift_id','day','operated','breaks'],day_rows)
            n = max(needed('appointments'),needed('attentions'),needed('assignments'),
                    needed('rfid_events'),needed('incidents'))
            # Fresh entities ensure that FK and partial-uniqueness rules hold.
            if any(needed(t)<n for t in ['appointments','attentions','assignments',
                                         'rfid_events','incidents']):
                raise RuntimeError('Los conteos operativos previos son desiguales; revise la carga manualmente.')
            if min(len(patients),len(services),len(stations),len(cards),len(day_rows)) < n:
                raise RuntimeError('No hay suficientes entidades nuevas para 500 flujos completos.')
            appointments=[]; attentions=[]; assignments=[]; events=[]; incidents=[]
            week_counts = Counter()
            week_revenue = Counter()
            for i in range(n):
                active = i==n-1
                when = (NOW-timedelta(minutes=10) if active else
                        datetime.combine(days[i],datetime.min.time(),tzinfo=ZoneInfo('America/Tijuana'))
                        +timedelta(hours=9))
                when = when.astimezone(timezone.utc)
                appointment_id,attention_id = new_id(),new_id()
                dentist_id = all_dentists[i%len(all_dentists)]
                price = services[i][2]
                appointments.append((appointment_id,patients[i][0],dentist_id,services[i][0],
                                     when,when+timedelta(minutes=45),'SCHEDULED' if active else 'ATTENDED'))
                attentions.append((attention_id,patients[i][0],dentist_id,services[i][0],
                    stations[i][0],day_rows[i][1],appointment_id,cards[i][0],price,
                    'IN_PROGRESS' if active else 'COMPLETED',when,
                    None if active else when+timedelta(minutes=40),
                    None if active else when+timedelta(minutes=50),when-timedelta(minutes=15)))
                assignments.append((new_id(),attention_id,cards[i][0],when-timedelta(minutes=15),
                                    None if active else when+timedelta(minutes=50)))
                events.append((new_id(),stations[i][0],cards[i][1],when,
                    json.dumps({'accepted':True,'code':'CHECK_IN','attention_id':attention_id,
                                'at':when.isoformat(),'message':'Atención iniciada'})))
                incidents.append((new_id(),attention_id,admin,'QA_OBSERVATION',
                    'Observación sintética de entrenamiento',json.dumps({'status':'PENDING'}),
                    json.dumps({'status':'IN_PROGRESS' if active else 'COMPLETED'}),when))
                if not active:
                    week_counts[(when.date()-timedelta(days=when.weekday()))] += 1
                    week_revenue[(when.date()-timedelta(days=when.weekday()))] += price
            add(cur,'appointments',['id','patient_id','dentist_id','service_id','starts_at','ends_at','status'],appointments)
            add(cur,'attentions',['id','patient_id','dentist_id','service_id','station_id','shift_id',
                'appointment_id','card_id','price_cents','status','started_at','ended_at',
                'released_at','created_at'],attentions)
            add(cur,'assignments',['id','attention_id','card_id','assigned_at','released_at'],assignments)
            add(cur,'rfid_events',['id','station_id','uid','occurred_at','response'],events)
            add(cur,'incidents',['id','attention_id','actor_id','kind','reason','before_value',
                'after_value','created_at'],incidents)
            add(cur,'audit',['id','actor_id','action','entity_id','detail','created_at'],
                [(new_id(),admin,'qa.seed.attention',a[0],json.dumps({'synthetic':True}),a[10])
                 for a in attentions[:needed('audit')]])
            add(cur,'agent_operations',['id','owner_id','user_id','kind','request_hash','created_at'],
                [(new_id(),admin,users[i%len(users)][0],'QA_SEED',secrets.token_hex(32),NOW)
                 for i in range(needed('agent_operations'))])
            add(cur,'agent_audit',['id','actor_id','action','entity_id','created_at'],
                [(new_id(),admin,'qa.seed',attentions[i%len(attentions)][0],NOW)
                 for i in range(needed('agent_audit'))])
            add(cur,'login_attempts',['key','failures','blocked_until','updated_at'],
                [(f'{MARK}-CLINIC-{i:04}',0,None,NOW)
                 for i in range(needed('login_attempts'))])
            add(cur,'agent_login_attempts',['key','failures','blocked_until'],
                [(f'{MARK}-AGENT-{i:04}',0,None)
                 for i in range(needed('agent_login_attempts'))])
            existing_weeks = {r[0] for r in cur.execute('SELECT week_start FROM weekly_reports')}
            reports=[]
            monday = NOW.date()-timedelta(days=NOW.weekday())
            offset=0
            while len(reports)<needed('weekly_reports'):
                week=monday-timedelta(weeks=offset)
                offset+=1
                if week in existing_weeks: continue
                total=week_counts[week]
                payload={'from':week.isoformat(),'to':(week+timedelta(days=6)).isoformat(),
                  'timezone':'America/Tijuana','generated_at':NOW.isoformat(),'filters':{},
                  'summary':{'attentions':total,'patients':total,'revenue_cents':week_revenue[week],
                    'average_minutes':40 if total else 0,'idle_minutes':0,
                    'operated_shifts':0,'patients_per_shift':None},
                  'ranking':[],'groups':[],'daily':[],'synthetic':True}
                reports.append((week,json.dumps(payload),NOW))
            add(cur,'weekly_reports',['week_start','payload','generated_at'],reports)
            for table in counts:
                actual=count(cur,table)
                if actual<TARGET:
                    raise RuntimeError(f'{table}: solo {actual} registros')
                counts[table]={'before':counts[table],'after':actual}
    # Commit is complete before publishing login credentials and the report.
    private = ROOT/('.local/seed-working-data-credentials.json' if database_name=='dentalrisk'
                    else '.local/seed-working-data-verification-credentials.json')
    private.write_text(json.dumps(creds,indent=2),encoding='utf-8')
    report=ROOT/('output/seed-working-data-report.json' if database_name=='dentalrisk'
                 else '.local/seed-working-data-verification-report.json')
    report.parent.mkdir(exist_ok=True)
    report.write_text(json.dumps({'at':NOW.isoformat(),'marker':MARK,'counts':counts,
        'exceptions':{'operation_mutex':'Singleton id=1','schema_migrations':'Migration history',
          'alembic_version':'Migration history','sessions':'Only real browser sessions',
          'agent_sessions':'Only real agent tokens'}},indent=2),encoding='utf-8')
    print('Datos QA cargados y verificados:',json.dumps(counts))
    print('Credenciales privadas:',private)
finally:
    conn.close()
