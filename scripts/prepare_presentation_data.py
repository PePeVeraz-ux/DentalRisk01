"""Convierte la carga QA coherente en datos ficticios realistas de presentación.

Conserva IDs y relaciones clínicas. Antes de modificar la base crea un respaldo
lógico de todos los valores afectados en .local/backups. La ejecución sobre la
base de trabajo exige --apply-live.
"""

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path

import psycopg


ROOT = Path(__file__).resolve().parents[1]
CONFIG = json.loads((ROOT / '.local/postgres-local.json').read_text(encoding='utf-8'))
BACKUP_DIR = ROOT / '.local' / 'backups'

DENTISTS = [
    ('Dra. Mariana López', 'Odontología general', 'mariana.lopez@demo.dentalrisk.mx'),
    ('Dr. Alejandro Ruiz', 'Endodoncia', 'alejandro.ruiz@demo.dentalrisk.mx'),
    ('Dra. Sofía Hernández', 'Ortodoncia', 'sofia.hernandez@demo.dentalrisk.mx'),
    ('Dr. Daniel Castro', 'Periodoncia', 'daniel.castro@demo.dentalrisk.mx'),
    ('Dra. Valeria Mendoza', 'Odontopediatría', 'valeria.mendoza@demo.dentalrisk.mx'),
    ('Dr. Roberto Salazar', 'Cirugía oral', 'roberto.salazar@demo.dentalrisk.mx'),
    ('Dra. Camila Torres', 'Rehabilitación oral', 'camila.torres@demo.dentalrisk.mx'),
]

SERVICES = [
    ('Consulta de valoración', 50000),
    ('Limpieza dental', 85000),
    ('Radiografía periapical', 35000),
    ('Aplicación de flúor', 45000),
    ('Resina dental', 120000),
    ('Sellador dental', 65000),
    ('Extracción simple', 150000),
    ('Extracción quirúrgica', 320000),
    ('Endodoncia unirradicular', 350000),
    ('Endodoncia multirradicular', 480000),
    ('Corona de zirconia', 650000),
    ('Prótesis removible', 850000),
    ('Blanqueamiento dental', 280000),
    ('Guarda oclusal', 220000),
    ('Ajuste de ortodoncia', 95000),
]

STATIONS = [
    'Consultorio 1 · Diagnóstico',
    'Consultorio 2 · Odontología general',
    'Consultorio 3 · Especialidades',
    'Consultorio 4 · Cirugía oral',
]

SHIFT_NAMES = [
    'Lunes · Jornada completa',
    'Martes · Jornada completa',
    'Miércoles · Jornada completa',
    'Jueves · Jornada completa',
    'Viernes · Jornada completa',
]

FIRST_NAMES = [
    'María Fernanda', 'José Luis', 'Sofía', 'Alejandro', 'Valentina',
    'Diego', 'Camila', 'Sebastián', 'Regina', 'Mateo',
    'Daniela', 'Emiliano', 'Ximena', 'Santiago', 'Renata',
    'Leonardo', 'Natalia', 'Andrés', 'Mariana', 'Javier',
    'Fernanda', 'Carlos', 'Lucía', 'Ricardo', 'Paola',
]

SURNAMES = [
    'García López', 'Hernández Ruiz', 'Martínez Torres', 'González Castro',
    'Rodríguez Mendoza', 'Sánchez Flores', 'Ramírez Ortega', 'Cruz Navarro',
    'Morales Silva', 'Reyes Vargas', 'Jiménez Romero', 'Díaz Salazar',
    'Vázquez Rojas', 'Álvarez Medina', 'Castillo Moreno', 'Herrera Vega',
    'Aguilar Campos', 'Mendoza Fuentes', 'Torres Pineda', 'Flores Cabrera',
]

USER_RENAMES = {
    'qa.coherente.reception@dentalrisk.local': (
        'Laura Gómez', 'laura.gomez@demo.dentalrisk.mx'
    ),
    'qa.coherente.support@dentalrisk.local': (
        'Miguel Herrera', 'miguel.herrera@demo.dentalrisk.mx'
    ),
    'qa.esp.shared.2c3b749f@example.com': (
        'Recepción auxiliar', 'recepcion.auxiliar@demo.dentalrisk.mx'
    ),
}

DISPLAY_NAME_RENAMES = {
    'Dentista de prueba': 'Dr. Luis Ortega',
    'Recepción de prueba': 'Ana Martínez',
    'Soporte de prueba': 'Carlos Vega',
}


def rows_as_dicts(cursor, query, params=()):
    cursor.execute(query, params) if params else cursor.execute(query)
    columns = [column.name for column in cursor.description]
    return [dict(zip(columns, row)) for row in cursor.fetchall()]


def visible_qa_counts(cursor):
    checks = {
        'patients': ("SELECT count(*) FROM patients WHERE reference LIKE 'QA-%'", ()),
        'dentists': ("SELECT count(*) FROM dentists WHERE name LIKE 'QA %'", ()),
        'services': ("SELECT count(*) FROM services WHERE name LIKE 'QA %'", ()),
        'stations': ("SELECT count(*) FROM stations WHERE name LIKE 'QA %'", ()),
        'cards': ("SELECT count(*) FROM cards WHERE uid LIKE 'QA-%'", ()),
        'shifts': ("SELECT count(*) FROM shifts WHERE name LIKE 'QA %'", ()),
        'users': (
            "SELECT count(*) FROM users WHERE name LIKE 'QA %' OR email LIKE 'qa.%' OR name ILIKE '%prueba%'",
            (),
        ),
    }
    return {
        name: (cursor.execute(sql, params) if params else cursor.execute(sql)).fetchone()[0]
        for name, (sql, params) in checks.items()
    }


def build_backup(cursor):
    return {
        'created_at': datetime.now(timezone.utc).isoformat(),
        'patients': rows_as_dicts(
            cursor, "SELECT id,name,reference FROM patients WHERE reference LIKE 'QA-20261112-P%' ORDER BY reference"
        ),
        'dentists': rows_as_dicts(
            cursor, "SELECT id,name,specialty FROM dentists WHERE name LIKE 'QA Dentista %' OR name ILIKE '%prueba%' ORDER BY name"
        ),
        'services': rows_as_dicts(
            cursor, "SELECT id,name,price_cents FROM services WHERE name LIKE 'QA Servicio %' ORDER BY name"
        ),
        'stations': rows_as_dicts(
            cursor, "SELECT id,name FROM stations WHERE name LIKE 'QA Consultorio %' ORDER BY name"
        ),
        'cards': rows_as_dicts(
            cursor, "SELECT id,uid,status FROM cards WHERE uid LIKE 'QA-20261112-CARD-%' ORDER BY uid"
        ),
        'shifts': rows_as_dicts(
            cursor, "SELECT id,name,weekday FROM shifts WHERE name LIKE 'QA Turno %' ORDER BY weekday"
        ),
        'users': rows_as_dicts(
            cursor,
            "SELECT id,name,email,role,dentist_id FROM users "
            "WHERE name LIKE 'QA %' OR email LIKE 'qa.%' OR name ILIKE '%prueba%' ORDER BY role,name",
        ),
        'rfid_events': rows_as_dicts(
            cursor,
            "SELECT id,uid FROM rfid_events WHERE uid LIKE 'QA-20261112-CARD-%' ORDER BY occurred_at,id",
        ),
        'incidents': rows_as_dicts(
            cursor, "SELECT id,reason FROM incidents WHERE reason ILIKE '%prueba%' ORDER BY created_at,id"
        ),
        'weekly_reports': rows_as_dicts(
            cursor, "SELECT week_start,payload FROM weekly_reports WHERE payload->>'synthetic'='true' ORDER BY week_start"
        ),
    }


def prepare(database_name):
    if len(FIRST_NAMES) * len(SURNAMES) != 500:
        raise RuntimeError('El catálogo de nombres debe producir exactamente 500 pacientes')

    credentials_path = ROOT / '.local' / 'seed-coherent-credentials.json'
    existing_credentials = (
        json.loads(credentials_path.read_text(encoding='utf-8')) if credentials_path.exists() else []
    )

    with psycopg.connect(
        host='127.0.0.1',
        port=CONFIG['port'],
        user='dentalrisk_local_admin',
        password=CONFIG['password'],
        dbname=database_name,
        autocommit=True,
    ) as db:
        cursor = db.cursor()
        before = visible_qa_counts(cursor)
        if all(value == 0 for value in before.values()):
            return {'status': 'already_prepared', 'visible_qa_before': before}
        expected = {
            'patients': 500,
            'dentists': 7,
            'services': 15,
            'stations': 4,
            'cards': 50,
            'shifts': 5,
            'users': 13,
        }
        if before != expected:
            raise RuntimeError(f'La carga QA activa no coincide con la esperada: {before}')

        backup = build_backup(cursor)
        backup['credentials'] = existing_credentials
        BACKUP_DIR.mkdir(parents=True, exist_ok=True)
        stamp = datetime.now().strftime('%Y%m%d-%H%M%S')
        backup_path = BACKUP_DIR / f'before-presentation-data-{stamp}.json'
        backup_path.write_text(
            json.dumps(backup, ensure_ascii=False, indent=2, default=str), encoding='utf-8'
        )

        with db.transaction():
            cursor.execute('SELECT id FROM operation_mutex WHERE id=1 FOR UPDATE')
            if visible_qa_counts(cursor) != expected:
                raise RuntimeError('Los datos cambiaron después de crear el respaldo; no se aplicó la conversión')

            patients = cursor.execute(
                "SELECT id FROM patients WHERE reference LIKE 'QA-20261112-P%' ORDER BY reference"
            ).fetchall()
            patient_names = [f'{first} {surname}' for first in FIRST_NAMES for surname in SURNAMES]
            cursor.executemany(
                'UPDATE patients SET name=%s,reference=%s WHERE id=%s',
                [
                    (patient_names[index], f'PAC-2026-{index + 1:04d}', patient_id)
                    for index, (patient_id,) in enumerate(patients)
                ],
            )

            dentists = cursor.execute(
                "SELECT id FROM dentists WHERE name LIKE 'QA Dentista %' ORDER BY name"
            ).fetchall()
            for (dentist_id,), (name, specialty, email) in zip(dentists, DENTISTS, strict=True):
                cursor.execute(
                    'UPDATE dentists SET name=%s,specialty=%s WHERE id=%s',
                    (name, specialty, dentist_id),
                )
                cursor.execute(
                    'UPDATE users SET name=%s,email=%s WHERE dentist_id=%s AND email LIKE %s',
                    (name, email, dentist_id, 'qa.coherente.%'),
                )

            services = cursor.execute(
                "SELECT id FROM services WHERE name LIKE 'QA Servicio %' ORDER BY name"
            ).fetchall()
            cursor.executemany(
                'UPDATE services SET name=%s,price_cents=%s WHERE id=%s',
                [(name, price, service_id) for (service_id,), (name, price) in zip(services, SERVICES, strict=True)],
            )

            stations = cursor.execute(
                "SELECT id FROM stations WHERE name LIKE 'QA Consultorio %' ORDER BY name"
            ).fetchall()
            cursor.executemany(
                'UPDATE stations SET name=%s WHERE id=%s',
                [(name, station_id) for (station_id,), name in zip(stations, STATIONS, strict=True)],
            )

            cards = cursor.execute(
                "SELECT id,uid FROM cards WHERE uid LIKE 'QA-20261112-CARD-%' ORDER BY uid"
            ).fetchall()
            for index, (card_id, old_uid) in enumerate(cards, 1):
                new_uid = f'04D3A9{index:08X}'
                cursor.execute('UPDATE cards SET uid=%s WHERE id=%s', (new_uid, card_id))
                cursor.execute('UPDATE rfid_events SET uid=%s WHERE uid=%s', (new_uid, old_uid))

            shifts = cursor.execute(
                "SELECT id FROM shifts WHERE name LIKE 'QA Turno %' ORDER BY weekday"
            ).fetchall()
            cursor.executemany(
                'UPDATE shifts SET name=%s WHERE id=%s',
                [(name, shift_id) for (shift_id,), name in zip(shifts, SHIFT_NAMES, strict=True)],
            )

            for old_email, (name, new_email) in USER_RENAMES.items():
                cursor.execute(
                    'UPDATE users SET name=%s,email=%s WHERE email=%s',
                    (name, new_email, old_email),
                )
            for old_name, new_name in DISPLAY_NAME_RENAMES.items():
                cursor.execute('UPDATE users SET name=%s WHERE name=%s', (new_name, old_name))
            cursor.execute(
                "UPDATE dentists SET name='Dr. Luis Ortega',specialty='Odontología general' "
                "WHERE name='Dentista de prueba (acceso local)'"
            )
            cursor.execute(
                "UPDATE incidents SET reason='Tarjeta reportada como extraviada durante la atención' "
                "WHERE reason ILIKE '%prueba%'"
            )

            reports = cursor.execute(
                "SELECT week_start,payload FROM weekly_reports WHERE payload->>'synthetic'='true'"
            ).fetchall()
            for week_start, payload in reports:
                payload.pop('synthetic', None)
                payload['dataset'] = 'presentacion'
                cursor.execute(
                    'UPDATE weekly_reports SET payload=%s::jsonb WHERE week_start=%s',
                    (json.dumps(payload, ensure_ascii=False), week_start),
                )

        new_email_by_old = {
            f'qa.coherente.dentista{index}@dentalrisk.local': dentist[2]
            for index, dentist in enumerate(DENTISTS, 1)
        }
        new_email_by_old.update(
            {
                'qa.coherente.reception@dentalrisk.local': USER_RENAMES['qa.coherente.reception@dentalrisk.local'][1],
                'qa.coherente.support@dentalrisk.local': USER_RENAMES['qa.coherente.support@dentalrisk.local'][1],
            }
        )
        presentation_credentials = []
        for item in existing_credentials:
            updated = dict(item)
            updated['email'] = new_email_by_old.get(item['email'], item['email'])
            matching = next((d for d in DENTISTS if d[2] == updated['email']), None)
            if matching:
                updated['name'] = matching[0]
            elif updated['role'] == 'RECEPTION':
                updated['name'] = 'Laura Gómez'
            elif updated['role'] == 'SUPPORT':
                updated['name'] = 'Miguel Herrera'
            presentation_credentials.append(updated)
        credentials_output = ROOT / '.local' / 'presentation-credentials.json'
        credentials_output.write_text(
            json.dumps(presentation_credentials, ensure_ascii=False, indent=2), encoding='utf-8'
        )

        after = visible_qa_counts(cursor)
        summary = {
            'status': 'prepared',
            'backup': str(backup_path),
            'credentials': str(credentials_output),
            'visible_qa_before': before,
            'visible_qa_after': after,
            'patients': cursor.execute("SELECT count(*) FROM patients WHERE reference LIKE 'PAC-2026-%'").fetchone()[0],
            'cards': cursor.execute("SELECT count(*) FROM cards WHERE uid LIKE '04D3A9%'").fetchone()[0],
        }
        if any(after.values()) or summary['patients'] != 500 or summary['cards'] != 50:
            raise RuntimeError(f'La validación final no coincide con lo esperado: {summary}')
        return summary


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--database', default='dentalrisk')
    parser.add_argument('--apply-live', action='store_true')
    args = parser.parse_args()
    if args.database == 'dentalrisk' and not args.apply_live:
        parser.error('Use --apply-live después de confirmar el respaldo lógico')
    print(json.dumps(prepare(args.database), ensure_ascii=False, indent=2))
