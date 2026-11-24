# Asistente Denti dentro de DentalRisk

El dueño puede abrir **Asistente Denti** desde la navegación de DentalRisk. La interfaz utiliza la misma sesión web y queda disponible únicamente al rol ADMIN; el ESP32 no es requisito para usarla.

## Flujo de una conversación

1. El navegador envía el historial reciente a POST /api/v1/assistant/chat usando la sesión DentalRisk y su token CSRF.
2. La API comprueba rol, sesión, origen y límite de solicitudes antes de comunicarse con el proveedor de IA.
3. El modelo puede pedir una de las herramientas permitidas: leer rendimiento agregado o proponer el alta de un paciente.
4. La API consulta PostgreSQL con SQL parametrizado; el modelo nunca recibe conexión SQL.
5. La respuesta vuelve al chat. Para crear un paciente, el dueño debe confirmar una tarjeta de revisión; sin esa confirmación no se escribe en la base.

POST /api/v1/assistant/patients/confirm acepta la confirmación dentro de la misma sesión y registra una auditoría. La propuesta vence a los cinco minutos y solo puede confirmarla el dueño que la generó. El alta comprueba coincidencias de nombre de nuevo y genera folio si no se proporcionó.

## Proveedor de IA

La API usa un endpoint compatible con OpenAI Chat Completions. Configurar estas variables en el archivo .env del proceso de DentalRisk:

| Variable | Uso |
| --- | --- |
| AGENT_CHAT_BASE_URL | URL base del proveedor, por ejemplo una URL que termine en /v1; también admite la ruta completa /chat/completions. |
| AGENT_CHAT_MODEL | Nombre del modelo que ofrece el proveedor. |
| AGENT_CHAT_API_KEY | Clave privada del proveedor; se queda en el servidor y nunca se entrega al navegador. |

Para un proveedor remoto, se exige HTTPS y una clave. Para un motor local en localhost, se permite HTTP y una clave es opcional. Si falta configuración, el endpoint devuelve un error claro de servicio no configurado y la pantalla lo presenta al usuario.

El proveedor recibe los mensajes recientes del dueño y, cuando se consulta rendimiento, los datos agregados de la herramienta. Si se usa un proveedor remoto, revisar primero sus condiciones de privacidad; para mantener los datos dentro de la computadora, configurar un endpoint local compatible.

## Límites del agente

- Las respuestas de rendimiento incluyen atenciones completadas, pacientes distintos, minutos promedio y valor registrado de servicios por dentista.
- Los datos agregados no contienen identificadores ni nombres de pacientes. El valor de servicios no representa cobros ni utilidad.
- Las operaciones disponibles están limitadas a esas consultas y a proponer un alta. No hay SQL generado por el modelo.
- La creación de paciente exige confirmación del dueño y queda auditada.
- El chat web todavía no permite subir o asociar una fotografía. La foto privada continúa disponible únicamente en el flujo ya existente del ESP.
- Las propuestas de alta se mantienen en memoria del proceso durante cinco minutos; esta implementación requiere una instancia de API para conservar la confirmación pendiente.
- El ESP sigue siendo una interfaz adicional independiente. Su conexión de red se verifica por separado.

## Estado de configuración local

La integración de interfaz y API queda preparada, pero en la revisión actual no existen AGENT_CHAT_BASE_URL, AGENT_CHAT_MODEL ni AGENT_CHAT_API_KEY configurados. Hasta agregar un proveedor, la pantalla se abre pero no generará respuestas.
