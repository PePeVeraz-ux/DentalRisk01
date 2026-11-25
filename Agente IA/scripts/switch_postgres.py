"""Transfer the stopped local SQLite database to the prepared PostgreSQL target."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import json
import os
import re
import sqlite3
from datetime import datetime, timezone
from dotenv import dotenv_values
from alembic import command
from alembic.config import Config
from sqlalchemy import MetaData, select, func
from sqlalchemy.engine import make_url
from db.database import make_engine

original = Path('.env').read_text(encoding='utf-8')
source_url = dotenv_values('.env')['DATABASE_URL']
if source_url.startswith('postgresql'):
    raise SystemExit('PostgreSQL ya configurado; no se modifica.')
if not source_url.startswith('sqlite:///'):
    raise SystemExit('Origen no compatible; se conserva sin cambios.')
target_url = Path('.local/postgres-target.txt').read_text().strip()
os.environ['DATABASE_URL'] = target_url
command.upgrade(Config('alembic.ini'), 'head')
target = make_engine(target_url)
metadata = MetaData()
metadata.reflect(bind=target)
source_path = Path(make_url(source_url).database)
counts = {}
stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')
try:
    with target.begin() as dest:
        tables = [t for t in metadata.sorted_tables if t.name != 'alembic_version']
        for table in tables:
            if dest.scalar(select(func.count()).select_from(table)):
                raise RuntimeError('Destino no vacío; transferencia cancelada.')
        if source_path.is_file():
            snapshot = Path('.local') / f'before-postgres-{stamp}.sqlite'
            with sqlite3.connect(f'file:{source_path.resolve().as_posix()}?mode=ro', uri=True) as source:
                with sqlite3.connect(snapshot) as backup:
                    source.backup(backup)
            source_engine = make_engine('sqlite:///' + str(snapshot))
            try:
                with source_engine.connect() as src:
                    for table in tables:
                        rows = [dict(r) for r in src.execute(select(table)).mappings()]
                        # SQLite timestamps were stored in UTC without tzinfo.
                        for row in rows:
                            for key, value in row.items():
                                if isinstance(value, datetime) and value.tzinfo is None:
                                    row[key] = value.replace(tzinfo=timezone.utc)
                        if rows:
                            dest.execute(table.insert(), rows)
                        actual = [dict(r) for r in dest.execute(select(table)).mappings()]
                        canonical = lambda rs: sorted(json.dumps(r, sort_keys=True, default=str) for r in rs)
                        if canonical(rows) != canonical(actual):
                            raise RuntimeError('Contenido diferente: ' + table.name)
                        counts[table.name] = len(actual)
            finally:
                source_engine.dispose()
        else:
            counts = {t.name: 0 for t in tables}
    command.check(Config('alembic.ini'))
    Path(f'.local/environment-before-postgres-{stamp}.env').write_text(original, encoding='utf-8')
    updated = re.sub(r'^DATABASE_URL=.*$', lambda _: 'DATABASE_URL=' + target_url, original, flags=re.M)
    Path('.env').write_text(updated, encoding='utf-8')
    Path('evidence/migracion-postgresql.json').write_text(json.dumps({
        'date': stamp, 'database': 'PostgreSQL', 'sourceExisted': source_path.is_file(),
        'counts': counts, 'contentVerified': True,
    }, indent=2), encoding='utf-8')
    Path('.local/postgres-target.txt').unlink()
    print('PostgreSQL configurado. Esquema y datos verificados; origen conservado.')
finally:
    target.dispose()
