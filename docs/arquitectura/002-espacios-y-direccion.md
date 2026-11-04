# Espacios de trabajo y supervisión

La aplicación separa responsabilidad ejecutiva y operación cotidiana. ADMIN representa al dueño; RECEPTION coordina pacientes, citas y tarjetas; DENTIST consulta sus recursos; SUPPORT mantiene diagnóstico sin acceso a pacientes.

## Navegación

Los módulos tienen rutas persistentes: `/direccion`, `/equipo`, `/recepcion`, `/agenda`, `/atenciones`, `/reportes`, `/configuracion`, `/seguridad` y `/mi-cuenta`. El menú y la apertura inicial se adaptan al rol. Una ruta fuera de sus permisos vuelve a su espacio inicial. Los permisos reales se verifican en la API y no dependen de las rutas del navegador.

El cliente solo solicita los recursos que necesita la pantalla activa. No carga el padrón de pacientes en el panel ejecutivo ni registros clínicos en soporte. La información de una sesión se descarta al cambiar de usuario y las respuestas anteriores no sustituyen a las de una sesión nueva.

## Acceso excepcional

El dueño puede cubrir recepción mediante un permiso temporal ligado a una sesión opaca ya autenticada. Requiere contraseña, motivo y CSRF. Vence automáticamente en un máximo de 30 minutos y se puede revocar. Las funciones operativas aparecen únicamente durante su vigencia. Las operaciones quedan atribuidas a su cuenta; no hay suplantación de recepción ni una contraseña compartida.

Se conservan los identificadores de rol existentes para migrar la instalación sin recrear cuentas. La migración 002 añade `operation_until` como NULL a las sesiones previas. Se revalida el actor administrativo dentro de los cambios de permisos para impedir que dos administradores se revoquen mutuamente y eliminen todo acceso de dirección.

## Indicadores

El panel combina mediciones del periodo seleccionado y del periodo anterior de igual duración en días calendario. Una transacción de lectura consistente evita mezclar instantáneas durante la comparación. La serie incluye días sin actividad; el detalle de equipo incluye dentistas sin atenciones. El filtro de dentista se impone en servidor para cuentas DENTIST.

El valor de servicios no constituye caja, cobros ni utilidad. No hay módulo de contabilidad en este alcance. La duración depende del servicio; los comparativos no califican automáticamente la calidad clínica. La preparación de catálogos visible en el panel no certifica hardware, respaldos ni aceptación operativa.
