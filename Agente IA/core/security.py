from datetime import timedelta, timezone
from hashlib import sha256
from uuid import uuid4
import re
import jwt
from argon2 import PasswordHasher, Type
from argon2.exceptions import VerificationError, InvalidHashError
from models.user_model import now

password_hasher = PasswordHasher(time_cost=3, memory_cost=65536, parallelism=4, type=Type.ID)
DUMMY_HASH = password_hasher.hash('dummy-password-for-timing-only')


def hash_password(password):
    return password_hasher.hash(password)


def verify_password(password, password_hash):
    # Node argon2 emits m,p,t; libargon2's PHC parser expects m,t,p.
    # Reordering the encoded parameters does not alter the salt or digest.
    node_hash = re.fullmatch(
        r'(\$argon2(?:id|i)\$v=19\$)m=(\d+),p=(\d+),t=(\d+)(\$[^$]+\$[^$]+)',
        password_hash,
    )
    if node_hash:
        prefix, memory, parallelism, iterations, suffix = node_hash.groups()
        password_hash = f'{prefix}m={memory},t={iterations},p={parallelism}{suffix}'
    try:
        return password_hasher.verify(password_hash, password)
    except (VerificationError, InvalidHashError):
        return False


def digest(token):
    return sha256(token.encode()).hexdigest()


def utc(value):
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value


def create_access_token(user_id, settings):
    issued = now()
    expires = issued + timedelta(minutes=settings.token_minutes)
    payload = {'sub': user_id, 'iat': issued, 'exp': expires, 'jti': str(uuid4()),
               'iss': settings.jwt_issuer, 'aud': settings.jwt_audience}
    return jwt.encode(payload, settings.secret_key, algorithm='HS256'), expires


def decode_access_token(token, settings):
    return jwt.decode(token, settings.secret_key, algorithms=['HS256'],
                      issuer=settings.jwt_issuer, audience=settings.jwt_audience,
                      options={'require': ['sub', 'iat', 'exp', 'jti', 'iss', 'aud']})
