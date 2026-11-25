from datetime import datetime
from pydantic import BaseModel, ConfigDict, EmailStr, Field, model_validator
from models.user_model import Role


class StrictModel(BaseModel):
    model_config = ConfigDict(extra='forbid')


class UserCreate(StrictModel):
    name: str = Field(min_length=2, max_length=120)
    email: EmailStr
    # Do not trim passwords: spaces may be intentional.
    password: str = Field(min_length=12, max_length=128)
    role: Role = 'RECEPTION'
    dentist_id: str | None = Field(default=None, min_length=1, max_length=64)

    @model_validator(mode='after')
    def dentist_role(self):
        if self.role == 'DENTIST' and not self.dentist_id:
            raise ValueError('El dentista requiere dentist_id')
        return self


class ProfileImage(BaseModel):
    url: str = Field(description='Ruta de la API para recuperar la foto; requiere autenticación')
    content_type: str = 'image/jpeg'
    requires_auth: bool = True


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    name: str
    email: str
    role: Role
    dentist_id: str | None
    active: bool
    created_at: datetime
    profile_pic: ProfileImage | None = None


class UserStatus(StrictModel):
    active: bool


class PasswordChange(StrictModel):
    current_password: str = Field(min_length=1, max_length=128)
    new_password: str = Field(min_length=12, max_length=128)
