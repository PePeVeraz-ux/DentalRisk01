---
{
  "name": "dentalrisk",
  "description": "Conectar con DentalRisk, consultar rendimiento por dentista, registrar pacientes, crear usuarios y guardar fotos privadas.",
  "metadata": {"cap_groups": ["cap_files", "cap_http_request"]}
}
---

# DentalRisk

Utiliza esta habilidad cuando el usuario pida conectarse a DentalRisk, consultar actividad o rendimiento, registrar un paciente, dar de alta una cuenta o guardar una foto de perfil. Lee `/fatfs/dentalrisk/connection.json` con la herramienta de archivos para obtener `api_base_url` y `headers`. No reveles esas cabeceras, claves ni contraseñas. No uses credenciales de MinIO.

1. Conecta con `http_request`: GET `{api_base_url}/api/v1/agent/connection`, usando `headers` de la configuración y `max_body_bytes` de 8192. Confirma conexión solo con HTTP 200 y `connected=true`.
2. Para crear una cuenta, pide nombre, correo, contraseña inicial y rol. Genera un UUID como `request_id`. POST `{api_base_url}/api/v1/agent/users`. Agrega `Content-Type: application/json` a las cabeceras. `body` es una CADENA que contiene el JSON de `request_id`, `name`, `email`, `password`, `role`. Roles permitidos: RECEPTION, DENTIST o SUPPORT. DENTIST requiere `dentist_id` proporcionado por el responsable. No inventes datos personales ni IDs del servidor. No puedes crear ADMIN.
3. Conserva el `id` real devuelto. Al recibir la foto, usa la ruta REAL del adjunto `/fatfs/inbox/...jpg`, `.jpeg`, `.png` o `.webp`. No describas la imagen, no inventes base64 y no construyas multipart.
4. POST `{api_base_url}/api/v1/agent/users/{id}/profile-pic` con las mismas cabeceras y `body` JSON como cadena con un nuevo UUID `request_id` e `image_path` igual a la ruta real. La API descargará la imagen del ESP y la almacenará en MinIO. No envíes una URL arbitraria ni el token de Telegram.
5. Confirma éxito solo con HTTP 200 y `profile_pic` no nulo. Si hay fallo, informa el código sin afirmar que la imagen quedó guardada. La cuenta puede existir aunque su foto todavía no esté cargada.
6. Verifica con GET `{api_base_url}/api/v1/agent/users/{id}`. La respuesta incluye `profile_pic.url` como ruta autenticada; nunca prometas que esa imagen es pública.
7. Para consultar actividad, confirma primero que `read_clinical_records` aparece en `actions` de `/connection`. Usa GET `{api_base_url}/api/v1/agent/clinical/summary` para conteos por estado. Para registros, GET `{api_base_url}/api/v1/agent/clinical/records?kind=attentions&limit=50` o `kind=appointments`. Respeta `limit` y `offset`; no intentes consultar tablas ni construir SQL.
8. Para responder rendimiento por dentista, confirma que `read_clinical_performance` aparece en `actions` y usa GET `{api_base_url}/api/v1/agent/clinical/performance`. Obtén `clinic_timezone` de `/connection`; convierte los límites que pida el usuario a timestamps ISO 8601 con offset en esa zona. `end_at` es exclusivo. Si no especifica periodo, aclara que el endpoint devuelve todo el historial. Usa únicamente atenciones completadas: `revenue_cents` representa el valor registrado de servicios, no pagos cobrados. Expresa MXN dividiendo centavos entre 100. La respuesta incluye dentistas sin actividad y no revela identidades de pacientes. Busca el nombre exacto si preguntan por alguien en particular; pide aclaración si hay ambigüedad. No afirmes rentabilidad porque no incluye costos, ni inventes diagnósticos, cobros o predicciones.
9. Para registrar un paciente, confirma que `create_patient` aparece en `/connection`. Pide el nombre y el folio si ya existe; el folio es opcional y DentalRisk puede generar uno. POST `{api_base_url}/api/v1/agent/patients` con un `request_id` UUID, `name` y el `reference` solo si lo proporcionaron. Conserva el `id` y folio devueltos. Si hay 409 por coincidencia de nombre, pide que revisen Recepción y, solo tras confirmar que es otra persona, reintenta con `confirm_distinct_name: true` y un UUID nuevo. No vincules al paciente existente.
10. Para agregar su foto, usa la ruta real del archivo adjunto del ESP y POST `{api_base_url}/api/v1/agent/patients/{id}/profile-pic` con un UUID nuevo e `image_path`. Reutiliza el mismo UUID en reintentos. Confirma la foto solo si la API devuelve `profile_pic`; es privada y no debe describirse como URL pública. GET `{api_base_url}/api/v1/agent/patients/{id}` permite verificar el registro.

Mantén el mismo `request_id` cuando reintentes una operación idéntica. Usa uno distinto para otra cuenta o una foto nueva. Ante 409 no te apropies de una cuenta existente: pide aclaración. Ante 401, 403 o 503, informa que hay que revisar la configuración. Si no sabes a qué usuario corresponde una foto, pregunta antes de asignarla. No incluyas contraseñas ni claves en la respuesta final ni en memorias.
