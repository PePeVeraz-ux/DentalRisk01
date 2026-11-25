from datetime import timedelta
import hmac
from hashlib import sha256
from fastapi import APIRouter, Depends, File, HTTPException, Request, Response, UploadFile
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import delete
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlmodel import Session, select
from botocore.exceptions import BotoCoreError, ClientError
from api.v1.dependencies import administrator, current_user, oauth2, require_active_dentist
from core.security import DUMMY_HASH, create_access_token, digest, hash_password, utc, verify_password
from core.storage import MAX_IMAGE_BYTES, clean_image
from db.database import get_session
from models.user_model import AuditEvent, LoginAttempt, TokenSession, User, now
from schemas.user_schema import PasswordChange, UserCreate, UserResponse, UserStatus
from schemas.token_schema import Token
from core.profiles import save_profile, profile_response

router = APIRouter(prefix='/users', tags=['Usuarios y seguridad'])


@router.post('/token', response_model=Token)
def login(request: Request, response: Response, form: OAuth2PasswordRequestForm = Depends(), session: Session = Depends(get_session)):
    settings = request.app.state.settings
    key = hmac.new(settings.secret_key.encode(), form.username.lower().strip().encode(), sha256).hexdigest()
    # A row per account key is locked on PostgreSQL, serializing concurrent attempts.
    attempt = session.exec(select(LoginAttempt).where(LoginAttempt.key == key).with_for_update()).first()
    if attempt is None:
        attempt = LoginAttempt(key=key)
        session.add(attempt)
        try:
            session.commit()
        except IntegrityError:
            session.rollback()
        attempt = session.exec(select(LoginAttempt).where(LoginAttempt.key == key).with_for_update()).one()
    if attempt.blocked_until and utc(attempt.blocked_until) > now():
        raise HTTPException(429, 'Demasiados intentos. Intenta después de 15 minutos', headers={'Retry-After': '900'})
    if attempt.blocked_until:
        attempt.failures = 0
        attempt.blocked_until = None
    user = session.exec(select(User).where(User.email == form.username.lower().strip())).first()
    valid = verify_password(form.password, user.password_hash if user else DUMMY_HASH)
    if not user or not valid or not user.active:
        attempt.failures += 1
        if attempt.failures >= 5:
            attempt.blocked_until = now() + timedelta(minutes=15)
        session.add(attempt)
        session.commit()
        raise HTTPException(401, 'Credenciales inválidas', headers={'WWW-Authenticate': 'Bearer'})
    attempt.failures = 0
    attempt.blocked_until = None
    token, expires = create_access_token(user.id, settings)
    session.add(attempt)
    session.add(TokenSession(token_hash=digest(token), user_id=user.id, expires_at=expires))
    session.add(AuditEvent(actor_id=user.id, action='session.login'))
    session.commit()
    response.headers['Cache-Control'] = 'no-store'
    return Token(access_token=token, expires_in=settings.token_minutes * 60)


@router.post('/logout', status_code=204)
def logout(token: str = Depends(oauth2), user: User = Depends(current_user), session: Session = Depends(get_session)):
    session.exec(delete(TokenSession).where(TokenSession.token_hash == digest(token)))
    session.add(AuditEvent(actor_id=user.id, action='session.logout'))
    session.commit()


@router.get('/me', response_model=UserResponse)
def me(user: User = Depends(current_user)):
    return user


@router.post('/me/password', status_code=204)
def password(data: PasswordChange, user: User = Depends(current_user), session: Session = Depends(get_session)):
    if not verify_password(data.current_password, user.password_hash):
        raise HTTPException(401, 'Contraseña actual inválida')
    user.password_hash = hash_password(data.new_password)
    session.add(user)
    session.exec(delete(TokenSession).where(TokenSession.user_id == user.id))
    session.add(AuditEvent(actor_id=user.id, action='user.password_changed', entity_id=user.id))
    session.commit()


@router.post('', response_model=UserResponse, status_code=201)
def create_user(data: UserCreate, request: Request, actor: User = Depends(administrator),
                session: Session = Depends(get_session)):
    if data.role == 'ADMIN' and request.app.state.settings.clinical_connector_enabled:
        raise HTTPException(403, 'Cree administradores desde DentalRisk')
    if data.role == 'DENTIST' and request.app.state.settings.clinical_connector_enabled:
        require_active_dentist(session, data.dentist_id)
    user = User(name=data.name, email=str(data.email).lower(), role=data.role,
                dentist_id=data.dentist_id, password_hash=hash_password(data.password))
    session.add(user)
    session.add(AuditEvent(actor_id=actor.id, action='user.created', entity_id=user.id))
    try:
        session.commit()
    except IntegrityError:
        session.rollback()
        raise HTTPException(409, 'El correo ya está registrado') from None
    session.refresh(user)
    return user


@router.get('', response_model=list[UserResponse])
def users(offset: int = 0, limit: int = 25, actor: User = Depends(administrator), session: Session = Depends(get_session)):
    if offset < 0 or limit < 1 or limit > 100:
        raise HTTPException(422, 'Paginación inválida')
    return session.exec(select(User).order_by(User.created_at, User.id).offset(offset).limit(limit)).all()


@router.patch('/{user_id}/status', response_model=UserResponse)
def status(user_id: str, data: UserStatus, request: Request,
           actor: User = Depends(administrator), session: Session = Depends(get_session)):
    if user_id == actor.id:
        raise HTTPException(409, 'No puedes modificar tu propio estado')
    # Serialize admin state changes; refresh cached actors after waiting for locks.
    session.exec(select(User).where(User.role == 'ADMIN').order_by(User.id)
                 .with_for_update().execution_options(populate_existing=True)).all()
    if not actor.active:
        raise HTTPException(403, 'La cuenta administradora ya no está activa')
    user = session.get(User, user_id)
    if not user:
        raise HTTPException(404, 'Usuario no encontrado')
    if user.role == 'ADMIN' and request.app.state.settings.clinical_connector_enabled:
        raise HTTPException(403, 'Administre dueños desde DentalRisk')
    user.active = data.active
    session.add(user)
    session.exec(delete(TokenSession).where(TokenSession.user_id == user.id))
    session.add(AuditEvent(actor_id=actor.id, action='user.status_changed', entity_id=user.id))
    session.commit()
    session.refresh(user)
    return user


@router.put('/me/profile-pic', status_code=204)
def profile(request: Request, file: UploadFile = File(...), user: User = Depends(current_user), session: Session = Depends(get_session)):
    data = file.file.read(MAX_IMAGE_BYTES + 1)
    save_profile(request,session,user,user,data)


@router.get('/me/profile-pic')
def read_profile(request: Request, user: User = Depends(current_user)):
    return profile_response(request,user)


@router.get('/{user_id}',response_model=UserResponse)
def get_user(user_id: str, actor: User=Depends(current_user), session: Session=Depends(get_session)):
    if actor.role!='ADMIN' and actor.id!=user_id:
        raise HTTPException(403,'No puedes consultar a este usuario')
    target=session.get(User,user_id)
    if not target:
        raise HTTPException(404,'Usuario no encontrado')
    return target


@router.put('/{user_id}/profile-pic',response_model=UserResponse)
def assign_profile(user_id: str, request: Request, file: UploadFile=File(...),
                   actor: User=Depends(administrator), session: Session=Depends(get_session)):
    target=session.get(User,user_id)
    if not target:
        raise HTTPException(404,'Usuario no encontrado')
    return save_profile(request,session,actor,target,file.file.read(MAX_IMAGE_BYTES+1))


@router.get('/{user_id}/profile-pic')
def get_profile(user_id: str, request: Request, actor: User=Depends(current_user),
                session: Session=Depends(get_session)):
    if actor.role!='ADMIN' and actor.id!=user_id:
        raise HTTPException(403,'No puedes consultar esta imagen')
    target=session.get(User,user_id)
    if not target:
        raise HTTPException(404,'Usuario no encontrado')
    return profile_response(request,target)
