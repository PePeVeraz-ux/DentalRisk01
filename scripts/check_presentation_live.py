"""Verificación de solo lectura del conjunto coherente de presentación."""

import json
from datetime import datetime, timezone
from pathlib import Path

import psycopg


ROOT = Path(__file__).resolve().parents[1]
config = json.loads((ROOT / '.local/postgres-local.json').read_text(encoding='utf-8'))

with psycopg.connect(
    host='127.0.0.1',
    port=config['port'],
    user='dentalrisk_local_admin',
    password=config['password'],
    dbname='dentalrisk',
    options='-c default_transaction_read_only=on',
) as db:
    scalar = lambda sql: db.execute(sql).fetchone()[0]
    counts = {
        table: scalar('SELECT count(*) FROM ' + table)
        for table in (
            'users', 'dentists', 'services', 'stations', 'patients', 'cards', 'shifts',
            'calendar_days', 'appointments', 'attentions', 'assignments', 'rfid_events',
            'incidents', 'weekly_reports',
        )
    }
    presentation = {
        'patients': scalar("SELECT count(*) FROM patients WHERE reference LIKE 'PAC-2026-%'"),
        'appointments': scalar(
            "SELECT count(*) FROM appointments a JOIN patients p ON p.id=a.patient_id "
            "WHERE p.reference LIKE 'PAC-2026-%'"
        ),
        'attentions': scalar(
            "SELECT count(*) FROM attentions a JOIN patients p ON p.id=a.patient_id "
            "WHERE p.reference LIKE 'PAC-2026-%'"
        ),
        'assignments': scalar(
            "SELECT count(*) FROM assignments x JOIN attentions a ON a.id=x.attention_id "
            "JOIN patients p ON p.id=a.patient_id WHERE p.reference LIKE 'PAC-2026-%'"
        ),
        'rfid_events': scalar(
            "SELECT count(*) FROM rfid_events e WHERE e.response->>'attention_id' IN "
            "(SELECT a.id::text FROM attentions a JOIN patients p ON p.id=a.patient_id "
            "WHERE p.reference LIKE 'PAC-2026-%')"
        ),
        'cards': scalar("SELECT count(*) FROM cards WHERE uid LIKE '04D3A9%'"),
    }
    attention_statuses = dict(
        db.execute(
            "SELECT a.status,count(*) FROM attentions a JOIN patients p ON p.id=a.patient_id "
            "WHERE p.reference LIKE 'PAC-2026-%' GROUP BY a.status"
        )
    )
    appointment_statuses = dict(
        db.execute(
            "SELECT a.status,count(*) FROM appointments a JOIN patients p ON p.id=a.patient_id "
            "WHERE p.reference LIKE 'PAC-2026-%' GROUP BY a.status"
        )
    )
    card_statuses = dict(
        db.execute("SELECT status,count(*) FROM cards WHERE uid LIKE '04D3A9%' GROUP BY status")
    )
    open_card_assignments = scalar(
        "SELECT count(DISTINCT x.card_id) FROM assignments x JOIN cards c ON c.id=x.card_id "
        "WHERE c.uid LIKE '04D3A9%' AND x.released_at IS NULL"
    )
    event_codes = dict(
        db.execute(
            "SELECT e.response->>'code',count(*) FROM rfid_events e "
            "WHERE e.response->>'attention_id' IN "
            "(SELECT a.id::text FROM attentions a JOIN patients p ON p.id=a.patient_id "
            "WHERE p.reference LIKE 'PAC-2026-%') GROUP BY e.response->>'code'"
        )
    )
    visible_qa = {
        'patients': scalar("SELECT count(*) FROM patients WHERE reference LIKE 'QA-%'"),
        'dentists': scalar("SELECT count(*) FROM dentists WHERE name LIKE 'QA %' OR name ILIKE '%prueba%'"),
        'services': scalar("SELECT count(*) FROM services WHERE name LIKE 'QA %'"),
        'stations': scalar("SELECT count(*) FROM stations WHERE name LIKE 'QA %'"),
        'cards': scalar("SELECT count(*) FROM cards WHERE uid LIKE 'QA-%'"),
        'shifts': scalar("SELECT count(*) FROM shifts WHERE name LIKE 'QA %'"),
        'users': scalar(
            "SELECT count(*) FROM users WHERE name LIKE 'QA %' OR email LIKE 'qa.%' OR name ILIKE '%prueba%'"
        ),
    }
    mismatched_completed = scalar(
        """SELECT count(*) FROM attentions a JOIN patients p ON p.id=a.patient_id
        WHERE p.reference LIKE 'PAC-2026-%' AND a.status='COMPLETED' AND
        ((SELECT count(*) FROM rfid_events e WHERE e.response->>'attention_id'=a.id::text AND
            e.response->>'code'='CHECK_IN')<>1 OR
         (SELECT count(*) FROM rfid_events e WHERE e.response->>'attention_id'=a.id::text AND
            e.response->>'code'='CHECK_OUT')<>1)"""
    )
    calendar_mismatches = scalar(
        "SELECT count(*) FROM calendar_days c JOIN shifts s ON s.id=c.shift_id "
        "WHERE s.weekday<>extract(dow from c.day)"
    )
    event_card_mismatches = scalar(
        "SELECT count(*) FROM rfid_events e WHERE e.uid LIKE '04D3A9%' "
        "AND NOT EXISTS (SELECT 1 FROM cards c WHERE c.uid=e.uid)"
    )
    attention_price_mismatches = scalar(
        "SELECT count(*) FROM attentions a JOIN services s ON s.id=a.service_id "
        "JOIN patients p ON p.id=a.patient_id WHERE p.reference LIKE 'PAC-2026-%' "
        "AND a.price_cents<>s.price_cents"
    )
    qa_in_weekly_reports = scalar(
        "SELECT count(*) FROM weekly_reports WHERE payload::text ILIKE '%QA%'"
    )
    presentation_reports = scalar(
        "SELECT count(*) FROM weekly_reports WHERE payload->>'dataset'='presentacion' "
        "AND (payload->'summary'->>'attentions')::int>0"
    )
    reports_with_data = scalar(
        "SELECT count(*) FROM weekly_reports WHERE (payload->'summary'->>'attentions')::int>0"
    )
    samples = {
        'patients': [
            dict(zip(('name', 'reference'), row))
            for row in db.execute(
                "SELECT name,reference FROM patients WHERE reference LIKE 'PAC-2026-%' ORDER BY reference LIMIT 5"
            )
        ],
        'dentists': [
            dict(zip(('name', 'specialty'), row))
            for row in db.execute(
                "SELECT name,specialty FROM dentists WHERE name IN "
                "('Dra. Mariana López','Dr. Alejandro Ruiz','Dra. Sofía Hernández','Dr. Daniel Castro',"
                "'Dra. Valeria Mendoza','Dr. Roberto Salazar','Dra. Camila Torres') ORDER BY name"
            )
        ],
    }
    result = {
        'at': datetime.now(timezone.utc).isoformat(),
        'database': 'dentalrisk',
        'dataset': 'presentacion',
        'counts': counts,
        'presentation_counts': presentation,
        'attention_statuses': attention_statuses,
        'appointment_statuses': appointment_statuses,
        'card_statuses': card_statuses,
        'open_card_assignments': open_card_assignments,
        'rfid_events_by_code': event_codes,
        'visible_qa_remaining': visible_qa,
        'completed_without_matching_check_in_out': mismatched_completed,
        'calendar_weekday_mismatches': calendar_mismatches,
        'event_card_uid_mismatches': event_card_mismatches,
        'attention_price_mismatches': attention_price_mismatches,
        'weekly_reports_with_qa_text': qa_in_weekly_reports,
        'weekly_reports_with_presentation_data': presentation_reports,
        'weekly_reports_with_activity': reports_with_data,
        'samples': samples,
    }
    assert presentation == {
        'patients': 500,
        'appointments': 500,
        'attentions': 500,
        'assignments': 500,
        'rfid_events': 956,
        'cards': 50,
    }
    assert attention_statuses == {'COMPLETED': 475, 'INCIDENT': 5, 'IN_PROGRESS': 1, 'PENDING': 19}
    assert appointment_statuses == {'ATTENDED': 475, 'CANCELLED': 5, 'SCHEDULED': 20}
    assert card_statuses.get('ASSIGNED') == open_card_assignments
    assert card_statuses.get('BLOCKED') == 5
    assert sum(card_statuses.values()) == 50 and card_statuses.get('AVAILABLE', 0) > 0
    assert event_codes == {'CHECK_IN': 481, 'CHECK_OUT': 475}
    assert all(value == 0 for value in visible_qa.values())
    assert mismatched_completed == 0 and calendar_mismatches == 0 and event_card_mismatches == 0
    assert attention_price_mismatches == 0 and qa_in_weekly_reports == 0
    assert presentation_reports >= 18 and reports_with_data >= 20
    result['status'] = 'passed'
    output = ROOT / 'docs' / 'evidencias' / 'datos-presentacion-2026-11-23.json'
    output.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(result, ensure_ascii=False, indent=2))
