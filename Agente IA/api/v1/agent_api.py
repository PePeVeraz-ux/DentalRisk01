import hmac
import hashlib
import json
from datetime import datetime
from uuid import uuid4
from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from fastapi.security import APIKeyHeader
from botocore.exceptions import BotoCoreError, ClientError
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlmodel import Session, select
from core.security import hash_password
from core.profiles import save_profile
from core.storage import clean_image
from db.database import get_session
from models.user_model import User, AgentOperation, AgentPatient, AgentPatientOperation, AuditEvent
from schemas.agent_schema import AgentPatientCreate, AgentPatientResponse, AgentUserCreate, EspProfileUpload
from schemas.user_schema import UserResponse
from api.v1.clinical_api import records_for, summary_for, performance_for
from api.v1.dependencies import require_active_dentist
from typing import Literal

router=APIRouter(prefix='/agent',tags=['Agente ESP'])
key_header=APIKeyHeader(name='X-Agent-Key',auto_error=False)


def delegated_owner(request: Request, key: str|None=Depends(key_header),session: Session=Depends(get_session)):
    settings=request.app.state.settings
    if not settings.esp_agent_key_hash or not settings.esp_agent_owner_id:
        raise HTTPException(503,'La conexión del agente ESP no está configurada')
    if not key or not hmac.compare_digest(hashlib.sha256(key.encode()).hexdigest(),settings.esp_agent_key_hash):
        raise HTTPException(401,'Credencial del agente inválida')
    owner=session.exec(select(User).where(User.id==settings.esp_agent_owner_id)
        .with_for_update().execution_options(populate_existing=True)).first()
    if not owner or not owner.active or owner.role!='ADMIN':
        raise HTTPException(403,'La delegación del agente está revocada')
    return owner


def request_hash(request,data,target=''):
    encoded=json.dumps({'body':data.model_dump(mode='json'),'target':target},
                       sort_keys=True,separators=(',',':')).encode()
    return hmac.new(request.app.state.settings.secret_key.encode(),encoded,hashlib.sha256).hexdigest()


def previous_operation(session,operation_id,owner,kind,fingerprint):
    prior=session.get(AgentOperation,str(operation_id))
    if prior:
        if prior.owner_id!=owner.id or prior.kind!=kind or prior.request_hash!=fingerprint:
            raise HTTPException(409,'request_id ya se utilizó para otra operación')
        return session.get(User,prior.user_id)
    return None


def managed_user(session,owner,user_id):
    created=session.exec(select(AgentOperation).where(AgentOperation.owner_id==owner.id,
        AgentOperation.user_id==user_id,AgentOperation.kind=='user.create')).first()
    if not created:
        raise HTTPException(403,'El agente solo puede operar usuarios que creó con esta delegación')
    user=session.get(User,user_id)
    if not user or not user.active:
        raise HTTPException(409,'El usuario no está activo')
    return user


def managed_patient(session, owner, patient_id):
    row = session.execute(text('''SELECT p.id,p.name,p.reference,p.active,ap.profile_object_key
        FROM agent_patients ap JOIN patients p ON p.id=ap.id
        WHERE ap.id=:patient_id AND ap.owner_id=:owner_id'''),
        {'patient_id': patient_id, 'owner_id': owner.id}).mappings().first()
    if not row:
        raise HTTPException(404, 'Paciente no encontrado en esta delegación')
    return row


def patient_response(patient):
    profile = None
    if patient['profile_object_key']:
        profile = {'url': f"/api/v1/agent/patients/{patient['id']}/profile-pic",
                   'content_type': 'image/jpeg', 'requires_auth': True}
    return {'id': patient['id'], 'name': patient['name'], 'reference': patient['reference'],
            'active': patient['active'], 'profile_pic': profile}


def prior_patient_operation(session, request_id, owner, kind, fingerprint):
    prior = session.get(AgentPatientOperation, str(request_id))
    if prior and (prior.owner_id != owner.id or prior.kind != kind or
                  prior.request_hash != fingerprint):
        raise HTTPException(409, 'request_id ya se utilizó para otra operación')
    return prior


@router.get('/connection')
def connection(request: Request, owner: User=Depends(delegated_owner)):
    actions = ['create_user','upload_user_profile_from_esp','read_created_user']
    if request.app.state.settings.clinical_connector_enabled:
        actions += ['create_patient','upload_patient_profile_from_esp','read_created_patient',
                    'read_clinical_records','read_clinical_summary','read_clinical_performance']
    return {'connected':True,'service':'DentalRisk','actions':actions,
        'roles':['RECEPTION','DENTIST','SUPPORT'],'max_image_bytes':2*1024*1024,
        'clinic_timezone':request.app.state.settings.clinic_timezone}


@router.get('/clinical/records')
def delegated_records(request: Request, kind: Literal['attentions','appointments'],
                      offset: int = 0, limit: int = 50,
                      owner: User=Depends(delegated_owner), session: Session=Depends(get_session)):
    if not request.app.state.settings.clinical_connector_enabled:
        raise HTTPException(503,'La conexión clínica no está habilitada')
    return records_for(owner, session, kind, offset, limit)


@router.get('/clinical/summary')
def delegated_summary(request: Request, owner: User=Depends(delegated_owner),
                      session: Session=Depends(get_session)):
    if not request.app.state.settings.clinical_connector_enabled:
        raise HTTPException(503,'La conexión clínica no está habilitada')
    return summary_for(owner, session)


@router.get('/clinical/performance')
def delegated_performance(request: Request,
                           start_at: datetime | None = Query(default=None, description='Límite inferior ISO 8601 con zona; inclusivo'),
                           end_at: datetime | None = Query(default=None, description='Límite superior ISO 8601 con zona; exclusivo'),
                           owner: User=Depends(delegated_owner), session: Session=Depends(get_session)):
    if not request.app.state.settings.clinical_connector_enabled:
        raise HTTPException(503,'La conexión clínica no está habilitada')
    if start_at is not None and start_at.utcoffset() is None:
        raise HTTPException(422, 'start_at debe incluir zona horaria')
    if end_at is not None and end_at.utcoffset() is None:
        raise HTTPException(422, 'end_at debe incluir zona horaria')
    if start_at is not None and end_at is not None and start_at >= end_at:
        raise HTTPException(422, 'end_at debe ser posterior a start_at')
    return performance_for(session, start_at, end_at)


@router.post('/users',response_model=UserResponse,status_code=201)
def create_user(data: AgentUserCreate,request: Request,owner: User=Depends(delegated_owner),
                session: Session=Depends(get_session)):
    if data.role == 'DENTIST' and request.app.state.settings.clinical_connector_enabled:
        require_active_dentist(session, data.dentist_id)
    fingerprint=request_hash(request,data)
    prior=previous_operation(session,data.request_id,owner,'user.create',fingerprint)
    if prior: return prior
    user=User(name=data.name,email=str(data.email).lower(),role=data.role,dentist_id=data.dentist_id,
              password_hash=hash_password(data.password))
    try:
        session.add(user)
        session.flush()
        session.add(AgentOperation(id=str(data.request_id),owner_id=owner.id,user_id=user.id,
            kind='user.create',request_hash=fingerprint))
        session.add(AuditEvent(actor_id=owner.id,action='agent.user_created',entity_id=user.id))
        session.commit()
    except IntegrityError:
        session.rollback()
        raise HTTPException(409,'El correo o la operación ya existe; revisa los datos sin sustituir al usuario') from None
    session.refresh(user)
    return user


@router.get('/users/{user_id}',response_model=UserResponse)
def get_user(user_id: str,owner: User=Depends(delegated_owner),session: Session=Depends(get_session)):
    return managed_user(session,owner,user_id)


@router.post('/users/{user_id}/profile-pic',response_model=UserResponse)
def upload_profile(user_id: str,data: EspProfileUpload,request: Request,
                   owner: User=Depends(delegated_owner),session: Session=Depends(get_session)):
    target=managed_user(session,owner,user_id)
    fingerprint=request_hash(request,data,user_id)
    prior=previous_operation(session,data.request_id,owner,'user.profile',fingerprint)
    if prior: return prior
    image=request.app.state.esp_source.read(data.image_path)
    session.add(AgentOperation(id=str(data.request_id),owner_id=owner.id,user_id=target.id,
        kind='user.profile',request_hash=fingerprint))
    return save_profile(request,session,owner,target,image)


@router.post('/patients', response_model=AgentPatientResponse, status_code=201)
def create_patient(data: AgentPatientCreate, request: Request,
                   owner: User=Depends(delegated_owner), session: Session=Depends(get_session)):
    if not request.app.state.settings.clinical_connector_enabled:
        raise HTTPException(503, 'La conexión clínica no está habilitada')
    fingerprint = request_hash(request, data)
    prior = prior_patient_operation(session, data.request_id, owner, 'patient.create', fingerprint)
    if prior:
        return patient_response(managed_patient(session, owner, prior.patient_id))
    matching_name = session.execute(text(
        'SELECT 1 FROM patients WHERE lower(btrim(name))=lower(:name) LIMIT 1'),
        {'name': data.name}).first()
    if matching_name and not data.confirm_distinct_name:
        raise HTTPException(409, 'Hay una coincidencia de nombre. Comprueba los pacientes en Recepción; si es otra persona, confirma y vuelve a intentar con un request_id nuevo.')
    patient_id = str(uuid4())
    reference = data.reference or ('P-' + uuid4().hex[:10].upper())
    try:
        session.execute(text('INSERT INTO patients(id,name,reference) VALUES(:id,:name,:reference)'),
                        {'id': patient_id, 'name': data.name, 'reference': reference})
        session.add(AgentPatient(id=patient_id, owner_id=owner.id))
        session.add(AgentPatientOperation(id=str(data.request_id), owner_id=owner.id,
            patient_id=patient_id, kind='patient.create', request_hash=fingerprint))
        session.add(AuditEvent(actor_id=owner.id, action='agent.patient_created', entity_id=patient_id))
        session.commit()
    except IntegrityError:
        session.rollback()
        raise HTTPException(409, 'El folio o la operación ya existe; revisa los datos antes de reintentar') from None
    return patient_response(managed_patient(session, owner, patient_id))


@router.get('/patients/{patient_id}', response_model=AgentPatientResponse)
def get_patient(patient_id: str, owner: User=Depends(delegated_owner),
                session: Session=Depends(get_session)):
    return patient_response(managed_patient(session, owner, patient_id))


@router.post('/patients/{patient_id}/profile-pic', response_model=AgentPatientResponse)
def upload_patient_profile(patient_id: str, data: EspProfileUpload, request: Request,
                           owner: User=Depends(delegated_owner), session: Session=Depends(get_session)):
    if not request.app.state.settings.clinical_connector_enabled:
        raise HTTPException(503, 'La conexión clínica no está habilitada')
    managed_patient(session, owner, patient_id)
    fingerprint = request_hash(request, data, patient_id)
    prior = prior_patient_operation(session, data.request_id, owner, 'patient.profile', fingerprint)
    if prior:
        return patient_response(managed_patient(session, owner, patient_id))
    image = clean_image(request.app.state.esp_source.read(data.image_path))
    target = session.exec(select(AgentPatient).where(AgentPatient.id == patient_id,
        AgentPatient.owner_id == owner.id).with_for_update()
        .execution_options(populate_existing=True)).first()
    if not target:
        raise HTTPException(404, 'Paciente no encontrado en esta delegación')
    try:
        key = request.app.state.storage.put(patient_id, image, namespace='patients')
    except (BotoCoreError, ClientError):
        raise HTTPException(503, 'Almacenamiento no disponible') from None
    old_key = target.profile_object_key
    target.profile_object_key = key
    session.add(target)
    session.add(AgentPatientOperation(id=str(data.request_id), owner_id=owner.id,
        patient_id=patient_id, kind='patient.profile', request_hash=fingerprint))
    session.add(AuditEvent(actor_id=owner.id, action='agent.patient_profile_uploaded', entity_id=patient_id))
    try:
        session.commit()
    except SQLAlchemyError:
        session.rollback()
        try:
            request.app.state.storage.delete(key)
        except (BotoCoreError, ClientError):
            request.app.state.logger.warning('profile.orphan_cleanup_pending')
        raise HTTPException(503, 'No se pudo guardar el perfil del paciente') from None
    if old_key:
        try:
            request.app.state.storage.delete(old_key)
        except (BotoCoreError, ClientError):
            request.app.state.logger.warning('profile.orphan_cleanup_pending')
    return patient_response(managed_patient(session, owner, patient_id))


@router.get('/patients/{patient_id}/profile-pic')
def get_patient_profile(patient_id: str, request: Request,
                        owner: User=Depends(delegated_owner), session: Session=Depends(get_session)):
    patient = managed_patient(session, owner, patient_id)
    if not patient['profile_object_key']:
        raise HTTPException(404, 'Sin foto de perfil')
    try:
        content = request.app.state.storage.get(patient['profile_object_key'])
    except (BotoCoreError, ClientError):
        raise HTTPException(503, 'Almacenamiento no disponible') from None
    return Response(content, media_type='image/jpeg', headers={
        'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff'})
