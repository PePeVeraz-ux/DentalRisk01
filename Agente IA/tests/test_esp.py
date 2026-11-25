from hashlib import sha256
from uuid import uuid4
import pytest
import httpx
from fastapi import HTTPException
from sqlmodel import Session, select
from conftest import PASSWORD, auth, png
from models.user_model import User, AgentOperation
from core.esp import EspAttachmentSource, validate_base_url

DEVICE_KEY='test-device-key-not-a-production-credential'


class AttachmentSource:
    def __init__(self): self.calls=[]
    def read(self,path):
        self.calls.append(path)
        return png()


def enable(client):
    client.app.state.settings.esp_agent_key_hash=sha256(DEVICE_KEY.encode()).hexdigest()
    client.app.state.settings.esp_agent_owner_id='ADMIN'
    client.app.state.esp_source=AttachmentSource()
    return {'X-Agent-Key':DEVICE_KEY}


def data(**changes):
    return {'request_id':str(uuid4()),'name':'Usuario del agente','email':'esp@example.com',
            'password':PASSWORD,'role':'RECEPTION',**changes}


def test_connection_configuration_and_credentials(context):
    client,_,_=context
    assert client.get('/api/v1/agent/connection').status_code==503
    headers=enable(client)
    assert client.get('/api/v1/agent/connection').status_code==401
    assert client.get('/api/v1/agent/connection',headers={'X-Agent-Key':'incorrect'}).status_code==401
    assert client.get('/api/v1/agent/connection',headers=headers).json()['connected'] is True


def test_agent_creates_and_uploads_photo_without_new_user_login(context):
    client,engine,storage=context
    headers=enable(client)
    created=client.post('/api/v1/agent/users',json=data(),headers=headers)
    assert created.status_code==201,created.text
    user=created.json()
    assert user['profile_pic'] is None and 'password' not in str(user)
    upload=client.post('/api/v1/agent/users/'+user['id']+'/profile-pic',headers=headers,
        json={'request_id':str(uuid4()),'image_path':'/fatfs/inbox/real-adjunto.png'})
    assert upload.status_code==200,upload.text
    photo=upload.json()['profile_pic']
    assert photo=={'url':f"/api/v1/users/{user['id']}/profile-pic",'content_type':'image/jpeg','requires_auth':True}
    with Session(engine) as session:
        stored=session.get(User,user['id'])
        assert stored.profile_object_key in storage.objects
    own_login=client.post('/api/v1/users/token',data={'username':'esp@example.com','password':PASSWORD})
    own_headers={'Authorization':'Bearer '+own_login.json()['access_token']}
    response=client.get(photo['url'],headers=own_headers)
    assert response.status_code==200 and response.content.startswith(b'\xff\xd8')
    assert client.get(photo['url']).status_code==401
    assert client.get('/api/v1/agent/users/'+user['id'],headers=headers).json()['profile_pic']==photo


def test_create_retries_do_not_duplicate_users(context):
    client,engine,_=context
    headers=enable(client)
    body=data()
    one=client.post('/api/v1/agent/users',json=body,headers=headers)
    two=client.post('/api/v1/agent/users',json=body,headers=headers)
    assert one.status_code==two.status_code==201
    assert one.json()['id']==two.json()['id']
    assert client.post('/api/v1/agent/users',json={**body,'name':'Otro nombre'},headers=headers).status_code==409
    assert client.post('/api/v1/agent/users',json={**body,'request_id':str(uuid4())},headers=headers).status_code==409
    with Session(engine) as session:
        assert len(session.exec(select(User).where(User.email=='esp@example.com')).all())==1


def test_photo_retries_are_idempotent(context):
    client,engine,storage=context
    headers=enable(client)
    user=client.post('/api/v1/agent/users',json=data(),headers=headers).json()
    path='/api/v1/agent/users/'+user['id']+'/profile-pic'
    body={'request_id':str(uuid4()),'image_path':'/fatfs/inbox/photo.jpg'}
    assert client.post(path,json=body,headers=headers).status_code==200
    assert client.post(path,json=body,headers=headers).status_code==200
    assert len(client.app.state.esp_source.calls)==len(storage.objects)==1
    assert client.post(path,json={**body,'image_path':'/fatfs/inbox/other.jpg'},headers=headers).status_code==409
    assert client.post(path,json={**body,'request_id':str(uuid4())},headers=headers).status_code==200
    assert len(storage.objects)==1


@pytest.mark.parametrize('role',['ADMIN','ROOT'])
def test_agent_cannot_create_admin(context,role):
    client,_,_=context
    headers=enable(client)
    assert client.post('/api/v1/agent/users',json=data(role=role),headers=headers).status_code==422


def test_agent_cannot_operate_preexisting_users(context):
    client,_,_=context
    headers=enable(client)
    assert client.get('/api/v1/agent/users/RECEPTION',headers=headers).status_code==403
    assert client.post('/api/v1/agent/users/RECEPTION/profile-pic',headers=headers,
        json={'request_id':str(uuid4()),'image_path':'/fatfs/inbox/photo.jpg'}).status_code==403
    assert client.post('/api/v1/users',json=data(),headers=headers).status_code==401


def test_inactive_owner_revokes_agent(context):
    client,engine,_=context
    headers=enable(client)
    with Session(engine) as session:
        owner=session.get(User,'ADMIN')
        owner.active=False
        session.add(owner)
        session.commit()
    assert client.get('/api/v1/agent/connection',headers=headers).status_code==403


@pytest.mark.parametrize('path',['/fatfs/inbox/../secret.jpg','/fatfs/secret.jpg',
    'http://attacker/photo.jpg','/fatfs/inbox/a%2fb.jpg','/fatfs/inbox/file.txt','/fatfs/inbox//file.jpg'])
def test_unsafe_esp_paths_denied(context,path):
    client,_,_=context
    headers=enable(client)
    user=client.post('/api/v1/agent/users',json=data(),headers=headers).json()
    response=client.post('/api/v1/agent/users/'+user['id']+'/profile-pic',headers=headers,
        json={'request_id':str(uuid4()),'image_path':path})
    assert response.status_code==422
    assert client.app.state.esp_source.calls==[]


def test_missing_image_keeps_user_for_photo_retry(context):
    client,engine,_=context
    headers=enable(client)
    user=client.post('/api/v1/agent/users',json=data(),headers=headers).json()
    def fail(path): raise HTTPException(404,'Adjunto no encontrado')
    client.app.state.esp_source.read=fail
    path='/api/v1/agent/users/'+user['id']+'/profile-pic'
    payload={'request_id':str(uuid4()),'image_path':'/fatfs/inbox/missing.jpg'}
    assert client.post(path,json=payload,headers=headers).status_code==404
    with Session(engine) as session:
        assert session.get(User,user['id']).profile_object_key is None
        assert len(session.exec(select(AgentOperation)).all())==1
    client.app.state.esp_source=AttachmentSource()
    assert client.post(path,json=payload,headers=headers).status_code==200


def test_administrator_can_assign_photo_and_other_users_cannot(context):
    client,_,_=context
    response=client.put('/api/v1/users/RECEPTION/profile-pic',headers=auth(client),
        files={'file':('photo.png',png(),'image/png')})
    assert response.status_code==200 and response.json()['profile_pic'] is not None
    own=auth(client,'RECEPTION')
    assert client.get(response.json()['profile_pic']['url'],headers=own).status_code==200
    other=auth(client,'DENTIST')
    assert client.put('/api/v1/users/RECEPTION/profile-pic',headers=other,
        files={'file':('photo.png',png(),'image/png')}).status_code==403
    assert client.get('/api/v1/users/RECEPTION/profile-pic',headers=other).status_code==403


@pytest.mark.parametrize('base',['http://example.com','http://8.8.8.8','http://192.168.1.2/other',
    'http://user:secret@192.168.1.2','file:///etc/passwd','http://169.254.169.254'])
def test_only_configured_private_esp_base_allowed(base):
    with pytest.raises(ValueError): validate_base_url(base)


@pytest.mark.parametrize('status,content,expected',[(302,b'',502),(404,b'',404),
    (200,b'x'*(2*1024*1024+1),413)],ids=['redirect','missing','oversized'])
def test_download_rejects_redirect_missing_and_oversized(context,monkeypatch,status,content,expected):
    client,_,_=context
    settings=client.app.state.settings
    settings.esp_base_url='http://192.168.1.20'
    def handler(request):
        assert str(request.url)=='http://192.168.1.20/files/inbox/photo.jpg'
        return httpx.Response(status,content=content,headers={'Location':'http://evil.example'})
    with httpx.Client(transport=httpx.MockTransport(handler)) as downloader:
        monkeypatch.setattr(httpx,'stream',lambda method,url,**kw:downloader.stream(method,url))
        with pytest.raises(HTTPException) as error:
            EspAttachmentSource(settings).read('/fatfs/inbox/photo.jpg')
        assert error.value.status_code==expected
