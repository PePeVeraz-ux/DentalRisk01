"""Bounded, role-scoped reads of the shared DentalRisk database."""
from datetime import datetime
from typing import Literal
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import text
from sqlmodel import Session
from api.v1.dependencies import current_user
from db.database import get_session
from models.user_model import User

router = APIRouter(prefix='/clinical', tags=['Registros clínicos'])


def performance_for(session: Session, start_at: datetime | None = None,
                    end_at: datetime | None = None):
    """Aggregate completed service value without exposing patient identities."""
    conditions = ["a.status = 'COMPLETED'", 'a.ended_at IS NOT NULL']
    values = {}
    if start_at is not None:
        conditions.append('a.ended_at >= :start_at')
        values['start_at'] = start_at
    if end_at is not None:
        conditions.append('a.ended_at < :end_at')
        values['end_at'] = end_at
    attention_filters = ' AND '.join(conditions)
    rows = session.execute(text('''
        SELECT d.id AS dentist_id, d.name AS dentist,
               count(a.id) AS attentions,
               count(DISTINCT a.patient_id) AS patients,
               coalesce(sum(a.price_cents), 0) AS revenue_cents,
               coalesce(avg(extract(epoch FROM (a.ended_at - a.started_at)) / 60.0), 0) AS average_minutes
        FROM dentists d LEFT JOIN attentions a
          ON a.dentist_id = d.id AND ''' + attention_filters + '''
        GROUP BY d.id, d.name
        ORDER BY revenue_cents DESC, attentions DESC, d.name
    '''), values).mappings().all()
    dentists = [{
        'dentist_id': row['dentist_id'],
        'dentist': row['dentist'],
        'attentions': int(row['attentions']),
        'patients': int(row['patients']),
        'revenue_cents': int(row['revenue_cents']),
        'average_minutes': round(float(row['average_minutes']), 1),
    } for row in rows]
    patient_total = session.execute(text(
        'SELECT count(DISTINCT patient_id) FROM attentions a WHERE ' + attention_filters
    ), values).scalar_one()
    return {
        'scope': 'clinic',
        'period': {'start_at': start_at.isoformat() if start_at else None,
                   'end_at': end_at.isoformat() if end_at else None,
                   'timezone': 'included in timestamp offsets; end_at is exclusive'},
        'completed_attentions': sum(row['attentions'] for row in dentists),
        'patients': int(patient_total),
        'revenue_cents': sum(row['revenue_cents'] for row in dentists),
        'revenue_basis': 'completed service value, not collected payments',
        'dentists': dentists,
    }


def access(request: Request, user: User = Depends(current_user)):
    if not request.app.state.settings.clinical_connector_enabled:
        raise HTTPException(503, 'La conexión clínica no está habilitada')
    if user.role == 'SUPPORT':
        raise HTTPException(403, 'Soporte no puede consultar registros clínicos')
    return user


@router.get('/records')
def records(kind: Literal['attentions', 'appointments'], offset: int = 0, limit: int = 50,
            user: User = Depends(access), session: Session = Depends(get_session)):
    return records_for(user, session, kind, offset, limit)


def records_for(user: User, session: Session, kind: str, offset: int, limit: int):
    if offset < 0 or limit < 1 or limit > 100:
        raise HTTPException(422, 'Paginación inválida')
    # Names and identifiers of patients are intentionally absent from agent output.
    if kind == 'attentions':
        query = '''SELECT a.id, a.dentist_id, d.name AS dentist, s.name AS service,
                   a.status, a.started_at, a.ended_at, a.created_at
                   FROM attentions a JOIN dentists d ON d.id=a.dentist_id
                   JOIN services s ON s.id=a.service_id'''
        order = 'a.created_at DESC, a.id DESC'
    else:
        query = '''SELECT a.id, a.dentist_id, d.name AS dentist, s.name AS service,
                   a.status, a.starts_at, a.ends_at
                   FROM appointments a JOIN dentists d ON d.id=a.dentist_id
                   JOIN services s ON s.id=a.service_id'''
        order = 'a.starts_at DESC, a.id DESC'
    where = ' WHERE a.dentist_id=:dentist_id' if user.role == 'DENTIST' else ''
    values = {'offset': offset, 'limit': limit}
    if user.role == 'DENTIST':
        values['dentist_id'] = user.dentist_id
    rows = session.execute(text(query + where + f' ORDER BY {order} LIMIT :limit OFFSET :offset'),
                           values).mappings().all()
    return {'items': [dict(row) for row in rows], 'limit': limit, 'offset': offset}


@router.get('/summary')
def summary(user: User = Depends(access), session: Session = Depends(get_session)):
    return summary_for(user, session)


def summary_for(user: User, session: Session):
    where = ' WHERE dentist_id=:dentist_id' if user.role == 'DENTIST' else ''
    values = {'dentist_id': user.dentist_id} if user.role == 'DENTIST' else {}
    rows = session.execute(text('SELECT status, count(*) AS total FROM attentions' + where +
                                ' GROUP BY status ORDER BY status'), values).mappings().all()
    return {'scope': 'own' if user.role == 'DENTIST' else 'clinic',
            'attentions_by_status': [dict(row) for row in rows]}
