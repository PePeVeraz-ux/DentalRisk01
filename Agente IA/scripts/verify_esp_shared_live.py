"""Exercise the connected ESP against the current shared DentalRisk installation.

The ESP must call the APIs itself. A synthetic account and image are used;
secrets and the full native tool log remain in ignored .local files.
"""
import json
import re
import sys
import time
from datetime import datetime, timezone
from io import BytesIO
from pathlib import Path
from secrets import token_urlsafe
from urllib.parse import urlsplit
from uuid import uuid4

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import httpx
from PIL import Image
from sqlalchemy.engine import make_url
from sqlmodel import Session, select
from core.config import Settings
from core.storage import ProfileStorage
from db.database import make_engine
from models.user_model import User, AgentOperation

ROOT = Path(__file__).resolve().parents[1]
PRIVATE = ROOT / '.local/esp'
CONNECTION = json.loads((PRIVATE / 'connection.json').read_text(encoding='utf-8'))
SESSION_FILE = PRIVATE / 'shared-verification-session.json'
STATE_FILE = PRIVATE / 'shared-verification-state.json'
SETTINGS = Settings()
assert make_url(SETTINGS.database_url).database == 'dentalrisk'


def lookup(engine, email):
    with Session(engine) as session:
        user = session.exec(select(User).where(User.email == email)).first()
        if not user:
            return None, set()
        operations = session.exec(select(AgentOperation).where(AgentOperation.user_id == user.id)).all()
        return user, {operation.kind for operation in operations}


def trace_for(esp, connection):
    files = esp.get('/api/files', params={'path':'/sessions'}).json().get('entries', [])
    logs = []
    for item in files:
        if item.get('path', '').endswith('.log') and connection['alias'][:8] in item.get('path', ''):
            logs.append(esp.get('/files' + item['path']).text)
    pending = {}
    calls = []
    for line in '\n'.join(logs).splitlines():
        try:
            record = json.loads(line)
        except ValueError:
            continue
        if isinstance(record, dict):
            for call in record.get('tool_calls', []):
                function = call.get('function', {})
                if function.get('name') != 'http_request':
                    continue
                args = function.get('arguments', {})
                if isinstance(args, str):
                    try: args = json.loads(args)
                    except ValueError: continue
                pending[call.get('id')] = {'method':args.get('method', 'GET'),
                    'path':urlsplit(args.get('url', '')).path}
        elif isinstance(record, list):
            for reply in record:
                if not isinstance(reply, dict):
                    continue
                item = pending.get(reply.get('tool_call_id'))
                if not item:
                    continue
                content = reply.get('content', '')
                status = None
                try:
                    decoded = json.loads(content) if isinstance(content, str) else content
                    if isinstance(decoded, dict):
                        status = decoded.get('status',decoded.get('status_code',decoded.get('http_status')))
                except ValueError:
                    pass
                if status is None:
                    match = re.search(r'HTTP\s+(\d{3})',str(content))
                    if match: status = int(match.group(1))
                calls.append({**item,'status':status,'tool_error':bool(reply.get('is_error'))})
    return calls


def run():
    engine = make_engine(SETTINGS.database_url)
    state = json.loads(STATE_FILE.read_text()) if STATE_FILE.exists() else {
        'email':'qa.esp.shared.' + uuid4().hex[:8] + '@example.com',
        'password':token_urlsafe(24),
    }
    if state['email'].endswith('@dentalrisk.local'):
        state['email']=state['email'].replace('@dentalrisk.local','@example.com')
        STATE_FILE.write_text(json.dumps(state,indent=2),encoding='utf-8')
    if not STATE_FILE.exists():
        STATE_FILE.write_text(json.dumps(state,indent=2),encoding='utf-8')
    with httpx.Client(base_url=CONNECTION['api_base_url'],timeout=15,trust_env=False) as api:
        for path in ('/health/ready','/api/v1/agent/connection',
                     '/api/v1/agent/clinical/summary'):
            response=api.get(path,headers=CONNECTION['headers'])
            assert response.status_code==200,(path,response.status_code)
        assert api.get('/api/v1/agent/clinical/summary').status_code==401
        sample=api.get('/api/v1/agent/clinical/records?kind=attentions&limit=2',
                       headers=CONNECTION['headers'])
        assert sample.status_code==200
        assert 'patient' not in json.dumps(sample.json()).lower()
    with httpx.Client(base_url=CONNECTION['esp_base_url'],timeout=20,trust_env=False) as esp:
        if SESSION_FILE.exists():
            connection=json.loads(SESSION_FILE.read_text())
        else:
            response=esp.post('/api/webim/sessions')
            response.raise_for_status()
            connection=response.json()
            SESSION_FILE.write_text(json.dumps(connection,indent=2),encoding='utf-8')
        session_id=connection['session']

        def ask(message, files=None):
            history=esp.get('/api/webim/sessions/'+session_id+'/messages').json().get('messages',[])
            before=max((item.get('seq',0) for item in history),default=0)
            response=esp.post('/api/webim/send',json={'session':session_id,
                'client_message_id':str(uuid4()),'text':message,'files':files or []})
            response.raise_for_status()
            deadline=time.monotonic()+180
            while time.monotonic()<deadline:
                time.sleep(3)
                status=esp.get('/api/webim/sessions/'+session_id).json()
                messages=esp.get('/api/webim/sessions/'+session_id+'/messages').json().get('messages',[])
                answered=any(item.get('role')=='assistant' and item.get('seq',0)>before for item in messages)
                if status.get('run_state')=='idle' and answered:
                    return
            raise RuntimeError('El ESP no terminó la solicitud en 180 segundos')

        history=esp.get('/api/webim/sessions/'+session_id+'/messages').json().get('messages',[])
        if not any(item.get('role')=='assistant' for item in history):
            ask('Lee /fatfs/skills/dentalrisk/SKILL.md y usa /fatfs/dentalrisk/connection.json. '
                'Conéctate realmente a la API DentalRisk y consulta el resumen clínico y dos atenciones '
                'mediante http_request. Indica estados HTTP y conteos, sin identidad de pacientes ni claves. '
                'No crees usuarios aún.')
        user,operations=lookup(engine,state['email'])
        if user is None:
            ask('Usa la habilidad dentalrisk para crear UNA cuenta de PRUEBA de recepción llamada '
                '"Prueba ESP compartido", correo '+state['email']+', contraseña inicial '
                +state['password']+'. Haz POST real a la API y conserva el ID. '
                'No muestres la contraseña ni la clave del dispositivo.')
            user,operations=lookup(engine,state['email'])
        assert user and 'user.create' in operations and user.role=='RECEPTION'

        with httpx.Client(base_url='http://127.0.0.1:4000',timeout=15,trust_env=False) as clinic:
            login=clinic.post('/api/v1/sessions',json={'email':state['email'],
                                                       'password':state['password']},
                              headers={'origin':'http://127.0.0.1:3000'})
            assert login.status_code==200,login.status_code
            me=clinic.get('/api/v1/sessions/me')
            assert me.status_code==200 and me.json()['user']['id']==user.id
            clinic.post('/api/v1/sessions/logout',json={},headers={
                'x-csrf-token':login.json()['csrf'],'origin':'http://127.0.0.1:3000'})

        if not user.profile_object_key:
            picture=BytesIO()
            Image.new('RGB',(128,128),(0,110,165)).save(picture,format='PNG')
            path='/inbox/webim/qa-shared-'+uuid4().hex[:8]+'.png'
            esp.post('/api/files/mkdir',json={'path':'/inbox/webim','recursive':True}).raise_for_status()
            esp.post('/api/files/upload',params={'path':path},content=picture.getvalue(),
                     headers={'Content-Type':'image/png'}).raise_for_status()
            ask('Esta imagen adjunta es la foto de perfil de la cuenta de PRUEBA '+state['email']+'. '
                'Asóciala al usuario recién creado con la API DentalRisk; usa la ruta real del adjunto. '
                'Confirma el estado HTTP y profile_pic. No crees otra cuenta ni muestres secretos.',[path])
            user,operations=lookup(engine,state['email'])
        assert user.profile_object_key and 'user.profile' in operations
        storage=ProfileStorage(SETTINGS)
        metadata=storage.client.head_object(Bucket=SETTINGS.minio_bucket,Key=user.profile_object_key)
        assert metadata['ContentType']=='image/jpeg'
        assert storage.get(user.profile_object_key).startswith(b'\xff\xd8')
        anonymous=httpx.get(SETTINGS.minio_endpoint.rstrip('/')+'/'+SETTINGS.minio_bucket+'/'+user.profile_object_key,
                            timeout=8,trust_env=False)
        assert anonymous.status_code==403
        calls=trace_for(esp,connection)
        required=['/api/v1/agent/connection','/api/v1/agent/clinical/summary',
                  '/api/v1/agent/clinical/records','/api/v1/agent/users']
        for path in required:
            assert any(call['path']==path and call['status'] in (200,201) for call in calls),path
        assert any(call['path'].endswith('/profile-pic') and call['status']==200 for call in calls)
        evidence={'at':datetime.now(timezone.utc).isoformat(),'status':'passed',
            'esp_host':urlsplit(CONNECTION['esp_base_url']).hostname,
            'api_host':urlsplit(CONNECTION['api_base_url']).hostname,
            'shared_database':make_url(SETTINGS.database_url).database,
            'clinical_login_status':login.status_code,'synthetic_user_id':user.id,
            'checks':['esp_connection','esp_clinical_summary','esp_clinical_records_redacted',
                'esp_user_create','shared_dentalrisk_login','esp_profile_upload','minio_jpeg',
                'anonymous_minio_denied'],
            'http_calls':calls,'secrets_excluded':True}
        (ROOT/'evidence/esp-shared-live.json').write_text(json.dumps(evidence,indent=2),encoding='utf-8')
        print(json.dumps(evidence,indent=2))
    engine.dispose()


if __name__=='__main__':
    run()
