"""Replace only the 2026-11-11 QA fixture with a clinic-sized, linked fixture.

Run against a restored qa_coherent_* database first. Live use requires
--apply-live and a new backup made before this script is invoked.
"""
import argparse
import json
import secrets
from collections import Counter
from datetime import datetime, time, timedelta, timezone
from pathlib import Path
from uuid import uuid4
from zoneinfo import ZoneInfo

import psycopg
from argon2 import PasswordHasher

ROOT = Path(__file__).resolve().parents[1]
CONFIG = json.loads((ROOT / '.local/postgres-local.json').read_text(encoding='utf-8'))
MARK = 'QA-20261112'
OLD = 'QA-20261111'
new_id = lambda: str(uuid4())


def insert(cur, table, columns, rows):
    if rows:
        cur.executemany(
            f"INSERT INTO {table} ({','.join(columns)}) VALUES ({','.join(['%s'] * len(columns))})",
            rows,
        )


def weekdays_before(day, count):
    result = []
    candidate = day - timedelta(days=1)
    while len(result) < count:
        if candidate.weekday() < 5:
            result.append(candidate)
        candidate -= timedelta(days=1)
    return list(reversed(result))


def weekdays_after(day, count):
    result = []
    candidate = day + timedelta(days=1)
    while len(result) < count:
        if candidate.weekday() < 5:
            result.append(candidate)
        candidate += timedelta(days=1)
    return result


def rebuild(database_name, station_count):
    local_now = datetime.now(ZoneInfo('America/Tijuana'))
    today = local_now.date()
    if today.weekday() >= 5 or not time(8) <= local_now.time() < time(18):
        raise RuntimeError('Ejecutar en un día operado entre 08:00 y 18:00 para la atención en curso')
    credentials = []
    with psycopg.connect(host='127.0.0.1', port=CONFIG['port'],
            user='dentalrisk_local_admin', password=CONFIG['password'], dbname=database_name) as db:
        with db.transaction():
            cur = db.cursor()
            cur.execute('SELECT id FROM operation_mutex WHERE id=1 FOR UPDATE')
            if cur.execute('SELECT 1 FROM patients WHERE reference LIKE %s LIMIT 1', (MARK + '%',)).fetchone():
                raise RuntimeError('La carga coherente ya existe; no se duplica')
            # Snapshot IDs before deletion, so the operation is independent of row order.
            for table, query, value in [
                ('qa_users', 'SELECT id FROM users WHERE email LIKE %s', 'qa.seed.%@dentalrisk.local'),
                ('qa_dentists', 'SELECT id FROM dentists WHERE name LIKE %s', 'QA Dentista %'),
                ('qa_services', 'SELECT id FROM services WHERE name LIKE %s', 'QA Servicio %'),
                ('qa_stations', 'SELECT id FROM stations WHERE name LIKE %s', 'QA Consultorio %'),
                ('qa_patients', 'SELECT id FROM patients WHERE reference LIKE %s', OLD + '-P%'),
                ('qa_cards', 'SELECT id FROM cards WHERE uid LIKE %s', OLD + '-CARD-%'),
                ('qa_shifts', 'SELECT id FROM shifts WHERE name LIKE %s', 'QA Turno %'),
            ]:
                cur.execute(f'CREATE TEMP TABLE {table} AS {query}', (value,))
            cur.execute('CREATE TEMP TABLE qa_attentions AS SELECT id FROM attentions WHERE patient_id IN (SELECT id FROM qa_patients)')
            cur.execute('CREATE TEMP TABLE qa_appointments AS SELECT id FROM appointments WHERE patient_id IN (SELECT id FROM qa_patients)')
            old_count = cur.execute('SELECT count(*) FROM qa_attentions').fetchone()[0]
            if old_count != 500:
                raise RuntimeError(f'Se esperaban 500 atenciones QA antiguas; hay {old_count}')
            for statement in [
                'DELETE FROM agent_sessions WHERE user_id IN (SELECT id FROM qa_users)',
                'DELETE FROM sessions WHERE user_id IN (SELECT id FROM qa_users)',
                "DELETE FROM agent_operations WHERE kind='QA_SEED' OR user_id IN (SELECT id FROM qa_users)",
                "DELETE FROM agent_audit WHERE action='qa.seed' OR actor_id IN (SELECT id FROM qa_users)",
                "DELETE FROM audit WHERE action LIKE 'qa.seed.%' OR actor_id IN (SELECT id FROM qa_users) OR entity_id IN (SELECT id FROM qa_attentions)",
                "DELETE FROM login_attempts WHERE key LIKE 'QA-20261111-%'",
                "DELETE FROM agent_login_attempts WHERE key LIKE 'QA-20261111-%'",
                "DELETE FROM weekly_reports WHERE payload->>'synthetic'='true'",
                'DELETE FROM incidents WHERE attention_id IN (SELECT id FROM qa_attentions)',
                "DELETE FROM rfid_events WHERE station_id IN (SELECT id FROM qa_stations) OR uid LIKE 'QA-20261111-CARD-%'",
                'DELETE FROM assignments WHERE attention_id IN (SELECT id FROM qa_attentions)',
                'DELETE FROM attentions WHERE id IN (SELECT id FROM qa_attentions)',
                'DELETE FROM appointments WHERE id IN (SELECT id FROM qa_appointments)',
                'DELETE FROM calendar_days WHERE shift_id IN (SELECT id FROM qa_shifts)',
                'DELETE FROM users WHERE id IN (SELECT id FROM qa_users)',
                'DELETE FROM cards WHERE id IN (SELECT id FROM qa_cards)',
                'DELETE FROM patients WHERE id IN (SELECT id FROM qa_patients)',
                'DELETE FROM services WHERE id IN (SELECT id FROM qa_services)',
                'DELETE FROM stations WHERE id IN (SELECT id FROM qa_stations)',
                'DELETE FROM shifts WHERE id IN (SELECT id FROM qa_shifts)',
                'DELETE FROM dentists WHERE id IN (SELECT id FROM qa_dentists)',
            ]:
                cur.execute(statement)

            owner = cur.execute("SELECT id FROM users WHERE role='ADMIN' AND active=true ORDER BY id LIMIT 1").fetchone()[0]
            ph = PasswordHasher()
            dentists = [(new_id(), f'QA Dentista {i:02}', 'Odontología general', True)
                        for i in range(1, 8)]
            insert(cur, 'dentists', ['id','name','specialty','active'], dentists)
            users = []
            for index, dentist in enumerate(dentists, 1):
                password = secrets.token_urlsafe(24)
                email = f'qa.coherente.dentista{index}@dentalrisk.local'
                users.append((new_id(), f'QA Dentista {index:02}', email, ph.hash(password),
                              'DENTIST', dentist[0], True))
                credentials.append({'role':'DENTIST','email':email,'password':password})
            for role, name in [('RECEPTION','Recepción'),('SUPPORT','Soporte')]:
                password = secrets.token_urlsafe(24)
                email = f'qa.coherente.{role.lower()}@dentalrisk.local'
                users.append((new_id(), f'QA {name}', email, ph.hash(password),role,None,True))
                credentials.append({'role':role,'email':email,'password':password})
            insert(cur, 'users', ['id','name','email','password_hash','role','dentist_id','active'],users)
            services = [(new_id(),f'QA Servicio {i:02}',10000+(i-1)*2500,True)
                        for i in range(1,16)]
            insert(cur,'services',['id','name','price_cents','active'],services)
            stations = [(new_id(),f'QA Consultorio {i}',True) for i in range(1,station_count+1)]
            insert(cur,'stations',['id','name','active'],stations)
            patients = [(new_id(),f'QA Paciente {i:04}',f'{MARK}-P{i:04}',True)
                        for i in range(1,501)]
            insert(cur,'patients',['id','name','reference','active'],patients)
            cards = [(new_id(),f'{MARK}-CARD-{i:02}',
                      'BLOCKED' if i>=46 else 'ASSIGNED' if i<=20 else 'AVAILABLE')
                     for i in range(1,51)]
            insert(cur,'cards',['id','uid','status'],cards)
            shifts = [(new_id(),f'QA Turno {weekday}',weekday,'08:00','18:00',True)
                      for weekday in range(1,6)]
            insert(cur,'shifts',['id','name','weekday','start_time','end_time','active'],shifts)
            by_weekday = {row[2]:row[0] for row in shifts}
            historical = weekdays_before(today,96)
            future = weekdays_after(today,4)
            operated = historical + [today] + future
            insert(cur,'calendar_days',['id','shift_id','day','operated','breaks'],
                   [(new_id(),by_weekday[day.weekday()+1],day,True,'[]') for day in operated])

            appointments=[]; attentions=[]; assignments=[]; events=[]; incidents=[]
            week_counts=Counter(); week_revenue=Counter()
            incident_indices={49,149,249,349,449}
            incident_number=0
            for index, patient in enumerate(patients):
                is_past = index < 480
                is_active = index == 480
                if is_past:
                    day = historical[index//5]
                    slot = index%5
                    when = datetime.combine(day,time(9+slot),ZoneInfo('America/Tijuana')).astimezone(timezone.utc)
                elif is_active:
                    when = (local_now-timedelta(minutes=10)).astimezone(timezone.utc)
                    slot = 0
                else:
                    relative = index-481
                    day = future[relative//5]
                    slot = relative%5
                    when = datetime.combine(day,time(9+slot),ZoneInfo('America/Tijuana')).astimezone(timezone.utc)
                dentist= dentists[index%len(dentists)][0]
                station=stations[slot%station_count][0]
                service=services[index%len(services)]
                incident = index in incident_indices
                if incident:
                    card=cards[45+incident_number]
                    incident_number+=1
                elif is_past:
                    card=cards[index%45]
                elif is_active:
                    card=cards[19]
                else:
                    card=cards[index-481]
                appointment_id = None if incident else new_id()
                if appointment_id:
                    appointments.append((appointment_id,patient[0],dentist,service[0],when,
                        when+timedelta(minutes=45),'ATTENDED' if is_past else 'SCHEDULED'))
                attention_id=new_id()
                status='INCIDENT' if incident else 'COMPLETED' if is_past else 'IN_PROGRESS' if is_active else 'PENDING'
                started=when if is_past or is_active else None
                ended=when+timedelta(minutes=40) if status=='COMPLETED' else None
                released=(when+timedelta(minutes=20) if incident else
                          when+timedelta(minutes=50) if status=='COMPLETED' else None)
                created=when-timedelta(days=1) if is_past else local_now.astimezone(timezone.utc)
                attentions.append((attention_id,patient[0],dentist,service[0],station,
                    by_weekday[(historical[index//5] if is_past else today if is_active else future[(index-481)//5]).weekday()+1],
                    appointment_id,card[0],service[2],status,started,ended,released,created))
                assignments.append((new_id(),attention_id,card[0],created,released))
                if started:
                    events.append((new_id(),station,card[1],when,json.dumps({
                        'accepted':True,'code':'CHECK_IN','attention_id':attention_id,
                        'at':when.isoformat(),'message':'Atención iniciada'})))
                if status=='COMPLETED':
                    events.append((new_id(),station,card[1],ended,json.dumps({
                        'accepted':True,'code':'CHECK_OUT','attention_id':attention_id,
                        'at':ended.isoformat(),'duration_seconds':2400,'message':'Atención completada'})))
                    monday=when.astimezone(ZoneInfo('America/Tijuana')).date()
                    monday-=timedelta(days=monday.weekday())
                    week_counts[monday]+=1
                    week_revenue[monday]+=service[2]
                if incident:
                    incidents.append((new_id(),attention_id,owner,'CARD',
                        'Tarjeta extraviada durante atención de prueba',
                        json.dumps({'status':'IN_PROGRESS','card_id':card[0]}),
                        json.dumps({'status':'INCIDENT','card_id':card[0]}),released))
            for index in range(5):
                day=future[index%len(future)]
                when=datetime.combine(day,time(15),ZoneInfo('America/Tijuana')).astimezone(timezone.utc)
                appointments.append((new_id(),patients[index][0],dentists[index][0],
                    services[index][0],when,when+timedelta(minutes=45),'CANCELLED'))
            insert(cur,'appointments',['id','patient_id','dentist_id','service_id','starts_at','ends_at','status'],appointments)
            insert(cur,'attentions',['id','patient_id','dentist_id','service_id','station_id','shift_id',
                'appointment_id','card_id','price_cents','status','started_at','ended_at','released_at','created_at'],attentions)
            insert(cur,'assignments',['id','attention_id','card_id','assigned_at','released_at'],assignments)
            insert(cur,'rfid_events',['id','station_id','uid','occurred_at','response'],events)
            insert(cur,'incidents',['id','attention_id','actor_id','kind','reason','before_value','after_value','created_at'],incidents)
            for monday,count in week_counts.items():
                payload={'from':monday.isoformat(),'to':(monday+timedelta(days=6)).isoformat(),
                    'timezone':'America/Tijuana','generated_at':local_now.astimezone(timezone.utc).isoformat(),
                    'filters':{},'summary':{'attentions':count,'patients':count,
                    'revenue_cents':week_revenue[monday],'average_minutes':40},
                    'ranking':[],'groups':[],'daily':[],'synthetic':True}
                cur.execute('INSERT INTO weekly_reports(week_start,payload,generated_at) VALUES(%s,%s,%s) '
                    'ON CONFLICT(week_start) DO UPDATE SET payload=excluded.payload,generated_at=excluded.generated_at',
                    (monday,json.dumps(payload),local_now.astimezone(timezone.utc)))

            checks={
                'patients':cur.execute("SELECT count(*) FROM patients WHERE reference LIKE %s",(MARK+'-P%',)).fetchone()[0],
                'stations':cur.execute("SELECT count(*) FROM stations WHERE name LIKE 'QA Consultorio %'").fetchone()[0],
                'cards':cur.execute('SELECT count(*) FROM cards WHERE uid LIKE %s',(MARK+'-CARD-%',)).fetchone()[0],
                'appointments':len(appointments),'attentions':len(attentions),
                'completed':sum(row[9]=='COMPLETED' for row in attentions),
                'incidents':len(incidents),'rfid_events':len(events),
                'check_out':sum(json.loads(row[4])['code']=='CHECK_OUT' for row in events),
                'weekly_reports_with_data':len(week_counts),
            }
            assert checks['patients']==500 and checks['stations']==station_count
            assert checks['cards']==50 and checks['appointments']==500 and checks['attentions']==500
            assert checks['completed']==checks['check_out']==475 and checks['incidents']==5
        # Only publish credentials after the transaction commits.
        if database_name=='dentalrisk':
            path=ROOT/'.local/seed-coherent-credentials.json'
            path.write_text(json.dumps(credentials,indent=2),encoding='utf-8')
    return checks


if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--database',required=True)
    parser.add_argument('--stations',type=int,default=4)
    parser.add_argument('--apply-live',action='store_true')
    args=parser.parse_args()
    if args.stations<1 or args.stations>20:
        parser.error('--stations debe estar entre 1 y 20')
    if args.database=='dentalrisk':
        if not args.apply_live:
            parser.error('La base real requiere --apply-live y respaldo previo')
    elif not args.database.startswith('qa_coherent_'):
        parser.error('Solo se admiten dentalrisk o bases aisladas qa_coherent_*')
    print(json.dumps({'database':args.database,'counts':rebuild(args.database,args.stations)},indent=2))
