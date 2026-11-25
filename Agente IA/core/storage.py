from io import BytesIO
from uuid import uuid4
import warnings
import boto3
from botocore.client import Config
from PIL import Image, UnidentifiedImageError
from fastapi import HTTPException

MAX_IMAGE_BYTES = 2 * 1024 * 1024
Image.MAX_IMAGE_PIXELS = 8_000_000


def clean_image(data):
    if not data or len(data) > MAX_IMAGE_BYTES:
        raise HTTPException(413, 'La imagen debe medir entre 1 byte y 2 MiB')
    try:
        with warnings.catch_warnings():
            warnings.simplefilter('error', Image.DecompressionBombWarning)
            with Image.open(BytesIO(data)) as image:
                if image.format not in {'JPEG', 'PNG', 'WEBP'}:
                    raise ValueError('Formato no permitido')
                image.load()
                image.thumbnail((512, 512))
                output = BytesIO()
                image.convert('RGB').save(output, format='JPEG', quality=85)
                return output.getvalue()
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError,
            Image.DecompressionBombWarning):
        raise HTTPException(400, 'Se requiere una imagen JPEG, PNG o WebP válida') from None


class ProfileStorage:
    def __init__(self, settings):
        self.settings = settings
        self.client = boto3.client('s3', endpoint_url=settings.minio_endpoint,
            aws_access_key_id=settings.minio_access_key,
            aws_secret_access_key=settings.minio_secret_key,
            region_name='us-east-1', config=Config(signature_version='s3v4',
                s3={'addressing_style': 'path'}, connect_timeout=3, read_timeout=5,
                retries={'max_attempts': 1}))

    def put(self, user_id, content, namespace='profiles'):
        key = f'{namespace}/{user_id}/{uuid4()}.jpg'
        self.client.put_object(Bucket=self.settings.minio_bucket, Key=key,
                               Body=content, ContentType='image/jpeg')
        return key

    def get(self, key):
        result = self.client.get_object(Bucket=self.settings.minio_bucket, Key=key)
        stream = result['Body']
        try:
            return stream.read(MAX_IMAGE_BYTES + 1)
        finally:
            stream.close()

    def delete(self, key):
        self.client.delete_object(Bucket=self.settings.minio_bucket, Key=key)

    def ready(self):
        self.client.head_bucket(Bucket=self.settings.minio_bucket)
