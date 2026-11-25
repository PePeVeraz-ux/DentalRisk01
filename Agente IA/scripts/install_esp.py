"""Install only DentalRisk-specific files on an explicitly configured ESP-CLAW."""
from pathlib import Path
import argparse
from datetime import datetime,timezone
import json
import httpx

parser=argparse.ArgumentParser()
parser.add_argument('--include-identity',action='store_true',
    help='Install DentalRisk Soul, Identity and User Info, backing up current device files')
args=parser.parse_args()
configuration=json.loads(Path('.local/esp/connection.json').read_text())
backup=Path('.local/esp/backup')/datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
backup.mkdir(parents=True,exist_ok=True)
with httpx.Client(base_url=configuration['esp_base_url'],timeout=15,trust_env=False) as esp:
    for directory in ['/dentalrisk','/skills/dentalrisk']:
        response=esp.post('/api/files/mkdir',json={'path':directory,'recursive':True})
        response.raise_for_status()
    files={'/dentalrisk/connection.json':Path('.local/esp/connection.json').read_bytes(),
           '/skills/dentalrisk/SKILL.md':Path('esp/SKILL.md').read_bytes()}
    if args.include_identity:
        for name in ['soul.md','identity.md','user.md']:
            files['/memory/'+name]=(Path('esp/identity')/name).read_bytes()
    for path,content in files.items():
        previous=esp.get('/files'+path)
        if previous.status_code==200:
            (backup/path.rsplit('/',1)[-1]).write_bytes(previous.content)
        result=esp.post('/api/files/upload',params={'path':path},content=content,
            headers={'Content-Type':'application/octet-stream'})
        result.raise_for_status()
        observed=esp.get('/files'+path)
        assert observed.status_code==200 and observed.content==content
    config=esp.get('/api/config').json()
    allowlist=config.get('search_http_allowlist','')
    from urllib.parse import urlsplit
    host=urlsplit(configuration['api_base_url']).hostname
    if '*' not in [x.strip() for x in allowlist.split(',')] and host not in [x.strip() for x in allowlist.split(',')]:
        patch={'search_http_allowlist':','.join(x for x in [allowlist,host] if x)}
        result=esp.post('/api/config',json=patch)
        result.raise_for_status()
print('Instalados connection.json y habilidad DentalRisk en el ESP; archivos ajenos conservados.')
if args.include_identity:
    print('Instalados Soul, Identity y User Info. Copias anteriores en '+str(backup))
