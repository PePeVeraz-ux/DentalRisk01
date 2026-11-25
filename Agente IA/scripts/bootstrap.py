import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from getpass import getpass
from sqlmodel import Session, select
from core.config import Settings
from core.security import hash_password
from db.database import make_engine
from models.user_model import User, AuditEvent
from schemas.user_schema import UserCreate


def bootstrap(settings, email, name, password):
    data = UserCreate(email=email, name=name, password=password, role='ADMIN')
    engine = make_engine(settings.database_url)
    try:
        with Session(engine) as session:
            if session.exec(select(User).where(User.role == 'ADMIN', User.active == True)).first():
                raise ValueError('Ya existe un administrador activo; utiliza su sesión para crear cuentas')
            user = User(email=str(data.email).lower(), name=data.name, role='ADMIN', password_hash=hash_password(data.password))
            session.add(user)
            session.flush()
            session.add(AuditEvent(actor_id=user.id, action='user.bootstrap', entity_id=user.id))
            session.commit()
    finally:
        engine.dispose()


if __name__ == '__main__':
    email = input('Correo del dueño: ').strip()
    name = input('Nombre del dueño: ').strip()
    password = getpass('Contraseña nueva (12 a 128 caracteres): ')
    if password != getpass('Repite la contraseña: '):
        raise SystemExit('Las contraseñas no coinciden')
    bootstrap(Settings(), email, name, password)
    print('Cuenta inicial creada. Inicia sesión en /docs; no hay contraseña predeterminada.')
