from datetime import timedelta
import jwt
import pytest
from sqlmodel import Session, select
from sqlalchemy.exc import IntegrityError
from conftest import PASSWORD, auth, png
from core.security import digest, verify_password, hash_password
from models.user_model import User, TokenSession, AuditEvent, now


def test_hash_is_argon2id_and_salted():
    first, second = hash_password(PASSWORD), hash_password(PASSWORD)
    assert first.startswith('$argon2id$') and first != second
    assert verify_password(PASSWORD, first)
    assert not verify_password('incorrecta', first)
    parts = first.split('$')
    params = dict(part.split('=') for part in parts[3].split(','))
    parts[3] = f"m={params['m']},p={params['p']},t={params['t']}"
    node_format = '$'.join(parts)
    assert verify_password(PASSWORD, node_format)
    assert not verify_password('incorrecta', node_format)


def test_user_model_constraints(context):
    _, engine, _ = context
    with Session(engine) as session:
        session.add(User(email='invalid@example.com', name='Invalid', role='DENTIST',password_hash='x'))
        with pytest.raises(IntegrityError):
            session.commit()


def test_login_profile_and_digest_only(context):
    client, engine, _ = context
    headers = auth(client)
    response = client.get('/api/v1/users/me', headers=headers)
    assert response.status_code == 200
    assert response.json()['role'] == 'ADMIN'
    assert 'password' not in response.text and 'profile_object_key' not in response.text
    with Session(engine) as session:
        records = session.exec(select(TokenSession)).all()
        assert records[0].token_hash == digest(headers['Authorization'][7:])
    assert response.headers['cache-control'] == 'no-store'


@pytest.mark.parametrize('path',['/api/v1/users/me','/api/v1/users','/api/v1/agent/capabilities','/api/v1/users/me/profile-pic'])
def test_anonymous_denied(context, path):
    client,_,_ = context
    assert client.get(path).status_code == 401


@pytest.mark.parametrize('role',['RECEPTION','DENTIST','SUPPORT'])
def test_roles_cannot_manage_accounts(context, role):
    client,_,_ = context
    headers = auth(client,role)
    assert client.get('/api/v1/users', headers=headers).status_code == 403
    data={'name':'Otro usuario','email':'other@example.com','password':PASSWORD}
    assert client.post('/api/v1/users',json=data,headers=headers).status_code == 403
    assert client.patch('/api/v1/users/ADMIN/status',json={'active':False},headers=headers).status_code == 403
    capabilities=client.get('/api/v1/agent/capabilities',headers=headers).json()
    assert capabilities['role'] == role
    assert capabilities['inference_enabled'] is False


def test_admin_create_duplicate_and_validation(context):
    client,_,_ = context
    headers=auth(client)
    data={'name':'Nueva recepción','email':'new@example.com','password':PASSWORD,'role':'RECEPTION'}
    created=client.post('/api/v1/users',json=data,headers=headers)
    assert created.status_code == 201, created.text
    assert 'password_hash' not in created.text
    assert client.post('/api/v1/users',json=data,headers=headers).status_code == 409
    assert client.post('/api/v1/users',json={**data,'role':'DENTIST'},headers=headers).status_code == 422
    assert client.post('/api/v1/users',json={**data,'password':'short'},headers=headers).status_code == 422
    assert client.post('/api/v1/users',json={**data,'active':True},headers=headers).status_code == 422
    assert client.get('/api/v1/users?limit=100000',headers=headers).status_code == 422


def test_password_spaces_preserved(context):
    client,_,_=context
    headers=auth(client)
    password='  espacios-con-intencion  '
    assert client.post('/api/v1/users',headers=headers,json={'name':'Espacios','email':'spaces@example.com','password':password}).status_code == 201
    assert client.post('/api/v1/users/token',data={'username':'spaces@example.com','password':password}).status_code == 200
    assert client.post('/api/v1/users/token',data={'username':'spaces@example.com','password':password.strip()}).status_code == 401


def test_login_throttle_persists(context):
    client,_,_=context
    for _ in range(5):
        assert client.post('/api/v1/users/token',data={'username':'admin@example.com','password':'incorrecta'}).status_code == 401
    assert client.post('/api/v1/users/token',data={'username':'admin@example.com','password':PASSWORD}).status_code == 429


def test_logout_revokes(context):
    client,_,_=context
    headers=auth(client)
    assert client.post('/api/v1/users/logout',headers=headers).status_code == 204
    assert client.get('/api/v1/users/me',headers=headers).status_code == 401


def test_disable_revokes_all_sessions_and_cannot_disable_self(context):
    client,_,_=context
    admin=auth(client)
    reception=auth(client,'RECEPTION')
    assert client.patch('/api/v1/users/ADMIN/status',json={'active':False},headers=admin).status_code == 409
    assert client.patch('/api/v1/users/RECEPTION/status',json={'active':False},headers=admin).status_code == 200
    assert client.get('/api/v1/users/me',headers=reception).status_code == 401
    assert client.post('/api/v1/users/token',data={'username':'reception@example.com','password':PASSWORD}).status_code == 401


def test_password_change_revokes_every_session(context):
    client,_,_=context
    first=auth(client)
    second=auth(client)
    data={'current_password':PASSWORD,'new_password':'Nueva-contraseña-segura-123!'}
    assert client.post('/api/v1/users/me/password',json=data,headers=first).status_code == 204
    for headers in [first,second]:
        assert client.get('/api/v1/users/me',headers=headers).status_code == 401


@pytest.mark.parametrize('change',['expired','audience','issuer','signature','missing'])
def test_invalid_tokens(context, change):
    client,_,_=context
    token=auth(client)['Authorization'][7:]
    claims=jwt.decode(token,options={'verify_signature':False})
    key='x'*48
    if change=='expired': claims['exp']=now()-timedelta(minutes=1)
    if change=='audience': claims['aud']='another-api'
    if change=='issuer': claims['iss']='another-issuer'
    if change=='signature': key='other-key'*8
    if change=='missing': del claims['jti']
    bad=jwt.encode(claims,key,algorithm='HS256')
    from core.security import decode_access_token
    with pytest.raises(jwt.PyJWTError):
        decode_access_token(bad,client.app.state.settings)
    assert client.get('/api/v1/users/me',headers={'Authorization':f'Bearer {bad}'}).status_code == 401


def test_unregistered_but_valid_signature_denied(context):
    client,_,_=context
    from core.security import create_access_token
    token,_=create_access_token('ADMIN',client.app.state.settings)
    assert client.get('/api/v1/users/me',headers={'Authorization':f'Bearer {token}'}).status_code == 401


def test_private_profile_upload_retrieval_and_replacement(context):
    client,_,storage=context
    admin=auth(client)
    reception=auth(client,'RECEPTION')
    assert client.put('/api/v1/users/me/profile-pic',headers=admin,files={'file':('../../evil.html',png(),'text/html')}).status_code == 204
    content=client.get('/api/v1/users/me/profile-pic',headers=admin)
    assert content.status_code == 200 and content.headers['content-type']=='image/jpeg'
    assert content.content[:2]==b'\xff\xd8'
    assert all('evil' not in key for key in storage.objects)
    assert client.get('/api/v1/users/me/profile-pic',headers=reception).status_code == 404
    assert client.put('/api/v1/users/me/profile-pic',headers=admin,files={'file':('new.png',png(),'image/png')}).status_code == 204
    assert len(storage.objects)==1


@pytest.mark.parametrize('data,status',[(b'<script>fake image</script>',400),(b'x'*(2*1024*1024+1),413),(b'',413)], ids=['fake-image','oversized','empty'])
def test_invalid_uploads(context,data,status):
    client,_,_=context
    assert client.put('/api/v1/users/me/profile-pic',headers=auth(client),files={'file':('fake.jpg',data,'image/jpeg')}).status_code == status


def test_storage_failure_does_not_publish_profile(context):
    from botocore.exceptions import EndpointConnectionError
    client,_,storage=context
    def fail(*args): raise EndpointConnectionError(endpoint_url='http://private-host')
    storage.put=fail
    headers=auth(client)
    response=client.put('/api/v1/users/me/profile-pic',headers=headers,files={'file':('image.png',png(),'image/png')})
    assert response.status_code==503 and 'private-host' not in response.text
    assert client.get('/api/v1/users/me/profile-pic',headers=headers).status_code==404


def test_security_origin_and_health(context):
    client,_,_=context
    assert client.post('/api/v1/users/token',headers={'Origin':'https://untrusted.example'},data={'username':'admin@example.com','password':PASSWORD}).status_code == 403
    assert client.get('/health/live').status_code==200
    assert client.get('/health/ready').status_code==200


def test_audit_has_actions_not_passwords(context):
    client,engine,_=context
    headers=auth(client)
    client.post('/api/v1/users/logout',headers=headers)
    with Session(engine) as session:
        events=session.exec(select(AuditEvent)).all()
        assert {e.action for e in events}=={'session.login','session.logout'}
        assert all(PASSWORD not in str(e.model_dump()) for e in events)


def test_total_body_limit(context):
    client,_,_=context
    response=client.post('/api/v1/users/token',content=b'x'*(3*1024*1024+1))
    assert response.status_code==413


def test_same_origin_login(context):
    client,_,_=context
    response=client.post('/api/v1/users/token',headers={'Origin':'http://testserver'},
        data={'username':'admin@example.com','password':PASSWORD})
    assert response.status_code==200
