# Identidad y acceso

La cuenta inicial representa al dueño y se crea mediante `scripts/bootstrap.py` después de migrar. El procedimiento pide la contraseña sin mostrarla y no permite reemplazar un administrador activo. Las cuentas posteriores se crean desde una sesión ADMIN. Los correos se normalizan a minúsculas y la base impide duplicados.

| Método y ruta bajo /api/v1 | Permiso | Resultado |
| --- | --- | --- |
| POST /users/token | Credenciales individuales | JWT y vigencia en segundos; errores 401 o 429. |
| POST /users/logout | Sesión activa | Revoca únicamente el token utilizado. |
| GET /users/me | Sesión activa | Perfil propio sin credenciales. |
| POST /users/me/password | Sesión y contraseña actual | Cambia hash y revoca todas las sesiones de esa cuenta. |
| POST /users | ADMIN | Crea cuenta con rol validado; 409 por correo repetido. |
| GET /users | ADMIN | Lista paginada, máximo cien registros por consulta. |
| PATCH /users/{id}/status | ADMIN | Activa o desactiva a otro usuario y revoca sus sesiones. |
| GET /users/{id} | ADMIN o cuenta propia | Perfil con referencia de imagen. |
| PUT /users/{id}/profile-pic | ADMIN | Asigna la imagen al usuario indicado y devuelve UserResponse. |
| GET /users/{id}/profile-pic | ADMIN o cuenta propia | Recupera la imagen privada. |
| GET /agent/capabilities | Sesión activa | Capacidades propuestas para su rol; inferencia y conector desactivados. |

Los esquemas rechazan campos adicionales y el rol DENTIST exige `dentist_id`. Un administrador no puede desactivarse mediante esta ruta. No hay edición de roles ni recuperación de contraseña por correo en v01.

La revocación se realiza en la misma transacción que el cambio de contraseña o estado. El JWT no concede acceso por sí solo: el backend exige su registro persistente y vuelve a consultar la cuenta. Los errores de login no distinguen entre correo inexistente, contraseña incorrecta y cuenta inactiva.

Argon2id y las consultas parametrizadas se implementan en `core/security.py` y SQLModel. La clave JWT se genera con un origen criptográfico; no existe valor secreto predeterminado. La auditoría registra acciones, no contenido de solicitudes ni credenciales.

En PostgreSQL el conteo de intentos utiliza bloqueo de fila. En SQLite las pruebas funcionales no demuestran esa garantía de concurrencia. Antes de producción se requiere además limitación de solicitudes por IP en el proxy, HTTPS y una política operativa para recuperación de cuentas. Las sesiones expiradas y los contadores sin uso requieren una tarea de limpieza con retención definida por la clínica.
