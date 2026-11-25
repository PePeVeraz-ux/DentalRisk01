from typing import Literal
from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file='.env', extra='ignore')
    environment: Literal['development', 'test', 'production'] = 'development'
    database_url: str
    secret_key: str = Field(min_length=32)
    token_minutes: int = Field(default=30, ge=1, le=60)
    jwt_issuer: str = 'dentalrisk-agent'
    jwt_audience: str = 'dentalrisk-agent-api'
    minio_endpoint: str = 'http://127.0.0.1:9100'
    minio_access_key: str
    minio_secret_key: str
    minio_bucket: str = 'dentalrisk-profiles'
    ai_model: str = 'qwen2.5:7b'
    clinic_timezone: str = 'America/Tijuana'
    esp_base_url: str | None = None
    esp_agent_key_hash: str | None = Field(default=None, pattern=r'^[a-f0-9]{64}$')
    esp_agent_owner_id: str | None = None
    clinical_connector_enabled: bool = False

    @model_validator(mode='after')
    def production_settings(self):
        if self.environment != 'test' and not self.database_url.startswith('postgresql+psycopg://'):
            raise ValueError('Configure DATABASE_URL con PostgreSQL (postgresql+psycopg://)')
        if self.esp_base_url:
            from core.esp import validate_base_url
            validate_base_url(self.esp_base_url)
        if self.environment == 'production':
            if not self.database_url.startswith('postgresql+psycopg://'):
                raise ValueError('Producción requiere PostgreSQL')
            if not self.minio_endpoint.startswith('https://'):
                raise ValueError('Producción requiere HTTPS para MinIO')
        return self
