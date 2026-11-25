import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import json
from main import create_app

output=Path('docs/api')
output.mkdir(parents=True,exist_ok=True)
app=create_app()
(output/'openapi.json').write_text(json.dumps(app.openapi(),indent=2,ensure_ascii=False),encoding='utf-8')
collection={
    'info':{'name':'DentalRisk Agente IA v01','schema':'https://schema.getpostman.com/json/collection/v2.1.0/collection.json'},
    'variable':[{'key':'base_url','value':'http://127.0.0.1:8000'},
        {'key':'email','value':''},{'key':'password','value':''},{'key':'token','value':''},
        {'key':'agent_key','value':''},{'key':'user_id','value':''},{'key':'patient_id','value':''}],
    'item':[]}
for name,method,path in [
    ('Estado','GET','/health/ready'),('Iniciar sesión','POST','/api/v1/users/token'),
    ('Mi perfil','GET','/api/v1/users/me'),('Usuarios','GET','/api/v1/users'),
    ('Capacidades previstas','GET','/api/v1/agent/capabilities'),
    ('Resumen clínico autorizado','GET','/api/v1/clinical/summary'),
    ('Atenciones autorizadas','GET','/api/v1/clinical/records?kind=attentions&limit=50'),
    ('Citas autorizadas','GET','/api/v1/clinical/records?kind=appointments&limit=50'),
    ('Subir imagen propia','PUT','/api/v1/users/me/profile-pic'),
    ('Recuperar imagen propia','GET','/api/v1/users/me/profile-pic'),
    ('Cerrar sesión','POST','/api/v1/users/logout')]:
    request={'method':method,'url':'{{base_url}}'+path}
    item={'name':name,'request':request}
    if path.endswith('/token'):
        request['body']={'mode':'urlencoded','urlencoded':[{'key':'username','value':'{{email}}'},
            {'key':'password','value':'{{password}}'}]}
        item['event']=[{'listen':'test','script':{'type':'text/javascript',
            'exec':['if (pm.response.code === 200) pm.collectionVariables.set("token", pm.response.json().access_token);']}}]
    elif path.startswith('/api/'):
        request['auth']={'type':'bearer','bearer':[{'key':'token','value':'{{token}}','type':'string'}]}
    if method=='PUT':
        request['body']={'mode':'formdata','formdata':[{'key':'file','type':'file','src':None}]}
    collection['item'].append(item)
for name,method,path,body in [
    ('Conectar agente ESP','GET','/api/v1/agent/connection',None),
    ('Alta desde ESP','POST','/api/v1/agent/users',{
        'request_id':'{{$guid}}','name':'Usuario de prueba','email':'esp-test@example.com',
        'password':'{{password}}','role':'RECEPTION'}),
    ('Registrar paciente desde ESP','POST','/api/v1/agent/patients',{
        'request_id':'{{$guid}}','name':'Paciente de prueba','reference':'P-TEST-01'}),
    ('Consultar paciente creado por ESP','GET','/api/v1/agent/patients/{{patient_id}}',None),
    ('Foto de paciente recibida en ESP','POST','/api/v1/agent/patients/{{patient_id}}/profile-pic',{
        'request_id':'{{$guid}}','image_path':'/fatfs/inbox/archivo_real.jpg'}),
    ('Foto recibida en ESP','POST','/api/v1/agent/users/{{user_id}}/profile-pic',{
        'request_id':'{{$guid}}','image_path':'/fatfs/inbox/archivo_real.jpg'}),
    ('Consultar usuario del agente','GET','/api/v1/agent/users/{{user_id}}',None),
    ('Resumen clínico desde ESP','GET','/api/v1/agent/clinical/summary',None),
    ('Rendimiento por dentista desde ESP','GET','/api/v1/agent/clinical/performance?start_at=2026-11-01T00:00:00-07:00&end_at=2026-12-01T00:00:00-08:00',None),
    ('Atenciones desde ESP','GET','/api/v1/agent/clinical/records?kind=attentions&limit=50',None)]:
    request={'method':method,'url':'{{base_url}}'+path,
        'header':[{'key':'X-Agent-Key','value':'{{agent_key}}'}]}
    if body:
        request['header'].append({'key':'Content-Type','value':'application/json'})
        request['body']={'mode':'raw','raw':json.dumps(body,ensure_ascii=False,indent=2)}
    item={'name':name,'request':request}
    if path=='/api/v1/agent/users':
        item['event']=[{'listen':'test','script':{'type':'text/javascript',
            'exec':['if (pm.response.code === 201) pm.collectionVariables.set("user_id", pm.response.json().id);']}}]
    if path=='/api/v1/agent/patients':
        item['event']=[{'listen':'test','script':{'type':'text/javascript',
            'exec':['if (pm.response.code === 201) pm.collectionVariables.set("patient_id", pm.response.json().id);']}}]
    collection['item'].append(item)
(output/'postman.json').write_text(json.dumps(collection,indent=2,ensure_ascii=False),encoding='utf-8')
print('OpenAPI y colección Postman generados sin credenciales')
