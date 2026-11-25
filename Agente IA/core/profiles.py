from fastapi import HTTPException, Response
from botocore.exceptions import BotoCoreError, ClientError
from sqlalchemy.exc import SQLAlchemyError
from sqlmodel import select
from core.storage import clean_image
from models.user_model import AuditEvent, User


def save_profile(request, session, actor, user, data):
    content=clean_image(data)
    # Serialize replacements to avoid losing the reference of a simultaneous upload.
    user=session.exec(select(User).where(User.id==user.id).with_for_update()
        .execution_options(populate_existing=True)).one()
    storage=request.app.state.storage
    try:
        key=storage.put(user.id,content)
    except (BotoCoreError,ClientError):
        raise HTTPException(503,'Almacenamiento no disponible') from None
    old=user.profile_object_key
    user.profile_object_key=key
    session.add(user)
    session.add(AuditEvent(actor_id=actor.id,action='user.profile_changed',entity_id=user.id))
    try:
        session.commit()
    except SQLAlchemyError:
        session.rollback()
        try:
            storage.delete(key)
        except (BotoCoreError,ClientError):
            request.app.state.logger.warning('profile.orphan_cleanup_pending')
        raise HTTPException(503,'No se pudo guardar el perfil') from None
    if old:
        try:
            storage.delete(old)
        except (BotoCoreError,ClientError):
            request.app.state.logger.warning('profile.orphan_cleanup_pending')
    session.refresh(user)
    return user


def profile_response(request,user):
    if not user.profile_object_key:
        raise HTTPException(404,'Sin imagen de perfil')
    try:
        content=request.app.state.storage.get(user.profile_object_key)
    except (BotoCoreError,ClientError):
        raise HTTPException(503,'Almacenamiento no disponible') from None
    return Response(content,media_type='image/jpeg',headers={
        'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'})
