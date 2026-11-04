"""Generate schema documentation from PostgreSQL catalogs, without reading user data."""
from pathlib import Path
import json
import re
import psycopg
from psycopg.rows import dict_row
from dotenv import dotenv_values

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'output' / 'modelos-base-de-datos'
OUT.mkdir(parents=True, exist_ok=True)
document = ['# Diagramas entidad–relación y modelos relacionales',
    'DentalRisk y Agente IA · PostgreSQL · Esquema verificado el 3 de noviembre de 2026.',
    'Son dos bases independientes. No existen claves foráneas entre ellas. Este documento describe el esquema implementado, no un modelo propuesto.',
    '## Convenciones',
    '**PK:** clave primaria. **FK:** clave foránea. **UK:** unicidad de una columna. **?**: admite NULL. Las restricciones UNIQUE compuestas y los índices únicos parciales se detallan aparte.',
    'En los diagramas, `||` significa exactamente uno; `o|`, cero o uno; `o{`, cero o muchos. Las líneas punteadas son relaciones no identificadoras: la FK no forma parte de la PK de la tabla hija. Los diagramas muestran las claves; el modelo relacional contiene todos los atributos.']
for name, envfile in [('dentalrisk', ROOT / '.env'), ('dentalrisk_agent', ROOT / 'Agente IA/.env')]:
    url = dotenv_values(envfile)['DATABASE_URL'].replace('postgresql+psycopg:', 'postgresql:')
    with psycopg.connect(url, row_factory=dict_row) as conn:
        tables = conn.execute("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename").fetchall()
        metadata = []
        for item in tables:
            table = item['tablename']
            columns = conn.execute('''SELECT a.attname AS name, format_type(a.atttypid,a.atttypmod) AS type,
                NOT a.attnotnull AS nullable, pg_get_expr(d.adbin,d.adrelid) AS default_value
                FROM pg_attribute a JOIN pg_class t ON t.oid=a.attrelid JOIN pg_namespace n ON n.oid=t.relnamespace
                LEFT JOIN pg_attrdef d ON d.adrelid=t.oid AND d.adnum=a.attnum
                WHERE n.nspname='public' AND t.relname=%s AND a.attnum>0 AND NOT a.attisdropped ORDER BY a.attnum''', [table]).fetchall()
            constraints = conn.execute('''SELECT c.contype AS kind, pg_get_constraintdef(c.oid) AS definition,
                ARRAY(SELECT attname FROM unnest(c.conkey) WITH ORDINALITY k(num,ord)
                    JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=k.num ORDER BY k.ord) AS columns,
                CASE WHEN c.contype='f' THEN c.confrelid::regclass::text END AS parent
                FROM pg_constraint c WHERE c.conrelid=to_regclass(%s) ORDER BY c.contype,c.conname''', ['public.'+table]).fetchall()
            indexes = conn.execute("SELECT indexdef FROM pg_indexes WHERE schemaname='public' AND tablename=%s ORDER BY indexname", [table]).fetchall()
            metadata.append(dict(table=table, columns=columns, constraints=constraints, indexes=indexes))
    aliases = {m['table']: 'entity' + ''.join(s.title() for s in m['table'].split('_')) for m in metadata}
    diagram = ['erDiagram', '    direction LR']
    for m in metadata:
        pks = {col for c in m['constraints'] if c['kind']=='p' for col in c['columns']}
        fks = {col for c in m['constraints'] if c['kind']=='f' for col in c['columns']}
        unique = {c['columns'][0] for c in m['constraints'] if c['kind']=='u' and len(c['columns'])==1}
        # Also recognize standalone, unconditional, single-column UNIQUE indexes.
        for idx in m['indexes']:
            match = re.search(r'CREATE UNIQUE INDEX .* USING btree \((\w+)\)$', idx['indexdef'])
            if match: unique.add(match[1])
        diagram.append(f'    {aliases[m["table"]]}["{m["table"]}"] {{')
        for col in m['columns']:
            keys = [label for label, names in [('PK',pks),('FK',fks),('UK',unique-pks)] if col['name'] in names]
            if keys:
                typ = re.sub(r'[^a-zA-Z0-9_]', '_', col['type'])
                diagram.append(f'        {typ} {col["name"]} {", ".join(keys)}' + (' "nullable"' if col['nullable'] else ''))
        diagram.append('    }')
        for c in m['constraints']:
            if c['kind']=='f':
                optional = any(col['nullable'] for col in m['columns'] if col['name'] in c['columns'])
                diagram.append(f'    {aliases[c["parent"]]} {"o|" if optional else "||"}..o{{ {aliases[m["table"]]} : "{", ".join(c["columns"])}"')
    mermaid = '\n'.join(diagram)
    (OUT / f'{name}-er.mmd').write_text(mermaid+'\n', encoding='utf-8')
    (OUT / f'{name}-esquema.json').write_text(json.dumps(metadata, ensure_ascii=False, indent=2), encoding='utf-8')
    document += [f'## {name}', f'{len(metadata)} tablas, incluidas las tablas técnicas de control de migraciones.', '### Diagrama entidad–relación', '```mermaid\n'+mermaid+'\n```', '### Modelo relacional']
    for m in metadata:
        pk = {col for c in m['constraints'] if c['kind']=='p' for col in c['columns']}
        fk = {col for c in m['constraints'] if c['kind']=='f' for col in c['columns']}
        fields = [c['name'] + (' [PK]' if c['name'] in pk else '') + (' [FK]' if c['name'] in fk else '') + ('?' if c['nullable'] else '') for c in m['columns']]
        document += [f'#### {m["table"]}', '`'+m['table']+'('+', '.join(fields)+')`',
            '| Atributo | Tipo PostgreSQL | Admite NULL | Valor por defecto en BD |', '|---|---|---|---|']
        for c in m['columns']:
            document.append(f'| `{c["name"]}` | `{c["type"]}` | {"Sí" if c["nullable"] else "No"} | '+ ('`'+c['default_value']+'`' if c['default_value'] else '—')+' |')
        document += ['', '**Claves y restricciones**', '']
        document += ['- `'+c['definition']+'`' for c in m['constraints']]
        partial = [i['indexdef'] for i in m['indexes'] if 'UNIQUE INDEX' in i['indexdef'] and ' WHERE ' in i['indexdef']]
        document += ['- Índice único parcial: `'+i+'`' for i in partial]
        # Include unique indexes that are not represented as UNIQUE constraints.
        document += ['- `'+i['indexdef']+'`' for i in m['indexes'] if 'UNIQUE INDEX' in i['indexdef'] and ' WHERE ' not in i['indexdef'] and m['table']=='agent_users']
document += ['## Interpretación y límites',
    '- `agent_users.dentist_id` es una referencia externa; no tiene FK hacia `dentists`. No hay relación SQL entre las bases.',
    '- `profile_object_key` guarda la clave del archivo en MinIO. Las imágenes no se almacenan en PostgreSQL.',
    '- `rfid_events.uid` no tiene FK hacia `cards.uid`; permite registrar lecturas de tarjetas desconocidas.',
    '- `audit.entity_id` y `agent_audit.entity_id` son referencias lógicas sin FK.',
    '- Una cita puede tener varias atenciones históricas. El índice parcial permite solo una atención PENDING o IN_PROGRESS por cita; no es una relación 1:1 permanente.',
    '- Una tarjeta puede tener varias atenciones históricas, pero solo una sin liberar. Una estación y un dentista solo pueden tener una atención IN_PROGRESS.',
    '- `calendar_days` tiene unicidad compuesta `(shift_id, day)`. No significa que cada columna sea única por separado.',
    '- `users.dentist_id` es opcional en general y obligatorio para el rol DENTIST. No tiene UNIQUE: el esquema permite varias cuentas asociadas al mismo dentista.',
    '- `operation_mutex`, `schema_migrations` y `alembic_version` son tablas técnicas. Las tablas sin conectores no tienen claves foráneas declaradas.',
    '- Los valores por defecto mostrados corresponden al servidor. Los valores asignados por el código Python no son necesariamente DEFAULT de PostgreSQL.',
    '- En todas las FK del esquema actual se aplica NO ACTION por defecto para borrado y actualización; no hay cascadas declaradas.']
content = re.sub(r'(?<=\|)\n\n(?=\|)', '\n', '\n\n'.join(document))
(OUT / 'Modelos-relacionales.md').write_text(content+'\n', encoding='utf-8')
print('Documentación generada en', OUT)
