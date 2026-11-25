from typing import Literal
from uuid import UUID
from pydantic import Field, field_validator
from schemas.user_schema import ProfileImage, StrictModel, UserCreate
from core.esp import validate_image_path


class AgentUserCreate(UserCreate):
    request_id: UUID = Field(description='UUID nuevo por alta; conservarlo al reintentar')
    role: Literal['RECEPTION','DENTIST','SUPPORT'] = 'RECEPTION'


class EspProfileUpload(StrictModel):
    request_id: UUID = Field(description='UUID nuevo por foto; conservarlo al reintentar')
    image_path: str = Field(min_length=1,max_length=512,
        description='Ruta real del adjunto en el ESP, por ejemplo /fatfs/inbox/foto.jpg')

    @field_validator('image_path')
    @classmethod
    def safe_path(cls,path):
        return validate_image_path(path)


class AgentPatientCreate(StrictModel):
    request_id: UUID = Field(description='UUID nuevo por alta; conservarlo al reintentar')
    name: str = Field(min_length=2, max_length=120, description='Nombre del paciente')
    reference: str | None = Field(default=None, min_length=2, max_length=64,
                                 description='Folio existente; si se omite, DentalRisk genera uno')
    confirm_distinct_name: bool = Field(default=False,
        description='Confirma que una coincidencia exacta de nombre es otra persona')

    @field_validator('name', 'reference', mode='before')
    @classmethod
    def trim_text(cls, value):
        return value.strip() if value is not None else value


class AgentPatientResponse(StrictModel):
    id: str
    name: str
    reference: str
    active: bool
    profile_pic: ProfileImage | None = None
