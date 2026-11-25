# DentalRisk Agente IA

Servicio FastAPI al que se conecta el agente del ESP para crear usuarios y pacientes, guardar sus fotos de perfil en MinIO privado y consultar registros operativos autorizados de DentalRisk.

El agente ya instalado en el ESP interpreta las solicitudes. La API ejecuta las operaciones autorizadas, protege las contraseñas con Argon2id y conserva las fotos en MinIO privado. En la instalación local comparte PostgreSQL `dentalrisk`: las altas de personal se integran con la tabla `users` y las de pacientes con la tabla clínica `patients`. El agente registra qué pacientes creó la delegación para limitar la lectura y edición de sus fotos. No realiza diagnósticos ni inferencia clínica.

**Documento para la asignación:** [Primer entregable](docs/ENTREGABLE-01.md).

## Pedírselo al agente del ESP

[Configuración e instrucciones completas](esp/INSTRUCCIONES.md). Se instala una habilidad nativa `dentalrisk` y un archivo privado de conexión en el ESP. Una vez configurado, el recorrido es:

1. “Conéctate a la API DentalRisk”.
2. “Registra este paciente”, proporcionando el nombre y, si ya existe, el folio. El agente devuelve el folio generado cuando se omite.
3. Enviar una foto y pedir que la asocie al perfil del paciente.
4. “Crea este usuario”, proporcionando nombre, correo, rol y contraseña inicial elegida.

Para pacientes, pide al agente registrar el nombre y un folio existente si lo hay; el folio puede generarse si se omite. Después adjunta la foto y solicita asociarla al paciente creado. La foto queda privada y solo puede leerse mediante la API autorizada.

El agente envía JSON con la ruta real del adjunto. La API descarga la imagen del ESP, la guarda en MinIO privado y devuelve `profile_pic`. La credencial del dispositivo permite crear cuentas no administrativas y pacientes, gestionar los pacientes que dio de alta la delegación y consultar el rendimiento agregado de dentistas. Los reintentos usan `request_id` y no duplican altas ni fotos.

## Ejecutar en Windows

En esta instalación compartida, iniciar primero PostgreSQL desde la carpeta superior (`npm run db:start`). Desde esta carpeta, con Python 3.12 y MinIO disponible:

```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements.lock.txt
docker compose up -d --wait minio
.\.venv\Scripts\python.exe scripts/provision_storage.py
.\.venv\Scripts\python.exe scripts/verify_shared_live.py
.\.venv\Scripts\python.exe -m uvicorn main:create_app --factory --host 127.0.0.1 --port 8000
```

Abrir [Swagger](http://127.0.0.1:8000/docs). Iniciar con una cuenta existente de DentalRisk. En **Authorize**, el campo `username` recibe el correo completo. El token autoriza las rutas protegidas durante 30 minutos y puede revocarse antes. Si la delegación anterior del ESP apunta a un dueño de la base antigua, volver a configurarla con `scripts/configure_esp.py` y las credenciales actuales del dueño; el script reemplaza la clave anterior.

Para pasar la habilidad de este proyecto al ESP conectado, desde la raíz `DENTALRISK` ejecuta `.\Agente IA\scripts\provision_dentalrisk_esp.ps1 -EspUrl http://IP_DEL_ESP`. El script detecta la IP Wi-Fi de la computadora, inicia MinIO y la API en un puerto libre, conserva la clave si coincide con el hash delegado y respalda los archivos que reemplaza. El puerto predeterminado es 8100; usa `-ApiPort` para cambiarlo.

La API usa PostgreSQL mediante `postgresql+psycopg://`. En este equipo, su `.env` apunta a la base clínica compartida `dentalrisk` del puerto 5432; iniciarla desde la carpeta principal con `npm run db:start`. La tabla `users` es la identidad común y las tablas `agent_*` guardan las sesiones, auditoría y operaciones propias del agente. La base anterior `dentalrisk_agent` y los respaldos previos a la unión se conservan. No ejecutar `scripts/bootstrap.py` en la base compartida: la cuenta administradora ya existe. SQLite solo se permite en pruebas con `ENVIRONMENT=test`.

`GET /api/v1/clinical/records?kind=attentions|appointments` devuelve registros paginados sin identidad de pacientes; `GET /api/v1/clinical/summary` devuelve conteos por estado. El dentista solo ve sus propios registros y soporte recibe 403. Para el ESP hay rutas equivalentes bajo `/api/v1/agent/clinical/`, protegidas con la clave delegada y el dueño activo. `GET /api/v1/agent/clinical/performance` agrega atenciones completadas, pacientes distintos y valor de servicios por dentista; acepta límites ISO 8601 con zona (`start_at`, `end_at`) y el límite final es exclusivo. Los importes son valor de servicios y no pagos cobrados. El agente no recibe acceso SQL libre. La conexión se habilita mediante `CLINICAL_CONNECTOR_ENABLED=true` después de la migración. Para verificarla sin modificar datos: `python scripts/verify_shared_live.py`. El procedimiento local respaldado está en `scripts/merge_with_clinic.py` y se ejecuta una sola vez.

## Demostración aislada en contenedores

```powershell
docker compose up -d --build api
docker compose exec api python scripts/provision_storage.py
docker compose exec -it api python scripts/bootstrap.py
```

Este Compose conserva una base aislada para demostración y pruebas; no equivale a la instalación local compartida. La migración se ejecuta antes de iniciar la API. El bucket se aprovisiona explícitamente; `/health/ready` responde 503 hasta que base y bucket estén disponibles. Para detener servicios conservando datos: `docker compose down`. No añadir `-v` salvo que quieras borrar los volúmenes.

## Verificar

```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
.\.venv\Scripts\python.exe -m pytest -q --junitxml=evidence/pytest.xml
.\.venv\Scripts\python.exe scripts/verify_integration.py
```

[Resultados y límites](evidence/ESTADO.md). Las pruebas unitarias usan SQLite y un doble de almacenamiento; la integración usa PostgreSQL y MinIO reales. Ninguna prueba utiliza pacientes ni datos clínicos reales.

## Estructura

```text
api/v1/          Rutas y autorización
core/            Configuración, Argon2id, JWT y MinIO
models/          Tablas del agente
schemas/         Entradas y respuestas públicas
db/              Motor y sesiones de base de datos
alembic/         Migración inicial versionada
agent/           Política y capacidades propuestas para IA
scripts/         Configuración, cuenta inicial y verificación
tests/           Seguridad y comportamiento
docs/            Justificación y documentación por módulo
evidence/        Resultados verificables
```

Este servicio está integrado en el repositorio principal de DentalRisk. Para una instalación completa no se ejecuta su Compose aislado ni se crea otro `.env`: desde la raíz se usa `docker compose up --build -d`. La aplicación web, la API Node.js y este servicio comparten PostgreSQL, pero mantienen permisos separados.
