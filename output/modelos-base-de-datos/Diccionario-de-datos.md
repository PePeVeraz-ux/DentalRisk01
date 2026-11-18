# Diccionario de datos de DentalRisk y Agente IA

**Corte del esquema:** 3 de noviembre de 2026. **Fuente:** `Modelos-relacionales.md`, generado del catálogo PostgreSQL. Las dos bases son independientes.

**Actualización del 9 de noviembre de 2026:** este diccionario conserva la fotografía anterior a la unión. La instalación local ya usa `dentalrisk` como base compartida y `users` como identidad única; `agent_users` fue migrada y retirada de la base compartida. Las diferencias vigentes y las rutas de acceso están en `docs/arquitectura/003-base-compartida.md`. No utilizar la sección de `dentalrisk_agent` como descripción del esquema actual.

Las descripciones explican el uso funcional de los campos. Los tipos, nulos, valores por defecto y restricciones proceden del esquema verificado. Un guion en «Defecto BD» significa que PostgreSQL no define un valor por defecto, aunque la aplicación pueda asignarlo. No se inventan límites que no estén expresados en el esquema. Este diccionario describe el OLTP implementado; aún no existe un esquema OLAP o de modelos ML.

**Convenciones:** PK = clave primaria; FK = clave foránea; UK = valor único; «Sí» en nulos indica que el campo es opcional en la base. Fechas `timestamp with time zone` se almacenan con zona horaria; la aplicación presenta la zona clínica.

## Base `dentalrisk`

### `appointments`

Citas programadas y su estado.

| Campo | Tipo PostgreSQL | Nulos | Clave | Defecto BD | Descripción |
|---|---|---|---|---|---|
| `id` | `text` | No | PK | — | Identificador único del registro. |
| `patient_id` | `text` | No | FK | — | Identificador del paciente relacionado. Relación con la tabla indicada en las restricciones. |
| `dentist_id` | `text` | No | FK | — | Identificador del dentista relacionado. Relación con la tabla indicada en las restricciones. |
| `service_id` | `text` | No | FK | — | Identificador del servicio relacionado. Relación con la tabla indicada en las restricciones. |
| `starts_at` | `timestamp with time zone` | No | — | — | Instante programado de inicio de la cita. |
| `ends_at` | `timestamp with time zone` | No | — | — | Instante programado de fin de la cita. |
| `status` | `text` | No | — | 'SCHEDULED'::text | Estado de la cita: programada, cancelada o atendida. |

**Restricciones e índices relevantes del esquema:**
- `CHECK ((ends_at > starts_at))`
- `CHECK ((status = ANY (ARRAY['SCHEDULED'::text, 'CANCELLED'::text, 'ATTENDED'::text])))`
- `FOREIGN KEY (dentist_id) REFERENCES dentists(id)`
- `FOREIGN KEY (patient_id) REFERENCES patients(id)`
- `FOREIGN KEY (service_id) REFERENCES services(id)`
- `PRIMARY KEY (id)`

### `assignments`

Historial de asignación y liberación de tarjetas.

| Campo | Tipo PostgreSQL | Nulos | Clave | Defecto BD | Descripción |
|---|---|---|---|---|---|
| `id` | `text` | No | PK | — | Identificador único del registro. |
| `attention_id` | `text` | No | FK | — | Identificador de la atención relacionada. Relación con la tabla indicada en las restricciones. |
| `card_id` | `text` | No | FK | — | Identificador de la tarjeta relacionada. Relación con la tabla indicada en las restricciones. |
| `assigned_at` | `timestamp with time zone` | No | — | now() | Instante en que se asignó la tarjeta. |
| `released_at` | `timestamp with time zone` | Sí | — | — | Instante de liberación de la tarjeta o asignación; vacío mientras sigue activa. |

**Restricciones e índices relevantes del esquema:**
- `FOREIGN KEY (attention_id) REFERENCES attentions(id)`
- `FOREIGN KEY (card_id) REFERENCES cards(id)`
- `PRIMARY KEY (id)`

### `attentions`

Atenciones operativas y marcas de tiempo RFID.

| Campo | Tipo PostgreSQL | Nulos | Clave | Defecto BD | Descripción |
|---|---|---|---|---|---|
| `id` | `text` | No | PK | — | Identificador único del registro. |
| `patient_id` | `text` | No | FK | — | Identificador del paciente relacionado. Relación con la tabla indicada en las restricciones. |
| `dentist_id` | `text` | No | FK | — | Identificador del dentista relacionado. Relación con la tabla indicada en las restricciones. |
| `service_id` | `text` | No | FK | — | Identificador del servicio relacionado. Relación con la tabla indicada en las restricciones. |
| `station_id` | `text` | No | FK | — | Identificador de la estación relacionada. Relación con la tabla indicada en las restricciones. |
| `shift_id` | `text` | No | FK | — | Identificador del turno relacionado. Relación con la tabla indicada en las restricciones. |
| `appointment_id` | `text` | Sí | FK | — | Identificador de la cita relacionada, si existe. Relación con la tabla indicada en las restricciones. |
| `card_id` | `text` | No | FK | — | Identificador de la tarjeta relacionada. Relación con la tabla indicada en las restricciones. |
| `price_cents` | `bigint` | No | — | — | Precio histórico del servicio al crear la atención, en centavos de MXN. |
| `status` | `text` | No | — | 'PENDING'::text | Estado de la atención: pendiente, en proceso, completada, cancelada o incidencia. |
| `started_at` | `timestamp with time zone` | Sí | — | — | Instante real de inicio de la atención. |
| `ended_at` | `timestamp with time zone` | Sí | — | — | Instante real de fin de la atención. |
| `released_at` | `timestamp with time zone` | Sí | — | — | Instante de liberación de la tarjeta o asignación; vacío mientras sigue activa. |
| `created_at` | `timestamp with time zone` | No | — | now() | Instante de creación del registro. |

**Restricciones e índices relevantes del esquema:**
- `CHECK (((ended_at IS NULL) OR ((started_at IS NOT NULL) AND (ended_at >= started_at))))`
- `CHECK (((status <> 'COMPLETED'::text) OR ((started_at IS NOT NULL) AND (ended_at IS NOT NULL))))`
- `CHECK ((price_cents >= 0))`
- `CHECK ((status = ANY (ARRAY['PENDING'::text, 'IN_PROGRESS'::text, 'COMPLETED'::text, 'CANCELLED'::text, 'INCIDENT'::text])))`
- `FOREIGN KEY (appointment_id) REFERENCES appointments(id)`
- `FOREIGN KEY (card_id) REFERENCES cards(id)`
- `FOREIGN KEY (dentist_id) REFERENCES dentists(id)`
- `FOREIGN KEY (patient_id) REFERENCES patients(id)`
- `FOREIGN KEY (service_id) REFERENCES services(id)`
- `FOREIGN KEY (shift_id) REFERENCES shifts(id)`
- `FOREIGN KEY (station_id) REFERENCES stations(id)`
- `PRIMARY KEY (id)`

### `audit`

Bitácora de operaciones del sistema clínico.

| Campo | Tipo PostgreSQL | Nulos | Clave | Defecto BD | Descripción |
|---|---|---|---|---|---|
| `id` | `text` | No | PK | — | Identificador único del registro. |
| `actor_id` | `text` | Sí | FK | — | Identificador del usuario que efectuó o causó la acción, si se conoce. Relación con la tabla indicada en las restricciones. |
| `action` | `text` | No | — | — | Nombre de la acción registrada en auditoría. |
| `entity_id` | `text` | Sí | — | — | Identificador lógico de la entidad afectada; no es FK. |
| `detail` | `jsonb` | No | — | '{}'::jsonb | Detalle estructurado de la acción de auditoría. |
| `created_at` | `timestamp with time zone` | No | — | now() | Instante de creación del registro. |

**Restricciones e índices relevantes del esquema:**
- `FOREIGN KEY (actor_id) REFERENCES users(id)`
- `PRIMARY KEY (id)`

### `calendar_days`

Días operados y descansos configurados por turno.

| Campo | Tipo PostgreSQL | Nulos | Clave | Defecto BD | Descripción |
|---|---|---|---|---|---|
| `id` | `text` | No | PK | — | Identificador único del registro. |
| `shift_id` | `text` | No | FK | — | Identificador del turno relacionado. Relación con la tabla indicada en las restricciones. |
| `day` | `date` | No | — | — | Fecha de calendario correspondiente al turno. |
| `operated` | `boolean` | No | — | — | Indica si el turno se considera operado ese día. |
| `breaks` | `jsonb` | No | — | '[]'::jsonb | Intervalos de descanso del turno en JSON. |

**Restricciones e índices relevantes del esquema:**
- `FOREIGN KEY (shift_id) REFERENCES shifts(id)`
- `PRIMARY KEY (id)`
- `UNIQUE (shift_id, day)`

### `cards`

Inventario de tarjetas RFID.

| Campo | Tipo PostgreSQL | Nulos | Clave | Defecto BD | Descripción |
|---|---|---|---|---|---|
| `id` | `text` | No | PK | — | Identificador único del registro. |
| `uid` | `text` | No | — | — | Identificador leído de la tarjeta RFID. |
| `status` | `text` | No | — | 'AVAILABLE'::text | Disponibilidad de la tarjeta: disponible, asignada o bloqueada. |

**Restricciones e índices relevantes del esquema:**
- `CHECK ((status = ANY (ARRAY['AVAILABLE'::text, 'ASSIGNED'::text, 'BLOCKED'::text])))`
- `PRIMARY KEY (id)`
- `UNIQUE (uid)`

### `dentists`

Catálogo de dentistas.

| Campo | Tipo PostgreSQL | Nulos | Clave | Defecto BD | Descripción |
|---|---|---|---|---|---|
| `id` | `text` | No | PK | — | Identificador único del registro. |
| `name` | `text` | No | — | — | Nombre visible de la entidad. |
| `specialty` | `text` | No | — | ''::text | Especialidad del dentista. |
| `active` | `boolean` | No | — | true | Indica si la entidad está habilitada. |

**Restricciones e índices relevantes del esquema:**
- `PRIMARY KEY (id)`

### `incidents`

Incidencias y correcciones de atenciones.

| Campo | Tipo PostgreSQL | Nulos | Clave | Defecto BD | Descripción |
|---|---|---|---|---|---|
| `id` | `text` | No | PK | — | Identificador único del registro. |
| `attention_id` | `text` | No | FK | — | Identificador de la atención relacionada. Relación con la tabla indicada en las restricciones. |
| `actor_id` | `text` | No | FK | — | Identificador del usuario que efectuó o causó la acción, si se conoce. Relación con la tabla indicada en las restricciones. |
| `kind` | `text` | No | — | — | Tipo de operación o incidencia. |
| `reason` | `text` | No | — | — | Motivo registrado para la incidencia o corrección. |
| `before_value` | `jsonb` | No | — | — | Valor anterior de la entidad, conservado como JSON. |
| `after_value` | `jsonb` | No | — | — | Valor posterior de la entidad, conservado como JSON. |
| `created_at` | `timestamp with time zone` | No | — | now() | Instante de creación del registro. |

**Restricciones e índices relevantes del esquema:**
- `FOREIGN KEY (actor_id) REFERENCES users(id)`
- `FOREIGN KEY (attention_id) REFERENCES attentions(id)`
- `PRIMARY KEY (id)`

### `login_attempts`

Control de intentos de acceso al sistema clínico.

| Campo | Tipo PostgreSQL | Nulos | Clave | Defecto BD | Descripción |
|---|---|---|---|---|---|
| `key` | `text` | No | PK | — | Clave derivada para agrupar intentos de acceso al sistema clínico. |
| `failures` | `integer` | No | — | 0 | Número de intentos fallidos registrados. |
| `blocked_until` | `timestamp with time zone` | Sí | — | — | Instante hasta el cual se bloquea el acceso, si aplica. |
| `updated_at` | `timestamp with time zone` | No | — | now() | Instante de la última actualización registrada. |

**Restricciones e índices relevantes del esquema:**
- `PRIMARY KEY (key)`

### `operation_mutex`

Fila técnica usada para serializar operaciones concurrentes.

| Campo | Tipo PostgreSQL | Nulos | Clave | Defecto BD | Descripción |
|---|---|---|---|---|---|
| `id` | `integer` | No | PK | — | Identificador fijo de la única fila de control; el esquema exige el valor 1. |

**Restricciones e índices relevantes del esquema:**
- `CHECK ((id = 1))`
- `PRIMARY KEY (id)`

### `patients`

Identificación mínima de pacientes para recepción.

| Campo | Tipo PostgreSQL | Nulos | Clave | Defecto BD | Descripción |
|---|---|---|---|---|---|
| `id` | `text` | No | PK | — | Identificador único del registro. |
| `name` | `text` | No | — | — | Nombre visible de la entidad. |
| `reference` | `text` | No | — | — | Referencia única del paciente usada en recepción. |
| `active` | `boolean` | No | — | true | Indica si la entidad está habilitada. |

**Restricciones e índices relevantes del esquema:**
- `PRIMARY KEY (id)`
- `UNIQUE (reference)`

### `rfid_events`

Eventos RFID procesados y respuesta conservada para reintentos.

| Campo | Tipo PostgreSQL | Nulos | Clave | Defecto BD | Descripción |
|---|---|---|---|---|---|
| `id` | `text` | No | PK | — | Identificador único del registro. |
| `station_id` | `text` | No | FK | — | Identificador de la estación relacionada. Relación con la tabla indicada en las restricciones. |
| `uid` | `text` | No | — | — | UID leído, incluso cuando no corresponde a una tarjeta conocida; no es FK. |
| `occurred_at` | `timestamp with time zone` | No | — | — | Instante del evento recibido. |
| `response` | `jsonb` | No | — | — | Respuesta estructurada conservada para devolverla ante reintentos. |

**Restricciones e índices relevantes del esquema:**
- `FOREIGN KEY (station_id) REFERENCES stations(id)`
- `PRIMARY KEY (id)`

### `schema_migrations`

Control técnico de versiones del esquema clínico.

| Campo | Tipo PostgreSQL | Nulos | Clave | Defecto BD | Descripción |
|---|---|---|---|---|---|
| `version` | `integer` | No | PK | — | Número de migración SQL aplicada. |
| `applied_at` | `timestamp with time zone` | No | — | now() | Instante en que se aplicó la migración del esquema. |

**Restricciones e índices relevantes del esquema:**
- `PRIMARY KEY (version)`

### `services`

Catálogo de servicios y precios.

| Campo | Tipo PostgreSQL | Nulos | Clave | Defecto BD | Descripción |
|---|---|---|---|---|---|
| `id` | `text` | No | PK | — | Identificador único del registro. |
| `name` | `text` | No | — | — | Nombre visible de la entidad. |
| `price_cents` | `bigint` | No | — | — | Precio en centavos de MXN; se evita la aritmética monetaria binaria. |
| `active` | `boolean` | No | — | true | Indica si la entidad está habilitada. |

**Restricciones e índices relevantes del esquema:**
- `CHECK ((price_cents >= 0))`
- `PRIMARY KEY (id)`
- `UNIQUE (name)`

### `sessions`

Sesiones web activas o revocables.

| Campo | Tipo PostgreSQL | Nulos | Clave | Defecto BD | Descripción |
|---|---|---|---|---|---|
| `token_hash` | `text` | No | PK | — | Hash del token o credencial persistida. |
| `user_id` | `text` | No | FK | — | Identificador de la cuenta titular de la sesión u operación. Relación con la tabla indicada en las restricciones. |
| `csrf` | `text` | No | — | — | Valor de protección contra solicitudes entre sitios de la sesión. |
| `expires_at` | `timestamp with time zone` | No | — | — | Instante de vencimiento de la sesión. |
| `operation_until` | `timestamp with time zone` | Sí | — | — | Instante hasta el cual dura el permiso operativo excepcional de la sesión, si existe. |

**Restricciones e índices relevantes del esquema:**
- `FOREIGN KEY (user_id) REFERENCES users(id)`
- `PRIMARY KEY (token_hash)`

### `shifts`

Definición semanal de turnos.

| Campo | Tipo PostgreSQL | Nulos | Clave | Defecto BD | Descripción |
|---|---|---|---|---|---|
| `id` | `text` | No | PK | — | Identificador único del registro. |
| `name` | `text` | No | — | — | Nombre visible de la entidad. |
| `weekday` | `integer` | No | — | — | Día de la semana codificado como entero. |
| `start_time` | `time without time zone` | No | — | — | Hora de inicio del turno. |
| `end_time` | `time without time zone` | No | — | — | Hora de fin del turno. |
| `active` | `boolean` | No | — | true | Indica si la entidad está habilitada. |

**Restricciones e índices relevantes del esquema:**
- `CHECK ((end_time > start_time))`
- `CHECK (((weekday >= 0) AND (weekday <= 6)))`
- `PRIMARY KEY (id)`

### `stations`

Estaciones que envían eventos RFID.

| Campo | Tipo PostgreSQL | Nulos | Clave | Defecto BD | Descripción |
|---|---|---|---|---|---|
| `id` | `text` | No | PK | — | Identificador único del registro. |
| `name` | `text` | No | — | — | Nombre visible de la entidad. |
| `token_hash` | `text` | Sí | — | — | Hash de la credencial de estación; vacío cuando no tiene una vigente. |
| `active` | `boolean` | No | — | true | Indica si la entidad está habilitada. |

**Restricciones e índices relevantes del esquema:**
- `PRIMARY KEY (id)`
- `UNIQUE (name)`

### `users`

Cuentas y roles del sistema clínico.

| Campo | Tipo PostgreSQL | Nulos | Clave | Defecto BD | Descripción |
|---|---|---|---|---|---|
| `id` | `text` | No | PK | — | Identificador único del registro. |
| `email` | `text` | No | — | — | Correo electrónico de acceso de la cuenta. |
| `name` | `text` | No | — | — | Nombre visible de la entidad. |
| `password_hash` | `text` | No | — | — | Hash de la contraseña; no contiene la contraseña en claro. |
| `role` | `text` | No | — | — | Rol de autorización de la cuenta. |
| `dentist_id` | `text` | Sí | FK | — | Dentista vinculado a la cuenta; obligatorio cuando el rol es DENTIST. Relación con la tabla indicada en las restricciones. |
| `active` | `boolean` | No | — | true | Indica si la entidad está habilitada. |

**Restricciones e índices relevantes del esquema:**
- `CHECK (((role <> 'DENTIST'::text) OR (dentist_id IS NOT NULL)))`
- `CHECK ((role = ANY (ARRAY['ADMIN'::text, 'RECEPTION'::text, 'DENTIST'::text, 'SUPPORT'::text])))`
- `FOREIGN KEY (dentist_id) REFERENCES dentists(id)`
- `PRIMARY KEY (id)`
- `UNIQUE (email)`

### `weekly_reports`

Reporte semanal materializado.

| Campo | Tipo PostgreSQL | Nulos | Clave | Defecto BD | Descripción |
|---|---|---|---|---|---|
| `week_start` | `date` | No | PK | — | Fecha inicial de la semana resumida. |
| `payload` | `jsonb` | No | — | — | Datos agregados del reporte semanal en JSON. |
| `generated_at` | `timestamp with time zone` | No | — | now() | Instante en que se generó el reporte. |

**Restricciones e índices relevantes del esquema:**
- `PRIMARY KEY (week_start)`

## Base `dentalrisk_agent`

### `agent_audit`

Bitácora del servicio Agente IA.

| Campo | Tipo PostgreSQL | Nulos | Clave | Defecto BD | Descripción |
|---|---|---|---|---|---|
| `id` | `character varying` | No | PK | — | Identificador único del registro. |
| `actor_id` | `character varying` | Sí | FK | — | Identificador del usuario que efectuó o causó la acción, si se conoce. Relación con la tabla indicada en las restricciones. |
| `action` | `character varying(64)` | No | — | — | Nombre de la acción registrada en auditoría. |
| `entity_id` | `character varying` | Sí | — | — | Identificador lógico de la entidad afectada; no es FK. |
| `created_at` | `timestamp with time zone` | No | — | — | Instante de creación del registro. |

**Restricciones e índices relevantes del esquema:**
- `FOREIGN KEY (actor_id) REFERENCES agent_users(id)`
- `PRIMARY KEY (id)`

### `agent_login_attempts`

Control de intentos de acceso al servicio Agente IA.

| Campo | Tipo PostgreSQL | Nulos | Clave | Defecto BD | Descripción |
|---|---|---|---|---|---|
| `key` | `character varying` | No | PK | — | Clave derivada para agrupar intentos de acceso al agente. |
| `failures` | `integer` | No | — | — | Número de intentos fallidos registrados. |
| `blocked_until` | `timestamp with time zone` | Sí | — | — | Instante hasta el cual se bloquea el acceso, si aplica. |

**Restricciones e índices relevantes del esquema:**
- `PRIMARY KEY (key)`

### `agent_operations`

Registro de operaciones delegadas e idempotencia del agente.

| Campo | Tipo PostgreSQL | Nulos | Clave | Defecto BD | Descripción |
|---|---|---|---|---|---|
| `id` | `character varying` | No | PK | — | Identificador de solicitud usado para evitar duplicar una operación delegada. |
| `owner_id` | `character varying` | No | FK | — | Identificador del administrador que delegó la operación al agente. Relación con la tabla indicada en las restricciones. |
| `user_id` | `character varying` | No | FK | — | Identificador de la cuenta titular de la sesión u operación. Relación con la tabla indicada en las restricciones. |
| `kind` | `character varying(32)` | No | — | — | Tipo de operación o incidencia. |
| `request_hash` | `character varying` | No | — | — | Huella del contenido de una petición delegada para comprobar reintentos. |
| `created_at` | `timestamp with time zone` | No | — | — | Instante de creación del registro. |

**Restricciones e índices relevantes del esquema:**
- `FOREIGN KEY (owner_id) REFERENCES agent_users(id)`
- `FOREIGN KEY (user_id) REFERENCES agent_users(id)`
- `PRIMARY KEY (id)`

### `agent_sessions`

Sesiones JWT persistidas para poder revocarlas.

| Campo | Tipo PostgreSQL | Nulos | Clave | Defecto BD | Descripción |
|---|---|---|---|---|---|
| `token_hash` | `character varying` | No | PK | — | Hash del token o credencial persistida. |
| `user_id` | `character varying` | No | FK | — | Identificador de la cuenta titular de la sesión u operación. Relación con la tabla indicada en las restricciones. |
| `expires_at` | `timestamp with time zone` | No | — | — | Instante de vencimiento de la sesión. |

**Restricciones e índices relevantes del esquema:**
- `FOREIGN KEY (user_id) REFERENCES agent_users(id)`
- `PRIMARY KEY (token_hash)`

### `agent_users`

Cuentas del servicio Agente IA.

| Campo | Tipo PostgreSQL | Nulos | Clave | Defecto BD | Descripción |
|---|---|---|---|---|---|
| `id` | `character varying` | No | PK | — | Identificador único del registro. |
| `name` | `character varying(120)` | No | — | — | Nombre visible de la entidad. |
| `email` | `character varying(254)` | No | UK | — | Correo electrónico de acceso de la cuenta. |
| `password_hash` | `character varying` | No | — | — | Hash de la contraseña; no contiene la contraseña en claro. |
| `role` | `character varying(16)` | No | — | — | Rol del usuario del servicio Agente IA. |
| `dentist_id` | `character varying(64)` | Sí | — | — | Referencia lógica externa al dentista de DentalRisk; no es FK entre bases. |
| `active` | `boolean` | No | — | — | Indica si la entidad está habilitada. |
| `profile_object_key` | `character varying` | Sí | — | — | Clave del objeto de imagen almacenado en MinIO, si existe. |
| `created_at` | `timestamp with time zone` | No | — | — | Instante de creación del registro. |

**Restricciones e índices relevantes del esquema:**
- `CHECK ((((role)::text <> 'DENTIST'::text) OR (dentist_id IS NOT NULL)))`
- `CHECK (((role)::text = ANY ((ARRAY['ADMIN'::character varying, 'RECEPTION'::character varying, 'DENTIST'::character varying, 'SUPPORT'::character varying])::text[])))`
- `PRIMARY KEY (id)`
- `CREATE UNIQUE INDEX agent_users_pkey ON public.agent_users USING btree (id)`
- `CREATE UNIQUE INDEX ix_agent_users_email ON public.agent_users USING btree (email)`

### `alembic_version`

Control técnico de la versión de migración Alembic.

| Campo | Tipo PostgreSQL | Nulos | Clave | Defecto BD | Descripción |
|---|---|---|---|---|---|
| `version_num` | `character varying(32)` | No | PK | — | Identificador de revisión Alembic aplicada. |

**Restricciones e índices relevantes del esquema:**
- `PRIMARY KEY (version_num)`

## Límites y reglas de interpretación

- `agent_users.dentist_id` es una referencia lógica al otro sistema, sin FK entre bases.
- `profile_object_key` apunta a MinIO; el contenido de la imagen no está en PostgreSQL.
- `rfid_events.uid` no es FK a `cards.uid`, para admitir y registrar lecturas desconocidas.
- `audit.entity_id` y `agent_audit.entity_id` son referencias lógicas, sin FK.
- Las reglas de unicidad parcial, claves compuestas y comprobaciones se reproducen desde el modelo; no debe interpretarse una FK como relación entre bases.
