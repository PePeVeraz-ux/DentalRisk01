# 02. Identidad y seguridad

**Cobertura:** RF22–RF23; RNF06; P11.

**Datos:** users, sessions, login_attempts y audit. Usuarios tienen rol ADMIN, RECEPTION, DENTIST o SUPPORT; DENTIST exige una referencia clínica. Las respuestas nunca incluyen hash de contraseña ni token de sesión.

**Interfaces:** POST sessions, GET sessions/me, POST sessions/logout, GET/POST/PATCH users y GET audit. Sesión inicial devuelve usuario y CSRF. Toda mutación con cookie requiere origen permitido y `x-csrf-token`. La sesión vence en ocho horas por defecto.

**Permisos:** administrador gestiona cuentas; recepción opera el flujo; dentista consulta únicamente sus atenciones y reportes; soporte consulta diagnóstico y auditoría reducida, sin pacientes ni detalle clínico. Cambios en cuentas revocan sesiones. Un administrador no puede alterar su propia cuenta mediante la operación administrativa, evitando quedar sin acceso por error.

El rol ADMIN corresponde al dueño o dirección. Su sesión inicia sin permisos operativos para altas/edición de pacientes, citas, vinculaciones, liberaciones, cancelaciones e incidencias de atención. Para cubrir recepción debe activar `POST sessions/operation-access` con contraseña actual y motivo; exige CSRF, limita intentos fallidos y concede hasta 30 minutos, sin superar la expiración de sesión. `POST sessions/operation-revoke` lo retira inmediatamente. No afecta otras sesiones. La base conserva `sessions.operation_until`; la auditoría registra concesión, motivo, vencimiento y revocación. La API verifica vigencia en cada operación, independientemente del menú. Las correcciones administrativas conservan su permiso específico.

Los cambios concurrentes entre administradores se revalidan dentro de la transacción y preservan al menos un administrador activo. La migración 002 conserva las cuentas y sesiones anteriores y añade el permiso excepcional desactivado.

**Errores:** credenciales inválidas no revelan si el correo existe. El inicio se limita por IP y los fallos se acumulan por IP/cuenta; se bloquea temporalmente después de cinco fallos. Las demás solicitudes se limitan por sesión o IP.

**Pruebas:** anónimo, rol insuficiente, origen externo, CSRF ausente, campos adicionales, acceso ajeno, desactivación, cierre de sesión y credencial de estación revocada. La cuenta de base de datos en producción no puede modificar ni borrar auditoría o incidencias.

En Mi cuenta, cualquier usuario puede cambiar su contraseña proporcionando la actual; el cambio revoca todas sus sesiones y exige iniciar nuevamente. La ruta es POST sessions/password. El administrador puede cambiar rol, dentista asociado y contraseña de otras cuentas; esos cambios también revocan sesiones.

**Operación:** si se pierden todas las cuentas administradoras, el propietario de base de datos debe ejecutar una recuperación controlada, respaldar primero y registrar el cambio. No hay cuentas universales ni contraseña predeterminada.
