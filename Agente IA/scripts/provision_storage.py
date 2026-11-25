import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from botocore.exceptions import ClientError
from core.config import Settings
from core.storage import ProfileStorage

settings = Settings()
storage = ProfileStorage(settings)
try:
    storage.ready()
except ClientError as error:
    if error.response['Error']['Code'] not in {'404', 'NoSuchBucket'}:
        raise
    storage.client.create_bucket(Bucket=settings.minio_bucket)
# No public bucket policy or ACL is granted.
print('Bucket privado disponible. No se habilitó acceso anónimo.')
