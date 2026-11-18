# Revisión integral de DentalRisk y Agente IA

Fecha: 11 de noviembre de 2026 (America/Tijuana).

**Archivo histórico.** Sus conteos de 500 estaciones/tarjetas corresponden a la carga QA anterior. La base actual tiene cuatro consultorios QA y 50 tarjetas QA; consulte [carga-datos-trabajo.md](carga-datos-trabajo.md) y [datos-coherentes-2026-11-12.json](datos-coherentes-2026-11-12.json).

## Alcance y resultados

| Área | Comprobación | Resultado |
| --- | --- | --- |
| Base clínica | PostgreSQL 17 aislado: transacciones, concurrencia, permisos, respaldo cifrado y restauración | 33/33 pruebas aprobadas |
| Seguridad clínica | Sesiones, CSRF, roles, cambio de contraseña, bloqueo de intentos y acceso temporal del dueño | Aprobado |
| Operación | Configuración, pacientes, citas, vinculación de tarjeta, escaneo RFID simulado, incidencias y liberación | Aprobado en API e interfaz |
| Analítica | Indicadores, periodos, semana, zona horaria, exportaciones CSV/PDF/XLSX | Aprobado |
| Interfaz | Cuatro perfiles, escritorio, móvil, rutas y desconexión | Aprobado en desarrollo y HTTPS de prueba |
| Catálogos en interfaz | 500 estaciones y 500 tarjetas sintéticas de la base local; segunda página con 503 tarjetas aisladas | Aprobado |
| Contratos y compilación | OpenAPI, colección Postman, TypeScript y build optimizado | Aprobado |
| Agente IA | Identidad, JWT, roles, delegación ESP simulada, validación de fotos y controles clínicos | 58/58 pruebas aprobadas |
| Identidad compartida | Alta en una API e inicio de sesión en la otra, en ambos sentidos | HTTP 200 en ambos |
| Base real | Verificación de 500 usuarios, 500 atenciones y 500 citas con permisos del agente | Aprobado en solo lectura |
| Carga breve | 10 sesiones, 2 estaciones, 10.000 registros, 15 segundos solicitados | 40 solicitudes, 0 errores, máximo RFID 103 ms; PGlite aislado |
| Integración con MinIO | PostgreSQL y bucket aislados, imagen real vía S3 | 12 comprobaciones aprobadas; recursos temporales eliminados |

La prueba de interfaz usa una base aislada. La revisión de la base real fue de solo lectura. El ensayo breve de carga no acredita el objetivo de 30 minutos ni el rendimiento en PostgreSQL bajo la red clínica.

## Hallazgos y plan de corrección

1. **[P1, corregido] El verificador de integración de Agente IA fallaba en `/health/ready`.** Con el `.env` de la instalación compartida, `scripts/verify_integration.py` creaba una base temporal independiente y obtenía HTTP 503. La prueba heredaba `CLINICAL_CONNECTOR_ENABLED=true` y exigía tablas clínicas que no existen en esa base aislada. Se fijó `clinical_connector_enabled=False` en la configuración de esa prueba. La repetición pasó la migración, el inicio de sesión, MinIO, la revocación y el flujo ESP simulado: [evidencia](../../Agente%20IA/evidence/integration.json).
2. **[P2, corregido] La tabla de atenciones cortaba palabras e importes a 1440 px con diez columnas.** La [captura anterior](../../output/capturas/tarjeta-estacion-en-uso-base-real-antes.png) muestra “Completad a” y cifras partidas. `td` permitía saltos en cualquier carácter. Ahora conserva cada valor en una línea y el panel ofrece desplazamiento horizontal. Se revisaron [la base real tras el cambio](../../output/capturas/tarjeta-estacion-en-uso-base-real.png) y [móvil aislado](../../.local/screenshots/tarjeta-estacion-en-uso-mobile.png).
3. **[P3, corregido] Selección lenta en el simulador RFID.** Se incorporó búsqueda por nombre de estación y UID de tarjeta. La selección se mantiene al cambiar el filtro. El flujo de entrada y salida siguió pasando en navegador.
4. **[P2, corregido] Catálogos incompletos con la base de 500 filas.** La API devolvía 200 elementos por defecto; la interfaz no solicitaba otras páginas para estaciones, tarjetas y demás catálogos. Ahora solicita bloques de hasta 500 y recupera las páginas restantes cuando el total es mayor. El navegador confirmó 500 estaciones y 500 tarjetas en la base real, incluida la tarjeta `QA-20261111-CARD-0500` y la estación `QA Consultorio 0500` en uso. Una prueba aislada con 503 tarjetas confirmó que el simulador recupera también la segunda página.

## Límites no comprobables con este entorno

- No se confirmó un lector RFID físico ni la lectura de tarjetas reales; se usó el simulador del mismo flujo de estados.
- No se confirmó un ESP conectado. La prueba de delegación HTTP y adjuntos usa un simulador local.
- HTTPS usa un certificado efímero de prueba; no es el certificado ni el servidor de producción.
- La carga de 15 segundos no sustituye la prueba completa de rendimiento de 30 minutos.

## Estado de correcciones

Se aplicaron las cuatro correcciones. Pasaron la integración real de PostgreSQL y MinIO, la compilación, el flujo de navegador de los cuatro roles en desarrollo y HTTPS de prueba, y la paginación con más de 500 tarjetas. La base real mostró los 500 registros de estaciones y tarjetas sin modificar los datos clínicos durante esa comprobación.

**Revisión posterior de coherencia (12 de noviembre):** las pruebas anteriores demuestran funcionamiento y referencias válidas, pero la cuota uniforme de 500 filas produjo catálogos e historiales poco plausibles para una clínica. Véase [AUDITORIA_COHERENCIA_DATOS_2026-11-12.md](AUDITORIA_COHERENCIA_DATOS_2026-11-12.md). La carga sintética todavía requiere sustitución por datos de prueba proporcionales.
