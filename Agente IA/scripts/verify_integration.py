"""Destructive only inside a newly created isolated test DB and bucket."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from datetime import datetime, timezone
from io import BytesIO
from secrets import token_urlsafe
from uuid import uuid4
import json
import psycopg
from psycopg import sql
from sqlalchemy.engine import URL
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from PIL import Image
from sqlmodel import Session, select
from core.config import Settings
from core.security import hash_password
from core.storage import ProfileStorage
from db.database import make_engine
from main import create_app
from models.user_model import User, TokenSession


def verify_esp_flow(client,settings):
    from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
    from threading import Thread
    from hashlib import sha256
    photo=BytesIO()
    Image.new('RGB',(24,24),'blue').save(photo,format='PNG')
    image=photo.getvalue()
    class EspFiles(BaseHTTPRequestHandler):
        def do_GET(self):
            if self.path!='/files/inbox/received.png':
                self.send_error(404)
                return
            self.send_response(200)
            self.send_header('Content-Type','image/png')
            self.send_header('Content-Length',str(len(image)))
            self.end_headers()
            self.wfile.write(image)
        def log_message(self,*args): pass
    server=ThreadingHTTPServer(('127.0.0.1',0),EspFiles)
    thread=Thread(target=server.serve_forever,daemon=True)
    thread.start()
    key=token_urlsafe(36)
    settings.esp_base_url=f'http://127.0.0.1:{server.server_port}'
    settings.esp_agent_key_hash=sha256(key.encode()).hexdigest()
    settings.esp_agent_owner_id='test-owner'
    headers={'X-Agent-Key':key}
    try:
        assert client.get('/api/v1/agent/connection',headers=headers).json()['connected'] is True
        body={'request_id':str(uuid4()),'name':'Alta ESP sintética','email':'esp@example.com',
              'password':token_urlsafe(24),'role':'RECEPTION'}
        first=client.post('/api/v1/agent/users',json=body,headers=headers)
        assert first.status_code==201,first.status_code
        repeated=client.post('/api/v1/agent/users',json=body,headers=headers)
        assert repeated.json()['id']==first.json()['id']
        user_id=first.json()['id']
        path='/api/v1/agent/users/'+user_id+'/profile-pic'
        payload={'request_id':str(uuid4()),'image_path':'/fatfs/inbox/received.png'}
        saved=client.post(path,json=payload,headers=headers)
        assert saved.status_code==200,saved.status_code
        reference=saved.json()['profile_pic']
        assert reference['requires_auth'] is True
        assert client.post(path,json=payload,headers=headers).json()['profile_pic']==reference
        observed=client.get('/api/v1/agent/users/'+user_id,headers=headers)
        assert observed.json()['profile_pic']==reference
        assert client.get(reference['url']).status_code==401
        storage=client.app.state.storage
        with Session(client.app.state.engine) as session:
            target=session.get(User,user_id)
            assert storage.client.head_object(Bucket=settings.minio_bucket,
                Key=target.profile_object_key)['ContentType']=='image/jpeg'
        return ['esp_delegated_connection','esp_create_user_idempotent',
            'esp_http_attachment_to_real_minio','profile_schema_reference',
            'esp_photo_retry_idempotent']
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)


def verify():
    from dotenv import dotenv_values
    local = dotenv_values('.env')
    db_name = 'agent_verify_' + uuid4().hex[:12]
    bucket = 'agent-verify-' + uuid4().hex[:12]
    password = local['POSTGRES_PASSWORD']
    url = URL.create('postgresql+psycopg', username='dentalrisk_agent', password=password,
        host='127.0.0.1', port=5434, database=db_name).render_as_string(hide_password=False)
    settings = Settings(database_url=url, environment='test', secret_key=token_urlsafe(48),
                        minio_bucket=bucket, clinical_connector_enabled=False)
    storage = ProfileStorage(settings)
    engine = None
    db_created = bucket_created = False
    # No connection URL is printed or written to evidence.
    import os
    previous = os.environ.get('DATABASE_URL')
    result = {'date':datetime.now(timezone.utc).isoformat(), 'database':'PostgreSQL',
        'storage':'MinIO S3 real', 'inference':False, 'esp_hardware':False,
        'esp_source':'isolated HTTP simulator of the ESP attachment endpoint','checks':[]}
    with psycopg.connect(host='127.0.0.1',port=5434,user='dentalrisk_agent',password=password,
                         dbname='postgres',autocommit=True) as admin:
        try:
            admin.execute(sql.SQL('CREATE DATABASE {}').format(sql.Identifier(db_name)))
            db_created=True
            storage.client.create_bucket(Bucket=bucket)
            bucket_created=True
            os.environ['DATABASE_URL']=url
            command.upgrade(Config('alembic.ini'),'head')
            command.check(Config('alembic.ini'))
            result['checks'].append('migration_from_empty_database')
            result['checks'].append('postgresql_schema_matches_models_including_utc')
            engine=make_engine(url)
            login_password=token_urlsafe(24)
            with Session(engine) as session:
                session.add(User(id='test-owner',name='Dueño de prueba',email='owner@example.com',
                    role='ADMIN',password_hash=hash_password(login_password)))
                session.commit()
            app=create_app(settings,engine=engine,storage=storage)
            with TestClient(app) as client:
                login=client.post('/api/v1/users/token',data={'username':'owner@example.com','password':login_password})
                assert login.status_code==200, login.status_code
                headers={'Authorization':'Bearer '+login.json()['access_token']}
                result['checks'].append('postgresql_login_and_session')
                assert client.get('/health/ready').status_code==200
                image=BytesIO()
                Image.new('RGB',(32,32),'green').save(image,format='PNG')
                assert client.put('/api/v1/users/me/profile-pic',headers=headers,
                    files={'file':('test.png',image.getvalue(),'image/png')}).status_code==204
                response=client.get('/api/v1/users/me/profile-pic',headers=headers)
                assert response.status_code==200 and response.content.startswith(b'\xff\xd8')
                with Session(engine) as session:
                    key=session.get(User,'test-owner').profile_object_key
                    assert session.exec(select(TokenSession)).first() is not None
                assert storage.client.head_object(Bucket=bucket,Key=key)['ContentType']=='image/jpeg'
                result['checks'].append('upload_retrieve_real_minio')
                import httpx
                anonymous=httpx.get(settings.minio_endpoint+'/'+bucket+'/'+key,timeout=5)
                assert anonymous.status_code==403, anonymous.status_code
                result['checks'].append('anonymous_object_denied')
                assert client.post('/api/v1/users/logout',headers=headers).status_code==204
                assert client.get('/api/v1/users/me',headers=headers).status_code==401
                result['checks'].append('persisted_session_revocation')
                result['checks'].extend(verify_esp_flow(client,settings))
                # Two owners cannot deactivate each other and leave no active owner.
                owner_login=client.post('/api/v1/users/token',data={'username':'owner@example.com','password':login_password})
                owner_headers={'Authorization':'Bearer '+owner_login.json()['access_token']}
                created=client.post('/api/v1/users',headers=owner_headers,json={
                    'name':'Segundo dueño de prueba','email':'second@example.com',
                    'password':login_password,'role':'ADMIN'})
                assert created.status_code==201
                other_id=created.json()['id']
                second_login=client.post('/api/v1/users/token',data={'username':'second@example.com','password':login_password})
                other_headers={'Authorization':'Bearer '+second_login.json()['access_token']}
                from concurrent.futures import ThreadPoolExecutor
                from threading import Barrier
                barrier=Barrier(2)
                def disable(target, credentials):
                    barrier.wait(timeout=10)
                    return client.patch('/api/v1/users/'+target+'/status',headers=credentials,
                        json={'active':False}).status_code
                with ThreadPoolExecutor(max_workers=2) as executor:
                    first=executor.submit(disable,other_id,owner_headers)
                    second=executor.submit(disable,'test-owner',other_headers)
                    statuses=sorted([first.result(timeout=20),second.result(timeout=20)])
                assert statuses in ([200,401],[200,403]), statuses
                with Session(engine) as session:
                    assert len(session.exec(select(User).where(User.role=='ADMIN',User.active==True)).all())==1
                result['checks'].append('concurrent_owner_changes_preserve_active_owner')
            result['status']='passed'
        finally:
            if previous is None: os.environ.pop('DATABASE_URL',None)
            else: os.environ['DATABASE_URL']=previous
            if engine is not None: engine.dispose()
            if bucket_created:
                for page in storage.client.get_paginator('list_objects_v2').paginate(Bucket=bucket):
                    for obj in page.get('Contents',[]):
                        storage.client.delete_object(Bucket=bucket,Key=obj['Key'])
                storage.client.delete_bucket(Bucket=bucket)
            if db_created:
                admin.execute(sql.SQL('DROP DATABASE {} WITH (FORCE)').format(sql.Identifier(db_name)))
    result['isolated_resources_removed']=True
    Path('evidence').mkdir(exist_ok=True)
    Path('evidence/integration.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
    print(json.dumps(result,indent=2))


if __name__=='__main__':
    verify()
