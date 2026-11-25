"""Read-only verification of the active shared DentalRisk database."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from fastapi.testclient import TestClient
from dotenv import dotenv_values
from sqlalchemy import text
from sqlalchemy.engine import make_url
from db.database import make_engine
from core.config import Settings
from main import create_app
from core.security import verify_password


class ReadyStorage:
    def ready(self):
        return None


settings = Settings()
clinic_env = dotenv_values(Path(__file__).resolve().parents[2] / '.env')
assert make_url(settings.database_url).database == 'dentalrisk'
assert settings.clinical_connector_enabled
engine = make_engine(settings.database_url)
try:
    with engine.connect() as connection:
        count = connection.scalar(text('SELECT count(*) FROM users'))
        assert count >= 1
        assert connection.scalar(text("SELECT count(*) FROM information_schema.columns "
            "WHERE table_name='users' AND column_name='profile_object_key'")) == 1
        assert connection.scalar(text("SELECT to_regclass('public.agent_users') IS NULL"))
        attention_count = connection.scalar(text('SELECT count(*) FROM attentions'))
        appointment_count = connection.scalar(text('SELECT count(*) FROM appointments'))
        assert attention_count >= 0 and appointment_count >= 0
        assert connection.scalar(text('SELECT count(*) FROM agent_operations')) >= 0
        assert connection.scalar(text("SELECT has_table_privilege(current_user,'users','INSERT, UPDATE')"))
        assert connection.scalar(text("SELECT has_table_privilege(current_user,'attentions','SELECT')"))
        esp_owner_valid = bool(settings.esp_agent_owner_id and connection.scalar(
            text("SELECT 1 FROM users WHERE id=:id AND role='ADMIN' AND active=true"),
            {'id': settings.esp_agent_owner_id}))
        admin = connection.execute(text('SELECT password_hash FROM users WHERE email=:email'),
            {'email': clinic_env['ADMIN_EMAIL']}).mappings().first()
        configured_admin_matches = bool(admin and verify_password(
            clinic_env['ADMIN_PASSWORD'], admin['password_hash']))
    app = create_app(settings, engine=engine, storage=ReadyStorage())
    with TestClient(app) as client:
        assert client.get('/health/ready').status_code == 200
        assert client.get('/api/v1/clinical/records?kind=attentions').status_code == 401
    print(f'Base compartida verificada en solo lectura: {count} usuarios, '
          f'{attention_count} atenciones, {appointment_count} citas; '
          'esquema, privilegios y protección de rutas correctos. '
          f'Delegación ESP válida: {esp_owner_valid}; '
          f'clave configurada: {bool(settings.esp_agent_key_hash)}; '
          f'dueño configurado: {bool(settings.esp_agent_owner_id)}; '
          f'clave inicial clínica válida: {configured_admin_matches}.')
finally:
    engine.dispose()
