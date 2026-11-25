"""Authorize an ESP connection using an existing owner; secrets stay in ignored files."""
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import argparse
from getpass import getpass
from hashlib import sha256
from ipaddress import ip_address
import json
from secrets import token_urlsafe
from urllib.parse import urlsplit
import httpx
from dotenv import set_key
from core.esp import validate_base_url


def write_connection(owner_id,esp_url,host,api_port):
    key=token_urlsafe(36)
    if not Path('.env').exists(): raise ValueError('Primero ejecuta prepare_env.py')
    for name,value in {'ESP_BASE_URL':esp_url,'ESP_AGENT_OWNER_ID':owner_id,
        'ESP_AGENT_KEY_HASH':sha256(key.encode()).hexdigest(),'ESP_API_BIND_ADDRESS':str(host),
        'ESP_API_PORT':str(api_port)}.items():
        set_key('.env',name,value)
    directory=Path('.local/esp')
    directory.mkdir(parents=True,exist_ok=True)
    payload={'api_base_url':f'http://{host}:{api_port}','headers':{'X-Agent-Key':key},
        'esp_base_url':esp_url,
        'owner_scope':'create_non_admin_users_and_delegated_patients_with_private_profiles_and_read_clinical_performance'}
    (directory/'connection.json').write_text(json.dumps(payload,indent=2),encoding='utf-8')
    return payload


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--esp-url',required=True,help='http://IP_ACTUAL_DEL_ESP')
    parser.add_argument('--api-host',required=True,help='IP Wi-Fi de esta computadora')
    parser.add_argument('--api-port',type=int,default=8000,help='Puerto LAN para la API (predeterminado: 8000)')
    parser.add_argument('--api-url',default='http://127.0.0.1:8000')
    args=parser.parse_args()
    if not 1 <= args.api_port <= 65535:
        raise SystemExit('--api-port debe estar entre 1 y 65535')
    esp_url=validate_base_url(args.esp_url)
    host=ip_address(args.api_host)
    if not host.is_private or host.is_loopback or host.is_link_local or host.version!=4:
        raise SystemExit('--api-host requiere la IPv4 privada de la computadora en Wi-Fi/LAN')
    if urlsplit(args.api_url).hostname not in {'127.0.0.1','localhost','::1'}:
        raise SystemExit('--api-url debe ser la API local para autenticar al dueño')
    email=input('Correo del dueño existente: ').strip()
    password=getpass('Contraseña del dueño (no se guarda): ')
    with httpx.Client(base_url=args.api_url,timeout=15,trust_env=False) as client:
        login=client.post('/api/v1/users/token',data={'username':email,'password':password})
        if login.status_code!=200:
            raise SystemExit('No se pudo autenticar al dueño')
        headers={'Authorization':'Bearer '+login.json()['access_token']}
        try:
            me=client.get('/api/v1/users/me',headers=headers)
            me.raise_for_status()
            owner=me.json()
            if owner['role']!='ADMIN':
                raise SystemExit('Se requiere una cuenta ADMIN activa')
        finally:
            client.post('/api/v1/users/logout',headers=headers)
    write_connection(owner['id'],esp_url,host,args.api_port)
    print('Delegación configurada; cualquier clave anterior quedó reemplazada en .env.')
    print('Credencial para el ESP: .local/esp/connection.json. No compartir ni subir a Git.')
    print('En ESP-CLAW agrega '+str(host)+' a http_allowlist y carga la guía esp/INSTRUCCIONES.md.')
    print('Aplicar configuración: docker compose -f compose.yaml -f compose.esp.yaml up -d --build api')
    print('El acceso físico se valida con GET /api/v1/agent/connection desde el ESP.')


if __name__=='__main__': main()
