from contextlib import asynccontextmanager
import logging
from fastapi import Depends, FastAPI, HTTPException
from sqlalchemy import text
from sqlmodel import Session
from botocore.exceptions import BotoCoreError, ClientError
from api.v1.dependencies import current_user
from api.v1.user_api import router
from api.v1.agent_api import router as agent_router
from api.v1.clinical_api import router as clinical_router
from agent.policy import CAPABILITIES
from core.config import Settings
from core.body_limit import BodyLimitMiddleware
from core.storage import ProfileStorage
from core.esp import EspAttachmentSource
from db.database import make_engine
from db.database import get_session
from models.user_model import User


def create_app(settings=None, engine=None, storage=None, esp_source=None):
    settings = settings or Settings()
    engine = engine or make_engine(settings.database_url)

    @asynccontextmanager
    async def lifespan(app):
        yield
        engine.dispose()

    app = FastAPI(title='DentalRisk Agente IA', version='0.1.1',
        description='Identidad, autenticación y altas con fotos privadas desde el agente ESP. Sin inferencia en el servidor.',
        lifespan=lifespan)
    app.state.settings = settings
    app.state.engine = engine
    app.state.storage = storage or ProfileStorage(settings)
    app.state.esp_source = esp_source or EspAttachmentSource(settings)
    app.state.logger = logging.getLogger('dentalrisk.agent')

    @app.middleware('http')
    async def security_headers(request, call_next):
        # v01 is a same-origin / Swagger API, without cross-origin browser access.
        if request.method not in {'GET', 'HEAD', 'OPTIONS'} and request.headers.get('origin'):
            from urllib.parse import urlsplit
            origin = urlsplit(request.headers['origin'])
            expected = urlsplit(str(request.base_url))
            if (origin.scheme, origin.netloc) != (expected.scheme, expected.netloc):
                from fastapi.responses import JSONResponse
                return JSONResponse({'detail': 'Origen no autorizado'}, status_code=403)
        response = await call_next(request)
        response.headers['X-Content-Type-Options'] = 'nosniff'
        response.headers['Referrer-Policy'] = 'no-referrer'
        if request.url.path.startswith('/api/'):
            response.headers['Cache-Control'] = 'no-store'
        return response

    app.add_middleware(BodyLimitMiddleware)
    app.include_router(router, prefix='/api/v1')
    app.include_router(agent_router,prefix='/api/v1')
    app.include_router(clinical_router,prefix='/api/v1')

    @app.get('/health/live', tags=['Estado'])
    def live():
        return {'status': 'ok', 'version': '0.1.1'}

    @app.get('/health/ready', tags=['Estado'])
    def ready():
        try:
            with Session(engine) as session:
                session.exec(text('SELECT 1 FROM users LIMIT 1'))
                if settings.clinical_connector_enabled:
                    session.exec(text('SELECT 1 FROM attentions LIMIT 1'))
                    session.exec(text('SELECT 1 FROM appointments LIMIT 1'))
            app.state.storage.ready()
        except Exception:
            raise HTTPException(503, 'Base de datos o almacenamiento no disponible') from None
        return {'status': 'ready'}

    @app.get('/api/v1/agent/capabilities', tags=['Agente'])
    def capabilities(user: User = Depends(current_user), session: Session = Depends(get_session)):
        owner = session.get(User, settings.esp_agent_owner_id) if settings.esp_agent_owner_id else None
        return {'role': user.role, 'planned_capabilities': CAPABILITIES[user.role],
                'inference_enabled': False,
                'clinical_connector_enabled': settings.clinical_connector_enabled,
                'esp_workflow_configured':bool(settings.esp_agent_key_hash and owner and
                                               owner.active and owner.role == 'ADMIN'),
                'proposed_model': settings.ai_model}

    return app
