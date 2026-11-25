import jwt
from fastapi import Depends, HTTPException, Request
from fastapi.security import OAuth2PasswordBearer
from sqlmodel import Session
from sqlalchemy import text
from db.database import get_session
from core.security import decode_access_token, digest, utc
from models.user_model import User, TokenSession, now

oauth2 = OAuth2PasswordBearer(tokenUrl='/api/v1/users/token')


def current_user(request: Request, token: str = Depends(oauth2), session: Session = Depends(get_session)):
    error = HTTPException(401, 'Credenciales inválidas o sesión vencida', headers={'WWW-Authenticate': 'Bearer'})
    try:
        payload = decode_access_token(token, request.app.state.settings)
    except jwt.PyJWTError:
        raise error from None
    record = session.get(TokenSession, digest(token))
    if not record or record.user_id != payload['sub'] or utc(record.expires_at) <= now():
        raise error
    user = session.get(User, record.user_id)
    if not user or not user.active:
        raise error
    return user


def administrator(user: User = Depends(current_user)):
    if user.role != 'ADMIN':
        raise HTTPException(403, 'Se requiere el rol de administración')
    return user


def require_active_dentist(session: Session, dentist_id: str):
    row = session.execute(text('SELECT active FROM dentists WHERE id=:id'),
                          {'id': dentist_id}).mappings().first()
    if not row or not row['active']:
        raise HTTPException(422, 'El dentista no existe o está inactivo en DentalRisk')
