from ipaddress import ip_address
import re
from urllib.parse import urlsplit
import httpx
from fastapi import HTTPException
from core.storage import MAX_IMAGE_BYTES


def validate_base_url(base):
    parsed = urlsplit(base)
    try:
        address = ip_address(parsed.hostname or '')
    except ValueError:
        raise ValueError('ESP_BASE_URL requiere la IP privada del ESP') from None
    if (parsed.scheme not in {'http','https'} or not address.is_private
            or address.is_multicast or address.is_unspecified or address.is_link_local
            or parsed.username or parsed.password or parsed.path not in {'','/'}
            or parsed.query or parsed.fragment):
        raise ValueError('ESP_BASE_URL debe apuntar únicamente al ESP en la red privada')
    # Accessing port validates malformed / out of range port values as well.
    _ = parsed.port
    return base.rstrip('/')


def validate_image_path(path):
    if (not re.fullmatch(r'/fatfs/inbox/[A-Za-z0-9_./-]+\.(?:jpg|jpeg|png|webp)',path,re.I)
            or any(p in {'', '.', '..'} for p in path.split('/')[1:])):
        raise ValueError('La imagen debe ser un adjunto real dentro de /fatfs/inbox/')
    return path


class EspAttachmentSource:
    def __init__(self, settings):
        self.settings = settings

    def read(self, path):
        try:
            validate_image_path(path)
        except ValueError as error:
            raise HTTPException(422,str(error)) from None
        if not self.settings.esp_base_url:
            raise HTTPException(503,'Falta configurar la dirección del ESP')
        base=validate_base_url(self.settings.esp_base_url)
        url=base+'/files'+path.removeprefix('/fatfs')
        try:
            with httpx.stream('GET',url,timeout=httpx.Timeout(15,connect=3),
                              follow_redirects=False,trust_env=False) as response:
                if response.is_redirect:
                    raise HTTPException(502,'El ESP redirigió el adjunto; no se seguirá la redirección')
                if response.status_code==404:
                    raise HTTPException(404,'El adjunto no existe en el ESP')
                response.raise_for_status()
                content=bytearray()
                for chunk in response.iter_bytes(chunk_size=65536):
                    content.extend(chunk)
                    if len(content)>MAX_IMAGE_BYTES:
                        raise HTTPException(413,'El adjunto del ESP excede 2 MiB')
                return bytes(content)
        except httpx.HTTPError:
            raise HTTPException(502,'No se pudo leer la imagen del ESP') from None
