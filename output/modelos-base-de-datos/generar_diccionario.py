"""Construye el diccionario de datos a partir del modelo relacional verificado."""
from pathlib import Path
import re

HERE = Path(__file__).resolve().parent
SOURCE = HERE / 'Modelos-relacionales.md'
OUT = HERE / 'Diccionario-de-datos.md'
source = SOURCE.read_text(encoding='utf-8')

table_description = {
    'appointments':'Citas programadas y su estado.',
    'assignments':'Historial de asignación y liberación de tarjetas.',
    'attentions':'Atenciones operativas y marcas de tiempo RFID.',
    'audit':'Bitácora de operaciones del sistema clínico.',
    'calendar_days':'Días operados y descansos configurados por turno.',
    'cards':'Inventario de tarjetas RFID.',
    'dentists':'Catálogo de dentistas.',
    'incidents':'Incidencias y correcciones de atenciones.',
    'login_attempts':'Control de intentos de acceso al sistema clínico.',
    'operation_mutex':'Fila técnica usada para serializar operaciones concurrentes.',
    'patients':'Identificación mínima de pacientes para recepción.',
    'rfid_events':'Eventos RFID procesados y respuesta conservada para reintentos.',
    'schema_migrations':'Control técnico de versiones del esquema clínico.',
    'services':'Catálogo de servicios y precios.',
    'sessions':'Sesiones web activas o revocables.',
    'shifts':'Definición semanal de turnos.',
    'stations':'Estaciones que envían eventos RFID.',
    'users':'Cuentas y roles del sistema clínico.',
    'weekly_reports':'Reporte semanal materializado.',
    'agent_audit':'Bitácora del servicio Agente IA.',
    'agent_login_attempts':'Control de intentos de acceso al servicio Agente IA.',
    'agent_operations':'Registro de operaciones delegadas e idempotencia del agente.',
    'agent_sessions':'Sesiones JWT persistidas para poder revocarlas.',
    'agent_users':'Cuentas del servicio Agente IA.',
    'alembic_version':'Control técnico de la versión de migración Alembic.',
}

generic = {
    'id':'Identificador único del registro.',
    'patient_id':'Identificador del paciente relacionado.',
    'dentist_id':'Identificador del dentista relacionado.',
    'service_id':'Identificador del servicio relacionado.',
    'station_id':'Identificador de la estación relacionada.',
    'shift_id':'Identificador del turno relacionado.',
    'appointment_id':'Identificador de la cita relacionada, si existe.',
    'attention_id':'Identificador de la atención relacionada.',
    'card_id':'Identificador de la tarjeta relacionada.',
    'actor_id':'Identificador del usuario que efectuó o causó la acción, si se conoce.',
    'user_id':'Identificador de la cuenta titular de la sesión u operación.',
    'owner_id':'Identificador del administrador que delegó la operación al agente.',
    'name':'Nombre visible de la entidad.',
    'email':'Correo electrónico de acceso de la cuenta.',
    'password_hash':'Hash de la contraseña; no contiene la contraseña en claro.',
    'role':'Rol de autorización de la cuenta.',
    'active':'Indica si la entidad está habilitada.',
    'status':'Estado actual de la entidad.',
    'token_hash':'Hash del token o credencial persistida.',
    'expires_at':'Instante de vencimiento de la sesión.',
    'created_at':'Instante de creación del registro.',
    'updated_at':'Instante de la última actualización registrada.',
    'starts_at':'Instante programado de inicio de la cita.',
    'ends_at':'Instante programado de fin de la cita.',
    'started_at':'Instante real de inicio de la atención.',
    'ended_at':'Instante real de fin de la atención.',
    'released_at':'Instante de liberación de la tarjeta o asignación; vacío mientras sigue activa.',
    'assigned_at':'Instante en que se asignó la tarjeta.',
    'occurred_at':'Instante del evento recibido.',
    'generated_at':'Instante en que se generó el reporte.',
    'applied_at':'Instante en que se aplicó la migración del esquema.',
    'operation_until':'Instante hasta el cual dura el permiso operativo excepcional de la sesión, si existe.',
    'action':'Nombre de la acción registrada en auditoría.',
    'entity_id':'Identificador lógico de la entidad afectada; no es FK.',
    'detail':'Detalle estructurado de la acción de auditoría.',
    'reason':'Motivo registrado para la incidencia o corrección.',
    'key':'Clave técnica del contador de intentos de acceso.',
    'failures':'Número de intentos fallidos registrados.',
    'blocked_until':'Instante hasta el cual se bloquea el acceso, si aplica.',
    'kind':'Tipo de operación o incidencia.',
    'uid':'Identificador leído de la tarjeta RFID.',
    'response':'Respuesta estructurada conservada para devolverla ante reintentos.',
    'price_cents':'Precio en centavos de MXN; se evita la aritmética monetaria binaria.',
    'specialty':'Especialidad del dentista.',
    'reference':'Referencia única del paciente usada en recepción.',
    'weekday':'Día de la semana codificado como entero.',
    'start_time':'Hora de inicio del turno.',
    'end_time':'Hora de fin del turno.',
    'day':'Fecha de calendario correspondiente al turno.',
    'operated':'Indica si el turno se considera operado ese día.',
    'breaks':'Intervalos de descanso del turno en JSON.',
    'before_value':'Valor anterior de la entidad, conservado como JSON.',
    'after_value':'Valor posterior de la entidad, conservado como JSON.',
    'csrf':'Valor de protección contra solicitudes entre sitios de la sesión.',
    'week_start':'Fecha inicial de la semana resumida.',
    'payload':'Datos agregados del reporte semanal en JSON.',
    'version':'Número de migración SQL aplicada.',
    'version_num':'Identificador de revisión Alembic aplicada.',
    'request_hash':'Huella del contenido de una petición delegada para comprobar reintentos.',
    'profile_object_key':'Clave del objeto de imagen almacenado en MinIO, si existe.',
}

specific = {
    ('attentions','price_cents'):'Precio histórico del servicio al crear la atención, en centavos de MXN.',
    ('attentions','status'):'Estado de la atención: pendiente, en proceso, completada, cancelada o incidencia.',
    ('appointments','status'):'Estado de la cita: programada, cancelada o atendida.',
    ('cards','status'):'Disponibilidad de la tarjeta: disponible, asignada o bloqueada.',
    ('stations','token_hash'):'Hash de la credencial de estación; vacío cuando no tiene una vigente.',
    ('login_attempts','key'):'Clave derivada para agrupar intentos de acceso al sistema clínico.',
    ('agent_login_attempts','key'):'Clave derivada para agrupar intentos de acceso al agente.',
    ('agent_operations','id'):'Identificador de solicitud usado para evitar duplicar una operación delegada.',
    ('users','dentist_id'):'Dentista vinculado a la cuenta; obligatorio cuando el rol es DENTIST.',
    ('agent_users','dentist_id'):'Referencia lógica externa al dentista de DentalRisk; no es FK entre bases.',
    ('agent_users','role'):'Rol del usuario del servicio Agente IA.',
    ('agent_audit','entity_id'):'Identificador lógico de la entidad afectada; no es FK.',
    ('rfid_events','uid'):'UID leído, incluso cuando no corresponde a una tarjeta conocida; no es FK.',
    ('operation_mutex','id'):'Identificador fijo de la única fila de control; el esquema exige el valor 1.',
}

parts = re.split(r'^#### ([a-z_]+)\s*$', source, flags=re.M)
tables=[]
for i in range(1,len(parts),2):
    name,body=parts[i],parts[i+1]
    body=body.split('\n## ',1)[0]
    rows=[]
    for line in body.splitlines():
        if not line.startswith('| `'): continue
        cells=[c.strip().strip('`') for c in line.strip('|').split('|')]
        if len(cells)==4: rows.append(cells)
    if not rows: continue
    keys=[]
    line=next((x for x in body.splitlines() if x.startswith('`'+name+'(')),None)
    if line:
        for col,tag in re.findall(r'([a-z_]+) \[(PK|FK|UK)\]',line):keys.append((col,tag))
    if name=='agent_users': keys.append(('email','UK'))
    constraints=[]
    for c in body.splitlines():
        c=c.strip()
        if c.startswith('- `') and ('CHECK ' in c or 'FOREIGN KEY' in c or 'PRIMARY KEY' in c or 'UNIQUE' in c):
            constraints.append(c[3:-1])
    tables.append((name,rows,dict(keys),constraints))

missing=sorted({(n,c[0]) for n,rows,_,_ in tables for c in rows if (n,c[0]) not in specific and c[0] not in generic})
if missing: raise SystemExit('Faltan descripciones: '+repr(missing))

lines=['# Diccionario de datos de DentalRisk y Agente IA','',
       '**Corte del esquema:** 3 de noviembre de 2026. **Fuente:** `Modelos-relacionales.md`, generado del catálogo PostgreSQL. Las dos bases son independientes.','',
       'Las descripciones explican el uso funcional de los campos. Los tipos, nulos, valores por defecto y restricciones proceden del esquema verificado. Un guion en «Defecto BD» significa que PostgreSQL no define un valor por defecto, aunque la aplicación pueda asignarlo. No se inventan límites que no estén expresados en el esquema. Este diccionario describe el OLTP implementado; aún no existe un esquema OLAP o de modelos ML.','',
       '**Convenciones:** PK = clave primaria; FK = clave foránea; UK = valor único; «Sí» en nulos indica que el campo es opcional en la base. Fechas `timestamp with time zone` se almacenan con zona horaria; la aplicación presenta la zona clínica.','']
for database in ('dentalrisk','dentalrisk_agent'):
    lines += [f'## Base `{database}`','']
    subset=tables[:19] if database=='dentalrisk' else tables[19:]
    for name,rows,keys,constraints in subset:
        lines += [f'### `{name}`','',table_description[name],'',
                  '| Campo | Tipo PostgreSQL | Nulos | Clave | Defecto BD | Descripción |',
                  '|---|---|---|---|---|---|']
        for col,typ,null,default in rows:
            role=keys.get(col,'—')
            desc=specific.get((name,col),generic[col])
            if col.endswith('_id') and role=='FK': desc += ' Relación con la tabla indicada en las restricciones.'
            lines.append(f'| `{col}` | `{typ}` | {null} | {role} | {default} | {desc} |')
        lines += ['','**Restricciones e índices relevantes del esquema:**']
        lines += [f'- `{c}`' for c in constraints] if constraints else ['- Sin restricciones adicionales documentadas.']
        lines.append('')
lines += ['## Límites y reglas de interpretación','',
          '- `agent_users.dentist_id` es una referencia lógica al otro sistema, sin FK entre bases.',
          '- `profile_object_key` apunta a MinIO; el contenido de la imagen no está en PostgreSQL.',
          '- `rfid_events.uid` no es FK a `cards.uid`, para admitir y registrar lecturas desconocidas.',
          '- `audit.entity_id` y `agent_audit.entity_id` son referencias lógicas, sin FK.',
          '- Las reglas de unicidad parcial, claves compuestas y comprobaciones se reproducen desde el modelo; no debe interpretarse una FK como relación entre bases.','']
OUT.write_text('\n'.join(lines),encoding='utf-8')
print(f'{len(tables)} tablas, {sum(len(r) for _,r,_,_ in tables)} atributos: {OUT}')
