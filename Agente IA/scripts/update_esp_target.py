"""Retarget an already-authorized DentalRisk ESP connection to the current LAN."""
import argparse
from datetime import datetime, timezone
from hashlib import sha256
import json
from pathlib import Path
from ipaddress import ip_address
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from dotenv import dotenv_values, set_key
from core.esp import validate_base_url

ROOT = Path(__file__).resolve().parents[1]
CONNECTION = ROOT / '.local/esp/connection.json'
ENV_FILE = ROOT / '.env'


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--esp-url', required=True)
    parser.add_argument('--api-host', required=True)
    parser.add_argument('--api-port', type=int, default=8100)
    args = parser.parse_args()

    esp_url = validate_base_url(args.esp_url)
    host = ip_address(args.api_host)
    if not host.is_private or host.is_loopback or host.is_link_local or host.version != 4:
        raise SystemExit('--api-host debe ser la IPv4 privada de esta computadora')
    if not 1 <= args.api_port <= 65535:
        raise SystemExit('--api-port debe estar entre 1 y 65535')
    if not CONNECTION.is_file() or not ENV_FILE.is_file():
        raise SystemExit('Falta la conexión local DentalRisk; autoriza una en configure_esp.py primero.')

    connection = json.loads(CONNECTION.read_text(encoding='utf-8'))
    env = dotenv_values(ENV_FILE)
    key = connection.get('headers', {}).get('X-Agent-Key', '')
    digest = sha256(key.encode()).hexdigest()
    if not key or digest != env.get('ESP_AGENT_KEY_HASH'):
        raise SystemExit('La clave local no coincide con la delegación vigente; vuelve a autorizar con configure_esp.py.')
    if not env.get('ESP_AGENT_OWNER_ID') or env.get('CLINICAL_CONNECTOR_ENABLED', '').lower() != 'true':
        raise SystemExit('La delegación no apunta a un dueño habilitado para la conexión clínica.')

    backup_dir = ROOT / '.local/esp/backup-config'
    backup_dir.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
    (backup_dir / f'connection-{stamp}.json').write_bytes(CONNECTION.read_bytes())

    connection['esp_base_url'] = esp_url
    connection['api_base_url'] = f'http://{host}:{args.api_port}'
    connection['owner_scope'] = (
        'create_non_admin_users_and_delegated_patients_with_private_profiles_and_read_clinical_performance'
    )
    CONNECTION.write_text(json.dumps(connection, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    for name, value in {
        'ESP_BASE_URL': esp_url,
        'ESP_API_BIND_ADDRESS': str(host),
        'ESP_API_PORT': str(args.api_port),
    }.items():
        set_key(str(ENV_FILE), name, value)
    print(f'Conexion DentalRisk actualizada para ESP {host_from(esp_url)} y API {host}:{args.api_port}.')
    print(f'Clave conservada; copia previa en {backup_dir.name}/connection-{stamp}.json.')


def host_from(url):
    from urllib.parse import urlsplit
    return urlsplit(url).hostname


if __name__ == '__main__':
    main()
