# Alta de usuario y fotografía desde el ESP

El agente que reside en el ESP interpreta la petición del responsable y usa HTTP para llamar a FastAPI. Esta integración no necesita instalar Ollama, procesar un rostro ni introducir credenciales S3 en el dispositivo.

## Contrato de la delegación

Todas las rutas siguientes requieren `X-Agent-Key`. La API compara su SHA-256 con el hash configurado y revalida que el dueño asociado siga activo y tenga rol ADMIN. Esa clave no autoriza las rutas administrativas con JWT, la creación de ADMIN, la consulta de usuarios preexistentes ni cambios de permisos.

| Método y ruta | Entrada y resultado |
| --- | --- |
| GET /api/v1/agent/connection | Comprueba la delegación y devuelve las acciones y roles permitidos. |
| POST /api/v1/agent/users | JSON con request_id, nombre, correo, contraseña, rol no administrativo y referencia de dentista si procede. Devuelve UserResponse. |
| GET /api/v1/agent/users/{id} | Consulta solo una cuenta creada por el mismo dueño mediante la delegación. |
| POST /api/v1/agent/users/{id}/profile-pic | JSON con request_id e image_path. Lee el adjunto real desde el ESP, lo valida y guarda; devuelve UserResponse con profile_pic. |

El esquema de foto `EspProfileUpload` recibe una ruta `/fatfs/inbox/...`, no una URL arbitraria. Solo el operador configura la dirección del dispositivo. Se rechazan recorridos `..`, rutas de otros directorios, extensiones ajenas, redirecciones y archivos de más de 2 MiB. El cliente de descarga no utiliza proxies del entorno.

## Campo de imagen en el esquema

User mantiene `profile_object_key` en la base. UserResponse incluye `profile_pic`, nulo antes de la carga y con esta estructura después:

```json
{
  "profile_pic": {
    "url": "/api/v1/users/ID_DEL_USUARIO/profile-pic",
    "content_type": "image/jpeg",
    "requires_auth": true
  }
}
```

La imagen binaria vive en MinIO. La URL es una ruta autenticada de FastAPI, no una URL pública del bucket. El usuario puede consultar su propia foto con su JWT; un ADMIN puede asignar y consultar fotos mediante `/users/{id}/profile-pic`. Otros usuarios reciben 403.

## Reintentos y recuperación

El agente genera un UUID por operación y conserva ese mismo `request_id` si debe reintentarla. AgentOperation guarda el tipo, el dueño, la cuenta y un HMAC de los argumentos. La contraseña de entrada no se conserva en esa tabla. Repetir la misma petición devuelve la cuenta sin duplicar efectos; reutilizar el UUID con otros datos produce 409.

En PostgreSQL se bloquea la fila del dueño para serializar sus operaciones. Una nueva foto se valida antes de guardar el objeto y la referencia se confirma junto con AgentOperation. Si falla el almacenamiento, no se registra la operación como terminada. Si falla la descarga de la foto, la cuenta creada previamente permanece y se reintenta solo la fotografía.

## Instalación y revocación

`configure_esp.py` autentica a un dueño existente, genera una clave nueva y escribe únicamente su hash en `.env`. La clave para el dispositivo queda en `.local/esp/connection.json`, excluida de Git. `install_esp.py` copia esa conexión y la habilidad nativa `esp/SKILL.md` al ESP indicado. Conserva los demás archivos del dispositivo y respalda archivos DentalRisk anteriores en `.local/esp/backup`.

`compose.esp.yaml` agrega un enlace a la IP LAN explícita de la computadora; conserva el enlace local y mantiene PostgreSQL y MinIO en loopback. Solo debe habilitarse dentro de la red de desarrollo. La interfaz HTTP y el almacenamiento de archivos del firmware deben mantenerse dentro de una red confiable. Producción requiere transporte protegido y control de acceso al dispositivo.

Para demostrar el primer uso con una base independiente vacía existe `prepare_esp_demo.py --create-demo-owner`. Genera una cuenta claramente identificada como prueba con contraseña aleatoria guardada en `.local/esp/demo-owner.json`; no sustituye cuentas existentes. Esa cuenta no pertenece a la aplicación clínica principal.

`verify_esp_hardware.py` envía peticiones en lenguaje natural al WebIM del ESP, adjunta una imagen sintética por el mismo mecanismo de su interfaz y verifica por separado la cuenta, AgentOperation y el objeto JPEG en PostgreSQL/MinIO. No crea la cuenta mediante una llamada HTTP directa del script. La conversación pública se guarda con credenciales redactadas y los registros privados de herramientas permanecen en `.local/`.
