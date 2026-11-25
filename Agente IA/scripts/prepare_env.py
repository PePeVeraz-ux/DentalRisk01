"""Generate independent development credentials without printing them."""
from pathlib import Path
from secrets import token_urlsafe

path = Path('.env')
if path.exists():
    raise SystemExit('.env ya existe; se conserva sin cambios')
password = token_urlsafe(36)
path.write_text('\n'.join([
    'ENVIRONMENT=development', f'DATABASE_URL=postgresql+psycopg://dentalrisk_agent:{password}@127.0.0.1:5434/dentalrisk_agent',
    f'SECRET_KEY={token_urlsafe(48)}',
    'MINIO_ENDPOINT=http://127.0.0.1:9100',
    f'MINIO_ACCESS_KEY=dr-{token_urlsafe(12)}',
    f'MINIO_SECRET_KEY={token_urlsafe(36)}',
    'MINIO_BUCKET=dentalrisk-profiles',
    f'POSTGRES_PASSWORD={password}', 'AI_MODEL=qwen2.5:7b', '',
]), encoding='utf-8')
print('Creado .env con credenciales locales independientes; no subir a Git')
