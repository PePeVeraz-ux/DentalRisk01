# Corrección de datos y verificación del ESP conectado

Fecha local: 12 de noviembre de 2026 (America/Tijuana).

## Datos de trabajo

Se respaldó la base `dentalrisk` en `.local/backups/before-coherent-reseed-20261112-144704.dump`. La sustitución de la carga QA antigua pasó primero en una base PostgreSQL restaurada y desechable. Se conservaron los registros preexistentes y se retiraron las filas identificadas como `QA-20261111`.

La nueva carga `QA-20261112` usa los **cuatro consultorios confirmados** por el usuario, 50 tarjetas reutilizables, siete dentistas QA, 15 servicios, cinco turnos semanales y 500 pacientes, citas y atenciones. Hay 475 atenciones completadas, cinco cerradas por incidencia, 19 pendientes y una en curso. Las 475 completadas tienen un evento RFID de entrada y otro de salida. Los 20 reportes semanales con actividad se recalcularon mediante la lógica del sistema. [Conteos y verificaciones de solo lectura](datos-coherentes-2026-11-12.json).

Se deshabilitó la antigua carga uniforme para que no vuelva a llenar la base real con 500 estaciones y bitácoras artificiales. Sigue disponible únicamente para reproducir el caso histórico en una base desechable.

## Agente IA y acceso compartido

El ESP respondió en `192.168.100.18`. Se sincronizaron su habilidad y archivo privado de conexión, con copia de los anteriores. La API compartida en `192.168.100.17:8000` respondió `/health/live` y `/health/ready` con HTTP 200. La credencial delegada pudo leer `/connection`, el resumen clínico y dos atenciones sin identidad de pacientes; la ruta sin credencial respondió 401.

Mediante su propia herramienta `http_request`, el ESP confirmó conexión (200), resumen (200) y registros (200), creó una cuenta QA de Recepción (201) y le asignó una foto (200). Esa misma cuenta inició sesión en DentalRisk por API (200) y [en navegador](../../output/capturas/esp-cuenta-compartida.png). El JPEG quedó en MinIO privado; una descarga anónima respondió 403. La [traza de rutas y estados](../../Agente%20IA/evidence/esp-shared-live.json) excluye claves y contraseñas. La primera petición de alta devolvió 422 por un correo QA con dominio `.local`; se corrigió a `example.com` y la repetición completó el flujo.

Las cuentas QA de dentista y recepción también iniciaron sesión en el Agente IA; el dentista vio solo su ámbito, recepción el ámbito clínico y soporte recibió 403 para el resumen clínico. Las credenciales de prueba se guardan únicamente en `.local/` y `Agente IA/.local/`, fuera de Git.

## Verificación y límites

- DentalRisk: 33 pruebas aprobadas y TypeScript aprobado.
- Agente IA: 58 pruebas aprobadas; aviso de obsolescencia de Starlette/TestClient sin fallo funcional.
- [Captura de atención y tarjeta en uso](../../output/capturas/tarjeta-estacion-en-uso-base-real.png): cuatro estaciones y 50 tarjetas visibles en los selectores de la base real.
- Carga breve de 15 segundos en PostgreSQL aislado, 10 sesiones, cuatro estaciones y 10.000 registros históricos: 120 solicitudes, cero errores, máximo RFID 135 ms. [Resultado](carga-15s.json).
- La repetición de 30 minutos con cuatro estaciones y PostgreSQL aislado se detuvo a petición del usuario al último corte de 1.020 segundos: 7.470 solicitudes y cero errores observados. [Registro parcial](carga-1020s-parcial-2026-11-12.json). No se calculó la latencia máxima ni la conciliación final, por lo que el objetivo de 30 minutos sigue sin aprobarse. La base desechable fue eliminada.

Los cuatro consultorios QA **no tienen todavía credenciales de lectores físicos**. El ESP conectado es el asistente; su verificación no sustituye la instalación y prueba de los cuatro lectores RFID, de las tarjetas físicas, del HTTPS de producción ni de la aceptación clínica de servicios, precios y horarios.
