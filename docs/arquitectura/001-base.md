# Arquitectura y decisiones

## Componentes

Frontend Next.js/React, API Fastify, PostgreSQL y adaptador de estación. Toda operación sensible se valida en el servidor. La interfaz y el adaptador utilizan el mismo contrato REST versionado bajo `/api/v1`.

La aplicación web reenvía solicitudes API a un servicio interno. Producción expone únicamente el proxy HTTPS; PostgreSQL y API permanecen en la red privada. El proceso de aplicación corre sin privilegios de administrador. El propietario de migraciones y la cuenta de ejecución de base de datos son distintos.

## Persistencia y concurrencia

La base usa claves foráneas, restricciones de estado y unicidad parcial para asignaciones activas, citas, estaciones y dentistas ocupados. Las mutaciones se serializan mediante una fila de control bloqueada por transacción en PostgreSQL. Es una decisión deliberada para una clínica local; si la escala lo requiere, deberá sustituirse por bloqueos por agregado, conservando pruebas concurrentes.

Un evento RFID tiene UUID único, UID y estación. El servidor asigna su hora, conserva la respuesta y verifica que un UUID repetido tenga el mismo UID y estación. El adaptador conserva en disco el evento no confirmado y no acepta otro hasta resolverlo. Esto no equivale a operación clínica sin conexión.

PGlite se usa para desarrollo y pruebas automatizadas, con el mismo esquema PostgreSQL. No sustituye la certificación del servidor PostgreSQL de producción ni demuestra su comportamiento de bloqueo multiusuario.

## Seguridad

Argon2id, sesiones opacas almacenadas como hash SHA-256, cookie HttpOnly/SameSite, Secure en producción, token CSRF y origen exacto. Cambiar rol, contraseña o estado revoca las sesiones de la cuenta. La API exige permisos también para exportaciones y filtra recursos del dentista.

La cuenta de estación posee token independiente, almacenado como hash y revocable. Los logs HTTP omiten cookies, autorización y parámetros de consulta. La auditoría excluye contraseñas y tokens. La política CSP utiliza un nonce por respuesta y no permite scripts inline arbitrarios.

## Configuración

Zona inicial America/Tijuana; fechas persistidas en UTC. Precios en centavos enteros; no se realizan sumas monetarias binarias. Relectura predeterminada 2,000 ms; interfaz consulta cada 4 segundos. La presentación muestra el momento de generación para no confundir información antigua con confirmación de una operación.

Los días sin pacientes y los descansos se pueden configurar expresamente. Cuando existe una atención real, el sistema marca automáticamente el día y el horario como operados; así recepción no necesita preparar el calendario antes de cada lectura.
