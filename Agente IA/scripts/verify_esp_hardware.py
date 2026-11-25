"""Ask the user's own ESP agent to create a synthetic account and save an attachment.

This script never calls the account-creation or profile-upload API itself.
It sends natural-language WebIM requests and independently verifies PostgreSQL/S3.
"""
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from datetime import datetime,timezone
import json
from io import BytesIO
from secrets import token_urlsafe
import time
from uuid import uuid4
import httpx
from PIL import Image
from dotenv import dotenv_values
from sqlalchemy.engine import URL
from sqlmodel import Session,select
from core.config import Settings
from core.storage import ProfileStorage
from db.database import make_engine
from models.user_model import User,AgentOperation


def run():
    configuration=json.loads(Path('.local/esp/connection.json').read_text())
    session_path=Path('.local/esp/validation-session.json')
    new_session=not session_path.exists()
    if new_session:
        with httpx.Client(base_url=configuration['esp_base_url'],timeout=10,trust_env=False) as esp:
            created=esp.post('/api/webim/sessions')
            created.raise_for_status()
            session_path.write_text(created.text,encoding='utf-8')
    connection=json.loads(session_path.read_text())
    session_id=connection['session']
    state_path=Path('.local/esp/hardware-state.json')
    if state_path.exists():
        state=json.loads(state_path.read_text())
    else:
        state={'email':'esp-proof-'+uuid4().hex[:8]+'@example.com','password':token_urlsafe(24)}
        state_path.write_text(json.dumps(state,indent=2),encoding='utf-8')
    env=dotenv_values('.env')
    url=URL.create('postgresql+psycopg',username='dentalrisk_agent',password=env['POSTGRES_PASSWORD'],
        host='127.0.0.1',port=5434,database='dentalrisk_agent').render_as_string(hide_password=False)
    engine=make_engine(url)
    def lookup():
        with Session(engine) as session:
            user=session.exec(select(User).where(User.email==state['email'])).first()
            if not user: return None,None
            operations=session.exec(select(AgentOperation).where(AgentOperation.user_id==user.id)).all()
            return user,{o.kind for o in operations}
    with httpx.Client(base_url=configuration['esp_base_url'],timeout=15,trust_env=False) as esp:
        def ask(message,files=None):
            result=esp.post('/api/webim/send',json={'session':session_id,
                'client_message_id':str(uuid4()),'text':message,'files':files or []})
            result.raise_for_status()
            print('Solicitud al agente aceptada:',result.status_code,flush=True)
            deadline=time.monotonic()+150
            while time.monotonic()<deadline:
                time.sleep(3)
                status=esp.get('/api/webim/sessions/'+session_id).json()
                if status.get('run_state')=='idle': return
            raise RuntimeError('El agente no terminó en 150 segundos; revisar la conversación antes de reintentar')
        if new_session:
            ask('Lee y utiliza /fatfs/skills/dentalrisk/SKILL.md. Conéctate a DentalRisk con '
                '/fatfs/dentalrisk/connection.json. Confirma el resultado HTTP sin mostrar credenciales.')
        user,operations=lookup()
        if user is None:
            ask('Usa la habilidad dentalrisk y crea un usuario de PRUEBA llamado "Prueba DentalRisk ESP", '
                'correo '+state['email']+', rol RECEPTION y contraseña inicial '+state['password']+'. '
                'Haz la petición real a la API con la credencial del archivo de conexión. '
                'Conserva el id devuelto para su foto. No muestres claves ni contraseña en tu respuesta.')
            user,operations=lookup()
            if not user or 'user.create' not in operations:
                raise RuntimeError('El agente todavía no creó el usuario; revisar su respuesta')
        print('Alta real verificada en PostgreSQL; la ejecutó el agente del ESP.',flush=True)
        if not user.profile_object_key:
            picture=BytesIO()
            Image.new('RGB',(128,128),(0,128,128)).save(picture,format='PNG')
            path='/inbox/webim/dentalrisk-proof-'+uuid4().hex[:8]+'.png'
            esp.post('/api/files/mkdir',json={'path':'/inbox/webim','recursive':True}).raise_for_status()
            esp.post('/api/files/upload',params={'path':path},content=picture.getvalue(),
                headers={'Content-Type':'image/png'}).raise_for_status()
            ask('Esta imagen adjunta es la foto de perfil del usuario de prueba '+state['email']+
                ' que acabas de crear. Asígnala mediante la API DentalRisk al mismo usuario. '
                'Usa la ruta real del adjunto y verifica profile_pic. No crees otra cuenta ni muestres credenciales.',[path])
            user,operations=lookup()
        if not user.profile_object_key or 'user.profile' not in operations:
            raise RuntimeError('La foto todavía no quedó vinculada en PostgreSQL')
        storage=ProfileStorage(Settings())
        metadata=storage.client.head_object(Bucket=storage.settings.minio_bucket,Key=user.profile_object_key)
        assert metadata['ContentType']=='image/jpeg'
        assert storage.get(user.profile_object_key).startswith(b'\xff\xd8')
        messages=esp.get('/api/webim/sessions/'+session_id+'/messages').json()
        native_files=esp.get('/api/files',params={'path':'/sessions'}).json().get('entries',[])
        logs=[]
        for item in native_files:
            if item.get('path','').endswith('.log') and connection['alias'][:8] in item.get('path',''):
                logs.append(esp.get('/files'+item['path']).text)
        secrets=[configuration['headers']['X-Agent-Key'],state['password']]
        owner_file=Path('.local/esp/demo-owner.json')
        if owner_file.exists(): secrets.append(json.loads(owner_file.read_text())['password'])
        transcript=json.dumps(messages,ensure_ascii=False,indent=2)
        for secret in secrets: transcript=transcript.replace(secret,'[REDACTED]')
        Path('evidence/esp-conversation.json').write_text(transcript,encoding='utf-8')
        # Keep detailed native tool logs private: they can contain credentials in arguments.
        Path('.local/esp/tools-private.log').write_text('\n'.join(logs),encoding='utf-8')
        export_tool_trace(logs)
        result={'date':datetime.now(timezone.utc).isoformat(),'status':'passed','esp_hardware':True,
            'esp_address':configuration['esp_base_url'],'session':session_id,
            'transport':'ESP WebIM natural-language requests + real http_request tools',
            'synthetic_account_id':user.id,'synthetic_email':state['email'],
            'checks':['natural_language_user_creation','postgresql_agent_creation_record',
                'real_esp_attachment','minio_jpeg_object','user_profile_schema_association'],
            'profile_pic':user.profile_pic,'test_image':'synthetic teal square, not a patient image',
            'api_calls_created_by_this_script':False}
        Path('evidence/esp-hardware.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
        print(json.dumps(result,indent=2))
    engine.dispose()


def export_tool_trace(logs):
    """Export only method, route and status, never tool arguments containing secrets."""
    import re
    from urllib.parse import urlsplit
    calls={}
    exported=[]
    for line in '\n'.join(logs).splitlines():
        try: record=json.loads(line)
        except ValueError: continue
        if isinstance(record,dict):
            for call in record.get('tool_calls',[]):
                function=call.get('function',{})
                if function.get('name')!='http_request': continue
                arguments=function.get('arguments',{})
                if isinstance(arguments,str): arguments=json.loads(arguments)
                item={'tool':'http_request','method':arguments.get('method','GET'),
                    'url':arguments.get('url','')}
                calls[call.get('id')]=item
        elif isinstance(record,list):
            for result in record:
                item=calls.get(result.get('tool_call_id')) if isinstance(result,dict) else None
                if not item: continue
                content=result.get('content','')
                status=None
                try:
                    decoded=json.loads(content) if isinstance(content,str) else content
                    if isinstance(decoded,dict):
                        status=decoded.get('status',decoded.get('status_code',decoded.get('http_status')))
                except ValueError: pass
                if status is None:
                    match=re.search(r'HTTP\s+(\d{3})',str(content))
                    if match: status=int(match.group(1))
                exported.append({**item,'status':status,'tool_error':bool(result.get('is_error'))})
    Path('evidence/esp-tools.json').write_text(json.dumps({'source':'native ESP session tool log',
        'http_calls':exported,'secrets_excluded':True},indent=2),encoding='utf-8')


if __name__=='__main__': run()
