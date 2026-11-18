# DentalRisk

Versión 1.0.0. Aplicación para dirección, recepción, citas, control RFID de atenciones y medición de productividad en una clínica dental.

## Inicio local

Requiere Node.js 24, npm y PostgreSQL. La API exige `DATABASE_URL`; PGlite queda para pruebas y transferencia explícita de datos antiguos.

En este equipo, PostgreSQL 17 está en `127.0.0.1:5432`. La aplicación y el Agente IA utilizan la misma base `dentalrisk`, con usuarios PostgreSQL distintos. La antigua base `dentalrisk_agent` se conserva como origen previo a la unión. Las conexiones están en el `.env` de cada proyecto. Desde esta carpeta, ejecutar `npm run db:start` después de reiniciar Windows y luego `npm run dev`. `npm run db:stop` detiene PostgreSQL conservando los datos en `.local/postgres`. No está registrado como servicio de Windows. No repetir `bootstrap` en esta instalación ya migrada.

La estructura y las rutas compartidas se documentan en [Base compartida con el Agente IA](docs/arquitectura/003-base-compartida.md).

Para una instalación nueva, configurar `DATABASE_URL` en `.env` antes de ejecutar `bootstrap`:

```powershell
npm ci
node --import tsx scripts/prepare-local.ts
npm run bootstrap
npm run dev
```

Abrir **http://localhost:3000** o **http://127.0.0.1:3000**. En desarrollo se permiten los alias locales de loopback con el mismo protocolo y puerto de `APP_ORIGIN`. En producción se exige el origen HTTPS configurado exacto. El correo y la contraseña inicial están en `.env`, generado localmente con contraseña aleatoria. Ese archivo está excluido de Git y de la imagen de despliegue. Después de crear la cuenta, guardar la contraseña en un gestor y retirar `ADMIN_PASSWORD` del entorno. `bootstrap` no reemplaza cuentas existentes.

`npm run clinic:prepare` aplica las migraciones a PostgreSQL conservando los registros existentes. La transferencia realizada conserva la base PGlite original y una copia en `.local/`, junto con el entorno anterior. Los conteos y la verificación de contenido están en `docs/evidencias/migracion-postgresql.json`. El procedimiento de producción continúa en el manual técnico.

`npm run demo` queda reservado a bases aisladas de demostración con catálogos vacíos. Crea datos sintéticos identificados como DEMO y está bloqueado en producción. No ejecutarlo en la instalación de la clínica.

## Espacios por rol

| Perfil | Inicio y responsabilidad |
| --- | --- |
| Dueño / Administración | Panel ejecutivo, equipo, indicadores y reportes; catálogos y cuentas. |
| Recepción | Jornada, pacientes, agenda, asignación de tarjetas e incidencias. |
| Dentista | Su productividad, agenda y atenciones autorizadas. |
| Soporte | Diagnóstico y auditoría reducida, sin pacientes. |

Los módulos tienen direcciones propias y conservan el acceso al recargar. El dueño no asigna citas ni pacientes con sus permisos habituales. Si necesita cubrir recepción, en Mi cuenta puede autorizar hasta 30 minutos de acceso con contraseña y motivo. El permiso es revocable, queda auditado y no se transfiere a otras sesiones.

## Recorrido

1. Como dueño, configurar especialistas, servicios, estaciones, tarjetas, turnos y días operados. En Usuarios y seguridad crear cuentas individuales de recepción y dentistas, vinculando cada dentista a su registro.
2. Iniciar con una cuenta de Recepción para registrar paciente y cita si corresponde.
3. Vincular paciente, servicio, dentista, estación, turno y tarjeta disponible.
4. En Atenciones, usar el simulador: primer escaneo inicia; segundo escaneo después de la ventana de dos segundos finaliza.
5. Liberar la tarjeta tras su devolución física.
6. Como dueño, consultar Panel ejecutivo, Equipo y desempeño o Reportes y exportar CSV, PDF o Excel. Los periodos rápidos incluyen Semana anterior para la medición semanal.

Los importes representan el valor de servicios completados, no cobros recibidos. La tarjeta identifica una asignación temporal, no autentica usuarios ni almacena datos personales.

## Verificación

```powershell
npm run typecheck
npm test
npm run build
npm run contracts
npm audit --audit-level=moderate
npm run load
```

`npm run check` ejecuta tipos, pruebas, compilación, contratos y auditoría con detención al primer fallo y registra evidencia y huella del código. `npm run test:postgres` prepara una instancia PostgreSQL 17 aislada y comprueba la suite, permisos y recuperación; en Windows requiere `PG_CLIENT_BIN` con pg_dump y pg_restore para la parte de respaldo. `PG_LOAD=true` añade la carga de 30 minutos, y `PG_TEST_PORT` permite cambiar su puerto. El comando no instala un servicio del sistema y conserva sus datos de prueba bajo `.local/`.

La prueba de carga usa una base aislada, 10 sesiones, cuatro estaciones simuladas por defecto y 10,000 atenciones históricas durante 1,800 segundos. `LOAD_SECONDS` permite un ensayo breve y `LOAD_STATIONS` ajusta el número de estaciones. Para PostgreSQL real, proporcionar `TEST_DATABASE_URL` de una base vacía y aislada o usar `scripts/run_load_isolated.ps1`. Nunca usar la base clínica. Los resultados se guardan en `docs/evidencias/` con el motor y duración reales.

`npm run test:ui` inicia servidores propios en los puertos 3311/4311, usa una base en memoria y credenciales efímeras. Verifica los cuatro roles, alta de cuentas, paciente, cita, zona horaria, ciclo RFID, permiso excepcional, exportaciones, desconexión y móvil. No requiere la base clínica ni `.env`. En Windows usa Chrome instalado; `BROWSER_EXECUTABLE` permite cambiar ejecutable y `UI_TEST_PORT` el puerto web. En CI utiliza Chromium de Playwright. Guarda capturas en `.local/screenshots/` y evidencia en `docs/evidencias/interfaz.json`.

`npm run test:ui:production` compila una instancia aislada y verifica los mismos perfiles sobre HTTPS, cookies seguras y CSP. Requiere certificado y clave efímeros de prueba en `.local/test-tls/cert.pem` y `key.pem`, o rutas `UI_TLS_CERT` y `UI_TLS_KEY`. El navegador de ese ensayo acepta exclusivamente su certificado de prueba, sin modificar la confianza del equipo. Utiliza memoria y estaciones simuladas; no valida Docker, Caddy ni el lector físico. Su evidencia se registra en `interfaz-produccion.json`.

## Estructura

- `apps/api/src/`: API, autenticación, dominio, reportes y trabajo semanal.
- `apps/web/`: aplicación Next.js responsiva.
- `database/`: migraciones SQL.
- `scripts/`: instalación, simulación de estación, pruebas, respaldo y recuperación.
- `docs/modulos/`: documentación por módulo.
- `docs/api/`: OpenAPI y colección Postman generados desde las rutas.
- `docs/operacion/`: manuales y procedimientos de operación.
- `deploy/`: PostgreSQL, aplicación y HTTPS para servidor local.

## Estado de entrega

El código incluye los espacios por rol, flujo principal, controles, interfaz y scripts operativos. El estado verificable se registra en `docs/evidencias/ESTADO.md` y la entrega se describe en `docs/entregas/1.0.0.md`. Las validaciones con lector físico, servidor de producción, capacitación y piloto clínico requieren ejecución real antes de aprobar producción.

Las evidencias JSON registran la fecha, versión y alcance de cada ensayo. Las pruebas de carga sobre rutas inyectadas no incluyen lector ni latencia de red. La recuperación se prueba de forma aislada; debe repetirse en la instalación clínica para validar sus objetivos operativos.

Manuales listos para consulta: [usuario](output/pdf/manual-usuario.pdf), [técnico](output/pdf/manual-tecnico.pdf) y [guía de incidencias](output/pdf/guia-incidencias.pdf). La documentación de los nueve módulos se encuentra en `docs/modulos/`.

La aplicación clínica no incorpora inferencia IA, voz ni ESP32-S3 en esta entrega. No se garantiza el aumento de productividad por instalar el sistema: debe medirse sobre periodos comparables.

## Servicio del agente

La carpeta `Agente IA/` contiene el servicio FastAPI del asistente ESP: Argon2id, JWT revocables y perfiles privados en MinIO. En esta instalación local ambos servicios comparten PostgreSQL `dentalrisk` y la tabla `users`; las tablas `agent_*` conservan sesiones, operaciones y auditoría del agente. Las rutas clínicas del agente consultan registros autorizados sin identidad de pacientes. El ESP puede crear cuentas no administrativas y asignarles fotos mediante la API delegada. La inferencia ocurre en el ESP; esta API no realiza diagnósticos ni inferencia clínica. La demostración Compose independiente sigue disponible para pruebas aisladas y no representa el despliegue compartido.
