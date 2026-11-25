from datetime import datetime, timezone
from uuid import uuid4
from typing import Literal
from sqlalchemy import CheckConstraint, Column, ForeignKey, Text
from sqlmodel import SQLModel, Field

Role = Literal['ADMIN', 'RECEPTION', 'DENTIST', 'SUPPORT']


def now():
    return datetime.now(timezone.utc)


class User(SQLModel, table=True):
    __tablename__ = 'users'
    __table_args__ = (
        CheckConstraint("role IN ('ADMIN','RECEPTION','DENTIST','SUPPORT')"),
        CheckConstraint("role <> 'DENTIST' OR dentist_id IS NOT NULL"),
    )
    id: str = Field(default_factory=lambda: str(uuid4()), sa_column=Column(Text, primary_key=True))
    name: str = Field(sa_column=Column(Text, nullable=False))
    email: str = Field(sa_column=Column(Text, unique=True, nullable=False))
    password_hash: str = Field(sa_column=Column(Text, nullable=False))
    role: str = Field(default='RECEPTION', sa_column=Column(Text, nullable=False))
    # External reference, not a duplicate dentist registry or an access grant.
    dentist_id: str | None = Field(default=None, sa_column=Column(Text))
    active: bool = True
    profile_object_key: str | None = Field(default=None, sa_column=Column(Text))
    created_at: datetime = Field(default_factory=now)

    @property
    def profile_pic(self):
        if self.profile_object_key is None:
            return None
        return {'url': f'/api/v1/users/{self.id}/profile-pic',
                'content_type': 'image/jpeg', 'requires_auth': True}


class TokenSession(SQLModel, table=True):
    __tablename__ = 'agent_sessions'
    token_hash: str = Field(primary_key=True)
    user_id: str = Field(foreign_key='users.id', index=True)
    expires_at: datetime


class LoginAttempt(SQLModel, table=True):
    __tablename__ = 'agent_login_attempts'
    key: str = Field(primary_key=True)
    failures: int = 0
    blocked_until: datetime | None = None


class AuditEvent(SQLModel, table=True):
    __tablename__ = 'agent_audit'
    id: str = Field(default_factory=lambda: str(uuid4()), primary_key=True)
    actor_id: str | None = Field(default=None, foreign_key='users.id')
    action: str = Field(max_length=64)
    entity_id: str | None = None
    created_at: datetime = Field(default_factory=now)


class AgentOperation(SQLModel, table=True):
    __tablename__ = 'agent_operations'
    id: str = Field(primary_key=True)
    owner_id: str = Field(foreign_key='users.id', index=True)
    user_id: str = Field(foreign_key='users.id', index=True)
    kind: str = Field(max_length=32)
    request_hash: str
    created_at: datetime = Field(default_factory=now)


class AgentPatient(SQLModel, table=True):
    """Patients created through the owner's ESP delegation and their private profile image."""
    __tablename__ = 'agent_patients'
    id: str = Field(sa_column=Column(Text, primary_key=True))
    owner_id: str = Field(sa_column=Column(Text, ForeignKey('users.id'), nullable=False, index=True))
    profile_object_key: str | None = Field(default=None, sa_column=Column(Text))
    created_at: datetime = Field(default_factory=now)


class AgentPatientOperation(SQLModel, table=True):
    __tablename__ = 'agent_patient_operations'
    id: str = Field(sa_column=Column(Text, primary_key=True))
    owner_id: str = Field(sa_column=Column(Text, ForeignKey('users.id'), nullable=False, index=True))
    patient_id: str = Field(sa_column=Column(Text, nullable=False, index=True))
    kind: str = Field(sa_column=Column(Text, nullable=False))
    request_hash: str = Field(sa_column=Column(Text, nullable=False))
    created_at: datetime = Field(default_factory=now)
