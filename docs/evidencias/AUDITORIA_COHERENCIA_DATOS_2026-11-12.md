# Auditoría de coherencia operativa y datos de prueba

Fecha del diagnóstico: 12 de noviembre de 2026 (America/Tijuana). Los conteos de la tabla siguiente son del **estado anterior** de la base local `dentalrisk`.

**Estado posterior:** la carga `QA-20261111` fue sustituida por `QA-20261112` con cuatro consultorios confirmados por el usuario. La [distribución actual](carga-datos-trabajo.md), la [verificación SQL](datos-coherentes-2026-11-12.json) y la [prueba real del ESP](../../Agente%20IA/evidence/esp-shared-live.json) documentan la corrección. Las pruebas físicas de lectores y la aceptación clínica continúan pendientes.

## Conclusión

La carga anterior `QA-20261111` cumplía los conteos y conservaba referencias entre tablas, pero **no describía una clínica dental plausible**. Se forzó el mismo mínimo de 500 filas en catálogos, sucesos y registros que deberían crecer a ritmos distintos. Esa carga fue retirada conservando un respaldo completo.

En el modelo actual, `stations` representa un punto de lectura RFID asociado a un consultorio. Cada atención tiene un `station_id`; la credencial de la estación identifica al lector que envía el evento. Una clínica con un lector por consultorio tendría, en la práctica, una estación por consultorio. Si se requieren varios lectores por consultorio, el esquema necesitaría separar `consultorios` y `lectores/estaciones`.

## Hallazgos comprobados

| Prioridad | Hallazgo en la base local | Por qué no es coherente |
| --- | --- | --- |
| Alta | 500 estaciones activas llamadas `QA Consultorio 0001` a `0500`; **0** con `token_hash` | La carga representa 500 consultorios y ningún lector físico autenticado. El indicador de preparación solo cuenta estaciones activas con credencial. |
| Alta | 499 atenciones `COMPLETED`, una `IN_PROGRESS`; 500 eventos RFID, todos `CHECK_IN` | El flujo normal exige entrada y salida. El historial sintético marca 499 salidas sin un evento `CHECK_OUT` correspondiente. |
| Alta | 500 incidencias, todas `QA_OBSERVATION` | Una observación sintética por atención infla el historial de incidencias; no corresponde a pérdidas, daños o correcciones reales. |
| Alta | 500 servicios activos, 500 dentistas activos y 500 turnos | Son catálogos de magnitud desproporcionada para la clínica descrita. La documentación pide validar al menos 15 servicios y el inventario físico previsto es de 50 tarjetas. |
| Media | 500 días de calendario consecutivos, de 2025-06-30 a 2026-11-11, con 500 turnos distintos | Se inventa un turno nuevo para cada fecha, incluidos fines de semana, cuando normalmente se reutilizan horarios semanales y se marcan los días efectivamente operados. |
| Media | 500 cuentas: 7 activas y 493 inactivas; solo 2 cuentas activas de dentista frente a 500 dentistas activos | La mayor parte de la plantilla sintética no puede iniciar sesión. Los catálogos y las cuentas no representan una plantilla real. |
| Media | 500 reportes semanales desde 2017-04-17; 431 tienen cero atenciones | Se creó casi una década de reportes, muchos vacíos, para alcanzar una cifra. Esto distorsiona navegación y comparaciones históricas. |
| Media | 499 citas `ATTENDED` y una `SCHEDULED`; una atención por cada uno de 500 consultorios a lo largo de 500 días | La utilización sería extremadamente baja y faltan cancelaciones, ausencias y reutilización normal de consultorios, especialistas y tarjetas. |
| Media | 500 operaciones del agente `QA_SEED` y 500 intentos de inicio de sesión del agente, junto con 500 intentos clínicos de cero fallos | Operaciones, auditoría e intentos de acceso deben reflejar sucesos ejecutados, no una cuota uniforme de filas. |
| Media | El README principal todavía describe al Agente IA como independiente y sin acceso clínico; la documentación del agente describe la instalación local compartida | Las instrucciones se contradicen. La evidencia antigua también afirma que el `owner_id` del ESP no existe; la verificación actual confirmó que sí apunta a un ADMIN activo. |

La consulta de `stations` confirmó `500` filas activas y `0` credenciales. La consulta de tarjetas mostró `499 AVAILABLE` y `1 ASSIGNED`. El archivo [carga-datos-trabajo.md](carga-datos-trabajo.md) y [seed_working_data.py](../../scripts/seed_working_data.py) explican cómo se fabricaron las filas; [seed-working-data-report.json](../../output/seed-working-data-report.json) conserva los conteos iniciales.

## Qué falta para uso clínico

1. Definir con la clínica el número real de consultorios y lectores, plantilla, servicios/precios, turnos, días operados e inventario físico de UID. El [registro de aceptación](../operacion/aceptacion.md) sigue pendiente de firma y pruebas de campo.
2. Integrar y probar el modelo concreto de lector RFID y su distancia de lectura, reconexión, credencial por estación y confirmación visual. El simulador y `scripts/station.ts` no son un controlador USB validado.
3. **Completado el 12 de noviembre:** el ESP se revalidó en la instalación compartida actual. Consultó la API y los registros clínicos, creó una cuenta QA que abrió DentalRisk y asignó una foto privada en MinIO. El `owner_id` configurado existe y es ADMIN activo. La calidad de respuestas clínicas o diagnósticas no forma parte de esta prueba.
4. Configurar HTTPS y certificados confiables en el equipo de producción; programar respaldos fuera del servidor y medir recuperación. El entorno local y el certificado efímero de pruebas no acreditan ese despliegue.
5. Cerrar el ensayo de carga de 30 minutos con la versión actual y PostgreSQL. El ensayo anterior de 1800 segundos terminó sin errores, pero superó el máximo RFID de 2 segundos; la repetición optimizada quedó incompleta.
6. Realizar piloto con recepción y dentistas, validar reportes contra registros reales, capacitar y documentar aceptación clínica. La API del agente no ofrece inferencia ni diagnóstico clínico.

## Conjunto de prueba recomendado

Mantener **500 o más pacientes, citas y atenciones** si se necesita volumen para probar búsquedas y reportes. Distribuirlos sobre varias semanas de operación con múltiples citas diarias y reutilizar los mismos recursos cuando sus horarios no se solapan. Como ejemplo de una clínica pequeña, usar 2–4 consultorios/estaciones, 5–12 dentistas, 15–30 servicios, horarios semanales reutilizables y alrededor de 50 tarjetas. Las cantidades finales deben venir del inventario de la clínica.

Generar dos eventos RFID por atención completada y uno por la atención en curso; con 499 completadas y una en curso serían **999 eventos**, salvo incidencias documentadas. Mantener incidencias, intentos de acceso, auditoría, operaciones del agente y reportes semanales según hechos simulados concretos, sin forzarlos a 500. Incluir una proporción razonable de citas pendientes, canceladas y atendidas. Los ingresos deben distinguir valor de servicios completados de cobros recibidos.

Antes de reemplazar la carga: conservar el respaldo previo `.local/backups/before-synthetic-seed-20261111-180358.dump`, crear otro respaldo del estado actual, construir y probar el nuevo conjunto en una base aislada, comprobar integridad, calendarios, uso simultáneo, eventos RFID, indicadores y permisos, y finalmente sustituir **solo** las filas identificadas como sintéticas. No borrar sesiones, migraciones ni registros preexistentes de la clínica.

## Alcance de esta revisión

Los conteos de los hallazgos son del PostgreSQL local **antes** de la sustitución. La base actual contiene cuatro consultorios QA según la cantidad confirmada por el usuario. Esto no prueba que haya lectores instalados ni tarjetas físicas verificadas.
