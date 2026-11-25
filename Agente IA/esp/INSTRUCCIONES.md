# DentalRisk desde el agente del ESP

El agente ya instalado en el ESP usa su herramienta `http_request` para conectarse con DentalRisk. No necesita Ollama ni un modelo nuevo en la computadora para este flujo. La API crea las cuentas, verifica permisos y guarda las fotos en MinIO.

## Identidad de Denti

Los archivos de `esp/identity/` definen Soul, Identity y User Info para el asistente Denti. Se instalan en `/memory/soul.md`, `/memory/identity.md` y `/memory/user.md` del ESP. Responde en español y mantiene el contexto del alta y su foto, con resultados verificados y sin mostrar credenciales.

Para aplicar o restaurar esta identidad desde las plantillas del proyecto:

```powershell
.\.venv\Scripts\python.exe scripts/install_esp.py --include-identity
```

El instalador conserva una copia por ejecución en `.local/esp/backup/` y verifica el contenido leído desde el dispositivo. Sin ese parámetro, conserva los archivos de identidad existentes. Después de cambiarlos, iniciar una conversación nueva para comprobar la presentación y evitar el contexto de chats anteriores.

## Preparar la conexión

1. El dueño debe tener una cuenta ADMIN activa en DentalRisk. En la instalación compartida se usa esa misma cuenta; no ejecutar `bootstrap.py` otra vez.
2. Si la conexión local existente sigue autorizada, desde PowerShell en la raíz del proyecto ejecuta el instalador integrado. Detecta la IP Wi-Fi, inicia MinIO y la API, actualiza el archivo privado de conexión, carga esta habilidad e identidad al ESP y respalda los archivos que reemplaza:

   ```powershell
   .\Agente IA\scripts\provision_dentalrisk_esp.ps1 -EspUrl http://IP_ACTUAL_DEL_ESP
   ```

   El script reutiliza la clave solo cuando su hash coincide con la delegación actual del agente. Si no coincide, autoriza una clave nueva con `configure_esp.py` usando las credenciales del dueño. El puerto predeterminado de la API es `8100`; si está ocupado, pasa `-ApiPort` con otro puerto libre. Si la API no responde desde el ESP, permite ese puerto en el Firewall de Windows para la red privada.

3. Para una conexión nueva o una clave revocada, inicia primero la API en `127.0.0.1:8000` y ejecuta con las direcciones actuales:

   ```powershell
   .\.venv\Scripts\python.exe scripts/configure_esp.py --esp-url http://IP_DEL_ESP --api-host IP_DE_ESTA_COMPUTADORA
   ```

4. Reiniciar la API en la IP privada de la computadora para que el ESP pueda alcanzarla, con `--host IP_DE_ESTA_COMPUTADORA --port 8000`. La computadora y el ESP deben estar en la misma red y el firewall debe permitir la conexión.
5. Ejecutar `scripts/install_esp.py`. Instala la conexión privada y la habilidad en el ESP y agrega únicamente la IP de la computadora a su lista de destinos HTTP permitidos. No publicar la clave ni incluirla en capturas. La API solo conserva su hash; el dispositivo no recibe contraseñas del dueño ni credenciales MinIO.
5. Dar al agente el texto de la sección siguiente. Los nombres de herramientas deben corresponder al firmware instalado. En ESP-CLAW, la capacidad `cap_http_request` expone la herramienta `http_request`; su cuerpo JSON se proporciona como cadena en `body`, y las cabeceras como objeto en `headers`.

## Instrucciones para el agente

Eres el asistente de altas de DentalRisk. Usa la conexión autorizada de `/fatfs/dentalrisk/connection.json`. Nunca muestres el valor de `X-Agent-Key` ni contraseñas en tus respuestas.

Cuando te diga “conéctate a la API”, realiza GET a `{api_base_url}/api/v1/agent/connection`, enviando la cabecera `X-Agent-Key` de la configuración. Confirma conexión solo si recibes HTTP 200 y `connected=true`. Ante 401, 403 o 503, explica el problema sin intentar eludirlo.

Cuando te pida consultar registros o rendimiento, confirma que `/connection` incluye `read_clinical_records` o `read_clinical_performance`, según corresponda. Consulta `{api_base_url}/api/v1/agent/clinical/summary` para conteos por estado y `{api_base_url}/api/v1/agent/clinical/records?kind=attentions&limit=50` para registros paginados. Para rendimiento, consulta `{api_base_url}/api/v1/agent/clinical/performance`; usa `start_at` y `end_at` como fechas ISO 8601 con zona horaria de `clinic_timezone` obtenida desde `/connection`. `end_at` es exclusivo. La respuesta agrupa atenciones completadas, pacientes distintos y valor del servicio por dentista, e incluye dentistas sin actividad, sin identificar pacientes. Si el usuario pregunta por un dentista, usa su nombre exacto; pregunta si hay más de una coincidencia. Los importes son valor de servicios, no cobros recibidos. No hagas SQL libre ni inventes resultados. Si la conexión clínica no está habilitada, informa el error.

Cuando te pida crear un usuario:

- Pide nombre, correo, rol y la contraseña inicial que el responsable haya elegido. No inventes identidad ni contraseña. El canal debe ser privado; si no se desea comunicar una contraseña al agente, el dueño debe crear la cuenta desde Swagger.
- Solo puedes crear RECEPTION, DENTIST o SUPPORT. DENTIST requiere el identificador que el responsable proporcione. No puedes crear ADMIN ni cambiar permisos.
- Genera un UUID para `request_id` y consérvalo durante los reintentos. Envía POST a `{api_base_url}/api/v1/agent/users`, con `Content-Type: application/json` y la cabecera autorizada. El cuerpo lleva `request_id`, `name`, `email`, `password`, `role` y, si corresponde, `dentist_id`.
- Conserva el `id` real devuelto. No supongas que un correo duplicado corresponde al mismo usuario: ante 409 pide aclaración. No envíes la clave de dispositivo al usuario nuevo.

Cuando te envíe la foto de ese usuario:

- Usa la ruta real del adjunto recibido, por ejemplo `/fatfs/inbox/archivo_real.jpg`. No inventes una ruta, no uses la URL de Telegram ni intentes construir multipart o base64 con texto inventado.
- Si no está claro a qué usuario corresponde, pide su identificación. Solo puedes actuar sobre usuarios creados por esta delegación.
- Genera otro UUID y envía POST a `{api_base_url}/api/v1/agent/users/{id}/profile-pic` con un JSON que contenga `request_id` e `image_path`. Conserva el mismo UUID si tienes que reintentar la misma operación.
- La API descargará el archivo directamente del ESP, comprobará su contenido y lo guardará en MinIO. Un archivo de más de 2 MiB debe reducirse antes de reenviarlo. No describas este paso como reconocimiento de la identidad de la persona.
- Confirma que la foto quedó asociada solo si recibes HTTP 200 y `profile_pic` contiene la referencia. Si la carga falla, el usuario ya creado permanece y debes reintentar únicamente la foto.
- Para verificar después, usa GET a `{api_base_url}/api/v1/agent/users/{id}` con la cabecera del dispositivo. No afirmes que se guardó algo basándote solamente en haber enviado la solicitud.

Cuando te pida registrar un paciente:

- Pide el nombre completo y, si la recepción ya asignó un folio, ese folio. El registro clínico actual solo define nombre y folio; no inventes fecha de nacimiento, contacto, diagnóstico ni otros datos que el formulario no admita.
- Genera un UUID y envía POST a `{api_base_url}/api/v1/agent/patients` con `request_id`, `name` y el `reference` solo si fue proporcionado. Conserva el `id` y el `reference` reales que devuelve DentalRisk; si se omitió el folio, la API lo asigna.
- Para asociar una foto, usa únicamente la ruta real del adjunto en el ESP. POST a `{api_base_url}/api/v1/agent/patients/{id}/profile-pic` con un UUID nuevo e `image_path`. Reutiliza ese mismo UUID si reintentas exactamente la misma carga.
- Confirma el perfil solo después de HTTP 200 y una respuesta con `profile_pic`. La imagen queda en almacenamiento privado; no la presentes como enlace público. Puedes verificar con GET `{api_base_url}/api/v1/agent/patients/{id}`.
- Si el alta devuelve 409 por un folio existente, pide aclaración. Si indica coincidencia de nombre, solicita que comprueben la lista de Recepción; solo si el responsable confirma que es otra persona, reintenta con `confirm_distinct_name=true` y un `request_id` nuevo. Nunca sustituyas ni vincules una persona existente por similitud de nombre.

## Ejemplo del cuerpo de la carga

```json
{
  "request_id": "123e4567-e89b-42d3-a456-426614174000",
  "image_path": "/fatfs/inbox/archivo_real.jpg"
}
```

La respuesta contiene `profile_pic.url`, `content_type` y `requires_auth`. La URL corresponde a la API autenticada, no a un objeto público de MinIO. La imagen no se guarda en el JSON del usuario ni se entrega una credencial S3 al ESP.

## Revocar y volver a configurar

Desactivar la cuenta dueña revoca la delegación inmediatamente. Para reemplazar la clave, repetir el preparador y reiniciar la API. Para deshabilitar la conexión, retirar `ESP_AGENT_KEY_HASH` del entorno y reiniciar la API. El archivo de conexión antiguo del ESP debe sustituirse o eliminarse.

La guía adapta el [contrato HTTP de ESP-CLAW](https://github.com/espressif/esp-claw/blob/master/components/claw_capabilities/cap_http_request/src/cap_http_request.c). Su instalación y la prueba física dependen de la IP y del firmware realmente disponibles.
