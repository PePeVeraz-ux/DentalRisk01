"""Optional initial LOCAL demonstration owner; never replaces existing accounts."""
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import argparse
import json
from secrets import token_urlsafe
from sqlalchemy.engine import URL
from sqlmodel import Session,select
from dotenv import dotenv_values
from core.config import Settings
from core.security import hash_password
from core.esp import validate_base_url
from db.database import make_engine
from models.user_model import User,AuditEvent
from scripts.configure_esp import write_connection

parser=argparse.ArgumentParser()
parser.add_argument('--esp-url',required=True)
parser.add_argument('--api-host',required=True)
parser.add_argument('--create-demo-owner',action='store_true')
args=parser.parse_args()
settings=Settings()
if settings.environment!='development': raise SystemExit('Solo se permite en desarrollo')
esp_url=validate_base_url(args.esp_url)
values=dotenv_values('.env')
url=URL.create('postgresql+psycopg',username='dentalrisk_agent',password=values['POSTGRES_PASSWORD'],
    host='127.0.0.1',port=5434,database='dentalrisk_agent').render_as_string(hide_password=False)
engine=make_engine(url)
credential_file=Path('.local/esp/demo-owner.json')
with Session(engine) as session:
    existing=session.exec(select(User).where(User.role=='ADMIN',User.active==True)).all()
    if existing:
        if not credential_file.exists():
            raise SystemExit('Ya existe un dueño. Usa configure_esp.py con su contraseña; no se reemplazó ninguna cuenta.')
        credentials=json.loads(credential_file.read_text())
        owner=session.get(User,credentials['id'])
        if not owner or not owner.active or owner.role!='ADMIN':
            raise SystemExit('La cuenta local de demostración no está activa')
    else:
        if not args.create_demo_owner: raise SystemExit('Falta el dueño; crea una cuenta o usa --create-demo-owner')
        password=token_urlsafe(36)
        owner=User(name='Administrador local de prueba ESP',email='esp-admin@example.com',role='ADMIN',
            password_hash=hash_password(password))
        session.add(owner)
        session.flush()
        session.add(AuditEvent(actor_id=owner.id,action='agent.demo_owner_bootstrap',entity_id=owner.id))
        session.commit()
        session.refresh(owner)
        credential_file.parent.mkdir(parents=True,exist_ok=True)
        credential_file.write_text(json.dumps({'id':owner.id,'email':owner.email,'password':password,
            'purpose':'Local demonstration only; not a real clinic identity'},indent=2),encoding='utf-8')
    owner_id=owner.id
engine.dispose()
write_connection(owner_id,esp_url,args.api_host)
print('Conexión del ESP preparada. Datos locales privados en .local/esp/. No se mostraron contraseñas ni claves.')
