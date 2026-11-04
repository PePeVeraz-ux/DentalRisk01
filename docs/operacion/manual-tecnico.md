# Manual técnico

## Desarrollo

Instalar Node.js 24 y dependencias con `npm ci`. Preparar `.env` desde el ejemplo o `prepare-local`. Ejecutar migraciones y bootstrap antes de iniciar API y web. La ubicación PGlite se define en LOCAL_DATABASE; nunca abrir la misma base desde varios procesos. `npm run clinic:prepare`, con la aplicación detenida, prepara una revisión local limpia en `.local/clinic`, conserva la base anterior y las credenciales iniciales y no carga catálogos sintéticos. Para producción, usar PostgreSQL con cuenta de ejecución independiente.

API escucha 127.0.0.1:4000 y Next 127.0.0.1:3000 en desarrollo. Se admiten localhost y las direcciones de loopback con el protocolo y puerto de APP_ORIGIN. Cualquier otro dominio o puerto exige configuración explícita. Producción admite exclusivamente el origen HTTPS configurado. No usar comodines de origen.

API_INTERNAL_URL define el destino interno de las rutas API al compilar Next. Si se modifica el destino o puerto interno, recompilar antes de iniciar producción; cambiar solo la variable al arrancar no actualiza las rutas compiladas. La imagen integrada utiliza 127.0.0.1:4000. Desarrollo, pruebas de interfaz y compilación de producción tienen cachés separadas.

## Producción local con contenedores

Requiere Docker activo, nombre DNS local de la clínica, almacenamiento persistente y confianza del certificado HTTPS. No publicar puertos de PostgreSQL o API. Elegir contraseñas de base de datos aleatorias y compatibles con URL, por ejemplo hexadecimales; guardarlas en un archivo de entorno de despliegue fuera del repositorio.

1. Configurar POSTGRES_OWNER_PASSWORD, APP_DB_PASSWORD, BACKUP_DB_PASSWORD, APP_ORIGIN (por ejemplo `https://dentalrisk.clinica.local`), CLINIC_HOST con ese nombre y CLINIC_TIMEZONE. Definir BACKUP_KEY de 64 caracteres hexadecimales y BACKUP_PATH como destino físicamente separado; usar `deploy/config.example` como plantilla sin credenciales reales.
2. Ejecutar desde la carpeta del proyecto: `docker compose --env-file RUTA_CONFIG -f deploy/compose.yaml up -d database`.
3. Construir imagen: `docker compose --env-file RUTA_CONFIG -f deploy/compose.yaml build app`.
4. Ejecutar migración como propietario mediante un contenedor temporal con DATABASE_URL del propietario. No modificar la configuración de ejecución para dejarla usando la cuenta propietaria.
5. Ejecutar bootstrap como propietario, con ADMIN_EMAIL y ADMIN_PASSWORD suministrados temporalmente en el entorno.
6. Aplicar `deploy/runtime-grants.sql` con psql como propietario. Comprobar que dentalrisk_app puede operar y no puede alterar tablas, borrar auditoría ni editar incidencias históricas.
7. Iniciar app y https con compose. Configurar DNS local y distribuir de forma controlada la CA interna de Caddy a los equipos y navegadores autorizados. Su clave privada permanece protegida en el servidor.
8. Validar acceso HTTPS, cookies Secure, roles, un flujo completo y restauración aislada antes de autorizar la operación real.

La imagen usa usuario node, permisos mínimos y configuración sin secretos incorporados. El servidor de base de datos conserva su volumen entre recreaciones. Eliminar un volumen destruye datos: no hacerlo como procedimiento de actualización.

## Migraciones y actualización

Respaldar antes de actualizar. Ejecutar pruebas y build sobre la versión a instalar. Aplicar migraciones con propietario y sin otro migrador concurrente, actualizar permisos y desplegar con cuenta restringida. La migración 002 añade sessions.operation_until sin borrar cuentas, sesiones ni registros clínicos. Las sesiones previas no obtienen permisos operativos. La migración 003 añade índices de analítica sin alterar los registros clínicos. Registrar versión, hora y resultado. Nuevas migraciones se agregan como versiones nuevas, sin reescribir las aplicadas.

Si falla la instalación, detener nuevas operaciones y conservar logs y estado. Una reversión de código solo es válida si es compatible con el esquema actual. No restaurar un respaldo sobre nuevas atenciones sin conciliación y autorización.

## Estaciones

Registrar estación en configuración, generar token y guardarlo protegido en su equipo; no en la tarjeta. Revocar al retirar o comprometer una estación. El adaptador de entrada está disponible en `scripts/station.ts`, con STATION_API_URL, STATION_ID y STATION_TOKEN. UID por línea y REINTENTAR son su contrato inicial; el proveedor USB real queda por implementar y verificar cuando se seleccione el lector.

El evento pendiente se guarda en un archivo local sin credenciales. Una respuesta perdida debe reintentarse con el mismo event_id. El servidor decide hora y transición, no el cliente. Sin conexión no se confirma la atención ni se presenta éxito.

## Respaldo y recuperación

Instalar herramientas cliente PostgreSQL compatibles. Configurar DATABASE_URL del operador de respaldo con lectura suficiente, BACKUP_DIR en destino separado y BACKUP_KEY de 64 caracteres hexadecimales. Proteger permisos del destino y de la clave. Programar `npm run backup` diariamente con Programador de tareas de Windows o el programador del servidor. Revisar resultado y alertar si no existe respaldo reciente.

Se aplica retención de 30 días; la clave debe conservarse fuera de los archivos cifrados. Para recuperación, crear una base vacía distinta y configurar RESTORE_DATABASE_URL; ejecutar `npm run restore -- RUTA_ARCHIVO`. No se utiliza borrado automático. Comprobar atenciones, tarjetas, asignaciones, usuarios y reportes en esa base antes de promoverla.

Medir RPO de 24 horas y RTO de cuatro horas en el entorno instalado. El script no acredita esas metas sin un ensayo. Documentar quién ejecutó, archivo, duración, conteos y resultado sin incluir secretos.

Como alternativa al programador del sistema, habilitar el perfil de respaldo de Compose después de migrar y aplicar permisos: `docker compose --env-file RUTA_CONFIG -f deploy/compose.yaml --profile backup up -d backup`. El servicio ejecuta un respaldo al iniciar y después cada 24 horas; debe tener permiso de escritura en el destino montado. No habilitar ambos mecanismos simultáneamente para la misma instalación.

## Monitoreo y mantenimiento

Revisar health sin datos personales, diagnóstico autorizado, auditoría, espacio, hora, respaldo y atenciones pendientes. La tarea semanal se ejecuta cada minuto y regenera la semana anterior sin duplicar periodos. Para periodos más antiguos o correcciones históricas, obtener reporte personalizado.

Actualizar dependencias mediante cambio revisado, auditoría, tipos, pruebas y build. `npm run test:ui` usa servidores y base aislados para verificar los cuatro perfiles sin datos clínicos. La excepción de uuid para ExcelJS está fijada a versión corregida y cubierta por exportaciones; no retirarla sin volver a auditar. Las credenciales nunca deben aparecer en salida de consola, capturas compartidas, tickets ni contratos exportados.

La prueba `test:ui:production` compila una instancia aislada con HTTPS y certificado efímero; verifica cookies seguras, CSP y los perfiles. Sus certificados se configuran con UI_TLS_CERT/UI_TLS_KEY. La aceptación del certificado ocurre solo en el navegador de prueba y no modifica el equipo. Este ensayo no certifica Caddy, Docker ni el servidor clínico.
