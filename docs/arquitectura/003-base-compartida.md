# Base compartida con el Agente IA

**Aplicado en la instalación local el 9 de noviembre de 2026 (America/Tijuana).**

DentalRisk y Agente IA apuntan a una única base PostgreSQL `dentalrisk`. La tabla `users` es la identidad común. `agent_users` dejó de existir en la base compartida después de la migración 004; la base antigua `dentalrisk_agent` se conservó sin modificar. La tabla clínica `users` añadió `created_at` y `profile_object_key`. Las tablas `agent_sessions`, `agent_login_attempts`, `agent_audit` y `agent_operations` siguen separando la seguridad y la trazabilidad del agente, y sus referencias a usuarios apuntan a `users`.

El servicio web mantiene sesiones opacas con cookie y CSRF. El agente usa JWT revocables para usuarios y `X-Agent-Key` para la delegación del ESP. Un cambio de contraseña, rol o estado en `users` revoca también las sesiones JWT del agente. El rol PostgreSQL del agente tiene permisos de escritura en `users` y en sus tablas técnicas; solo lectura en `dentists`, `services`, `appointments` y `attentions`. Las rutas del agente aplican autorización adicional y no aceptan SQL generado por el modelo.

## Consultas permitidas

| Ruta | Autenticación | Alcance |
| --- | --- | --- |
| `GET /api/v1/clinical/records?kind=attentions` | JWT de usuario | Administración y recepción: clínica; dentista: solo sus registros; soporte: 403. |
| `GET /api/v1/clinical/records?kind=appointments` | JWT de usuario | Mismas reglas. |
| `GET /api/v1/clinical/summary` | JWT de usuario | Conteos de atenciones por estado según el perfil. |
| `GET /api/v1/agent/clinical/records` | `X-Agent-Key` y dueño activo | Actividad operativa paginada bajo la delegación. |
| `GET /api/v1/agent/clinical/summary` | `X-Agent-Key` y dueño activo | Conteos operativos bajo la delegación. |

Los registros expuestos incluyen IDs de atención o cita, dentista, servicio, estado y tiempos. No incluyen nombre, referencia ni ID del paciente. El agente no puede modificar citas, atenciones o tarjetas mediante estas rutas.

## Migración y verificación

`Agente IA/scripts/merge_with_clinic.py` generó dos respaldos `pg_dump` en `.local/backups/`, copió y comparó las tablas del origen y aplicó Alembic 004. El origen tenía cero cuentas, sesiones y operaciones; la clínica conservó sus cuatro cuentas existentes. El script cambió únicamente el `DATABASE_URL` del `.env` privado del agente y activó el conector clínico. Conservó el `.env` previo en `Agente IA/.local/`.

`Agente IA/scripts/verify_shared_migration.py` verificó la migración en una base desechable con un usuario y una sesión. `Agente IA/scripts/verify_shared_live.py` comprueba en solo lectura la base compartida y los permisos. Las pruebas de rutas verifican aislamiento de dentista, exclusión de soporte y ausencia de datos de paciente.

`Agente IA/scripts/verify_shared_stack.py` creó otra base temporal con ambos esquemas: una cuenta creada por FastAPI inició sesión en Fastify y una creada con el hash Argon2 de Fastify inició sesión en FastAPI, ambas como RECEPTION (HTTP 200). Python normaliza el orden de parámetros del hash de Node al verificar; no modifica los hashes almacenados. La base temporal se eliminó al terminar.

La consulta local de verificación encontró cuatro cuentas, cero atenciones y cero citas. Los endpoints están disponibles, pero sus listados permanecen vacíos hasta que la clínica registre operaciones.

## Límite actual

La delegación anterior del ESP conserva un `owner_id` que no pertenece a la tabla compartida y, por tanto, recibe 403. Debe volver a vincularse con `Agente IA/scripts/configure_esp.py`, autenticando al dueño actual y transfiriendo la nueva conexión privada al dispositivo. No se reasignó automáticamente una clave antigua a una cuenta clínica. El Compose aislado del agente sigue siendo de demostración; aún falta preparar y comprobar un despliegue conjunto de producción.

El diccionario de datos generado el 3 de noviembre describe el esquema anterior a esta unión. Este documento registra las diferencias de la migración 004; el diccionario deberá regenerarse si se entrega como descripción del esquema vigente.
