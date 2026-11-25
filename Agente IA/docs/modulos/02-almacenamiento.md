# Perfiles privados en MinIO

La base almacena la clave del objeto y MinIO conserva la imagen transformada. `scripts/provision_storage.py` crea el bucket si no existe y no concede permisos públicos. El aprovisionamiento se ejecuta aparte de la API para que no necesite crear buckets durante cada carga.

El usuario llama a `PUT /api/v1/users/me/profile-pic` con un formulario multipart y el campo `file`. La API lee como máximo 2 MiB más un byte, verifica el contenido con Pillow, limita los píxeles y genera JPEG de 512 × 512 como máximo. Se descartan el nombre original y sus metadatos. Una imagen PNG enviada con un MIME incorrecto se procesa por su contenido real; un texto enviado como JPEG se rechaza.

Después de almacenar el nuevo objeto, la API confirma la nueva referencia en base. Si la transacción falla, intenta retirar el objeto nuevo. Si la sustitución funciona, intenta eliminar el anterior. Una limpieza fallida deja un registro técnico `profile.orphan_cleanup_pending`; los objetos huérfanos deben conciliarse con las referencias de la base antes de eliminarlos. MinIO y PostgreSQL no comparten una transacción distribuida.

`GET /api/v1/users/me/profile-pic` entrega únicamente el objeto vinculado a la cuenta autenticada, con `Cache-Control: no-store`. No existe una ruta para descargar objetos por clave arbitraria ni un bucket público. La indisponibilidad de S3 produce 503 sin exponer datos del host o credenciales.

UserResponse incluye `profile_pic` con una URL autenticada y tipo JPEG. Un administrador puede usar `PUT /users/{id}/profile-pic` para asignar la foto a otro usuario. El agente ESP usa JSON con `image_path` mediante `/agent/users/{id}/profile-pic`; el servidor descarga y valida el adjunto real antes de llamar al mismo componente de guardado. La base conserva la referencia, no los bytes de imagen.

Compose publica S3 en 9100 y la consola en 9101, solo en loopback. El cliente Boto3 usa firma S3 v4 y tiempos de espera. La imagen comunitaria de MinIO se fija por digest para reproducir el ensayo; no se afirma soporte comercial ni procedencia de una compilación oficial. La imagen elegida y la versión real se registran en la evidencia de infraestructura.

La configuración Compose es local y usa la credencial raíz generada para aprovisionar. Antes de un despliegue clínico se debe crear una credencial de aplicación limitada al bucket y a PutObject, GetObject y DeleteObject, separar el usuario de aprovisionamiento, mantener HTTPS, configurar límites del cuerpo HTTP en el proxy y respaldar los volúmenes. No se debe exponer la consola a la red pública. La auditoría de paquetes Python no audita vulnerabilidades de las imágenes de contenedor.
