# Estado de verificación v01

## Cambio en curso - 21 de noviembre de 2026

La versión de trabajo añade la ruta delegada de rendimiento por dentista, el alta mínima de pacientes y la asociación de fotos privadas, con la migración Alembic 007 y contratos OpenAPI/Postman actualizados. La pantalla principal del dueño se redujo a los indicadores y el desempeño por dentista del wireframe D01. La migración 007 quedó aplicada a la base PostgreSQL local: se verificó la versión y las tablas/permisos nuevos; solo agrega tablas y grants, sin modificar pacientes existentes. Las rutas nuevas de rendimiento y alta de pacientes todavía no se han ejercitado.

El 21 de noviembre se volvió a cargar DentalRisk en el ESP-CLAW actualmente conectado (`192.168.1.76`), conservando la clave delegada que coincide con el hash activo. Se actualizaron la guía, la identidad y la dirección de API (`192.168.1.77:8100`); los archivos reemplazados quedaron respaldados en `.local/esp/backup/` y la conexión local anterior en `.local/esp/backup-config/`. Desde una conversación WebIM del propio ESP, Denti hizo GET a `/api/v1/agent/connection` y confirmó HTTP 200, `connected=true` y `America/Tijuana`. Esa comprobación no consultó pacientes, no registró datos y no prueba aún las rutas nuevas.

## Instalación compartida actual - 12 de noviembre de 2026

La base local compartida `dentalrisk` contiene 500 pacientes, 500 citas, 500 atenciones, cuatro consultorios QA y 50 tarjetas QA. [La verificación actual de datos](../../docs/evidencias/datos-coherentes-2026-11-12.json) concilió eventos de entrada y salida y retiró la carga uniforme anterior. El `owner_id` configurado para el ESP corresponde a un ADMIN activo.

En la instalación usada el 12 de noviembre, el ESP en `192.168.100.18` consultó la API compartida en `192.168.100.17:8000`, leyó resumen y atenciones sin identidad de pacientes, creó una cuenta QA y asignó su foto. Esa cuenta inició sesión en DentalRisk como Recepción por API y navegador; MinIO devolvió el JPEG privado. La [traza histórica de HTTP y resultados](esp-shared-live.json) no incluye claves. La prueba inicial rechazó un correo `.local` con 422; se corrigió el dato QA a `example.com` y el alta aprobó con 201. Los cuatro consultorios QA no tienen credenciales de lector físico; la prueba del ESP no valida lectores RFID.

## Unión local con DentalRisk - 9 de noviembre de 2026

La instalación local ahora usa una sola base PostgreSQL `dentalrisk` y la tabla clínica `users` como identidad común. Se conservaron respaldos de ambas bases y la antigua base `dentalrisk_agent`. El origen del agente tenía cero usuarios, sesiones y operaciones; no había registros de agente que trasladar. Se aplicó la migración 004 y se verificaron los permisos de lectura clínica con el rol PostgreSQL del agente.

Las nuevas rutas `/api/v1/clinical/records` y `/api/v1/clinical/summary` aplican el rol de la sesión JWT. Administración y recepción consultan registros operativos; dentista solo los propios; soporte no accede. La respuesta no incluye identidad del paciente. La prueba aislada de migración comprobó copia de usuario, referencias y revocación de sesiones; la suite del agente aprobó 58 pruebas. La verificación de la base real fue de solo lectura. El archivo `merge-shared-database.json` conserva conteos y fecha sin credenciales.

La prueba cruzada `scripts/verify_shared_stack.py` creó una base temporal con el esquema clínico y del agente. Una cuenta RECEPTION creada por la API del agente inició sesión en DentalRisk con HTTP 200; una cuenta creada con el hash Argon2 de DentalRisk inició sesión en el agente con HTTP 200. La base temporal se eliminó al concluir. Se corrigió la lectura en Python del orden de parámetros del hash emitido por Node sin alterar contraseñas ni hashes persistidos. OpenAPI y Postman incluyen las rutas clínicas nuevas.

El Compose de demostración del agente sigue aislado. La implementación y prueba de un despliegue conjunto en contenedores quedan pendientes; no se presenta la unión local como aceptación de producción.

En el corte del 9 de noviembre la delegación anterior apuntaba a una identidad ya inexistente; se reconfiguró posteriormente. La comprobación del 12 de noviembre confirma delegación activa y el flujo físico completo contra la base compartida.

**Fecha local:** 26 de octubre de 2026, America/Tijuana. Los archivos JSON registran UTC.

| Comprobación | Resultado y evidencia |
| --- | --- |
| Pruebas funcionales y seguridad | 57 aprobadas. `pytest.xml`. SQLite, almacenamiento y adjuntos simulados explícitamente en esta suite. |
| Integración real | Aprobada. `integration.json`. Base PostgreSQL y bucket MinIO creados exclusivamente para el ensayo y eliminados al finalizar. |
| Migración inicial | Aplicada desde cero en PostgreSQL y SQLite. Alembic check sin diferencias nuevas respecto del modelo. |
| Imagen Docker | Construida desde Python 3.12 con las 44 dependencias de ejecución fijadas. Migraciones 001 a 003 y API iniciadas mediante Compose; timestamps PostgreSQL con zona horaria UTC. |
| API publicada | Se comprueban disponibilidad, Swagger, contrato DentalRisk y rechazo de perfil anónimo. `container.json`. |
| Dependencias Python | 73 paquetes auditados, cero vulnerabilidades conocidas en la consulta final. `dependencies.json`. No constituye una auditoría de imágenes o del sistema completo. |
| Git | Repositorio independiente en la rama local v01. Publicación remota pendiente a cargo del responsable. |
| Agente del ESP real | Aprobado en el dispositivo indicado por el responsable, 192.168.100.13. Creó una cuenta por petición en lenguaje natural y cargó una imagen adjunta en MinIO. `esp-hardware.json` y conversación con credenciales redactadas. |
| Modelo del ESP | El dispositivo reportó deepseek-v4-pro. La API no ejecuta inferencia local ni consulta datos clínicos. |

## Casos comprobados

Las pruebas cubren hash Argon2id con sal, contraseña incorrecta, preservación de espacios, cuentas anónimas, roles sin permisos administrativos, correo duplicado, dentista sin referencia, campos adicionales, paginación, bloqueo tras cinco fallos, cierre de sesión, cuenta desactivada y cambio de contraseña con revocación de todas sus sesiones.

Los tokens se comprueban ante firma incorrecta, caducidad, audiencia y emisor ajenos, ausencia de identificador y falta de sesión persistente. Las imágenes se comprueban por contenido, tamaño, aislamiento entre cuentas, reemplazo y fallo del almacenamiento. También se verifica el límite del cuerpo completo de 3 MiB, origen externo y registro de auditoría sin credenciales.

La integración real valida la migración en una base nueva, la sesión persistida en PostgreSQL, el almacenamiento y recuperación JPEG en MinIO, el rechazo de descarga anónima y la revocación. Dos cambios administrativos concurrentes preservan al menos un administrador activo. No se usaron pacientes, tarjetas ni credenciales de la aplicación clínica principal.

El ensayo de `integration.json` usa un servidor HTTP que simula únicamente la descarga de adjuntos del ESP. La prueba física independiente está en `esp-hardware.json`: WebIM del dispositivo real, habilidad nativa instalada, altas y fotos solicitadas al agente, cuenta y operación comprobadas en PostgreSQL y objeto JPEG comprobado en MinIO. El script de prueba física no ejecuta las rutas de creación ni carga por su cuenta. Se utilizó una imagen sintética de color, no la foto de un paciente.

## Infraestructura reproducible

- PostgreSQL 17, imagen `postgres@sha256:266d3c257594e195b309ae9d1805e54c788f1d7b375f56bf6c367aac6c917e7b`.
- MinIO, versión reportada `RELEASE.2025-10-15T17-29-55Z`, compilación comunitaria `coollabsio/minio@sha256:4f75fd76598afa23919555d1363e1fb13c632d9bcd4ce8edcf21d3cca2ed0579`, plataforma linux/amd64. No se afirma soporte o compilación oficial del fabricante.
- API en `127.0.0.1:8000`; PostgreSQL en `127.0.0.1:5434`; MinIO en `127.0.0.1:9100` y consola en `127.0.0.1:9101`.
- Para el ESP se habilitó además la API en `192.168.100.12:8000` mediante el archivo Compose opcional; el almacenamiento y PostgreSQL conservan sus enlaces locales. Estas IP corresponden al ensayo y deben verificarse si cambia la red.

## Límites conocidos

El cliente de pruebas emite un aviso de obsolescencia sobre el uso de HTTPX con Starlette; las pruebas terminan correctamente. Su migración a HTTPX2 se puede atender sin cambiar el contrato del producto.

Compose está configurado para desarrollo local. Antes de operar con información real se requieren vinculación de identidades con DentalRisk, HTTPS, credencial MinIO de privilegio mínimo, política de respaldos, límites de solicitudes por IP, limpieza de sesiones e imágenes huérfanas y validación operativa. Se comprobó el agente del ESP, pero no hay evaluación de lector RFID, calidad de respuestas clínicas, rendimiento del modelo ni aceptación clínica.

## Repetir el ensayo

Ejecutar `python -m pytest -q --junitxml=evidence/pytest.xml` y `python scripts/verify_integration.py` dentro del entorno del servicio. La integración utiliza solamente su base y bucket recién creados. Para comprobar el contrato: `python scripts/export_contracts.py`. El archivo `.env` y el entorno virtual están excluidos del repositorio.

Para repetir la prueba física con la conexión ya instalada: `python scripts/verify_esp_hardware.py`. Usa una cuenta sintética identificada como prueba y conserva su estado privado en `.local/esp/`; no repetirla sobre una cuenta clínica.
