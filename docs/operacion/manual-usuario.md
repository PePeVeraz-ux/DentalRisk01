# Manual de usuario

## Acceso

Abrir la dirección HTTPS indicada por administración. Usar una cuenta individual. Cerrar sesión al terminar; no compartir contraseñas. Si aparece un error de certificado, solicitar al responsable técnico instalar la confianza de la clínica; no desactivar la protección del navegador.

El menú muestra las funciones correspondientes al rol. El dueño inicia en Panel ejecutivo, supervisa Equipo y desempeño y mantiene catálogos y cuentas. Recepción administra pacientes, agenda y tarjetas. Dentista consulta su actividad propia. Soporte consulta estado técnico y bitácora reducida. Cada módulo conserva su dirección al recargar.

En Mi cuenta puedes cambiar tu contraseña proporcionando la actual. Después del cambio deberás iniciar nuevamente y se cerrarán tus sesiones anteriores. En móvil, el botón Salir está disponible en la parte superior.

## Preparación de operación

Administración debe registrar servicios y precios, especialistas y estaciones. Los horarios y el calendario sirven para reportes; al vincular una tarjeta, DentalRisk selecciona el horario vigente y marca automáticamente el día como operado. Registrar el inventario de tarjetas con sus UID y comprobarlos físicamente.

En Usuarios y seguridad, crear cuentas individuales con contraseñas de al menos 12 caracteres. Al elegir el rol Dentista, el sistema crea o vincula automáticamente el perfil profesional y genera su identificador en la base. Entregar cada credencial por un canal privado y solicitar cambio desde Mi cuenta. Desactivar una cuenta revoca sus sesiones. No compartir la cuenta del dueño con recepción.

El panel del dueño muestra la preparación de catálogos y cuentas pendiente. Ese listado no sustituye la verificación física de tarjetas ni la aprobación clínica.

## Recepción y atención

1. Buscar o registrar al paciente con su folio. Confirmar que no se está duplicando otro registro.
2. Si se usa agenda, crear la cita con servicio, dentista e inicio/fin. Los horarios superpuestos del mismo dentista se rechazan.
3. Vincular la cita o una atención nueva seleccionando paciente, servicio, dentista, estación y tarjeta Disponible. DentalRisk asigna internamente el horario; recepción no necesita elegirlo. Revisar los datos y guardar.
4. Entregar la tarjeta. Al entrar al consultorio, el paciente la acerca al lector y debe recibir confirmación de entrada.
5. Al salir, el paciente vuelve a presentarla y se confirma atención Completada. Una relectura inmediata no registra salida.
6. Recibir la tarjeta en recepción y seleccionar Liberar. No liberar una tarjeta que no haya sido devuelta.

El simulador, cuando esté disponible en desarrollo, reproduce el escaneo sin hardware. No se utiliza como lector real en producción.

## Citas e incidencias

Una cita Programada puede reprogramarse o cancelarse con motivo. Si ya tiene atención activa, resolver primero esa atención.

Agenda y Atenciones permiten filtrar por fecha y estado, buscar por paciente, folio, servicio o dentista y recorrer páginas de 50 registros. La agenda inicia en el día actual y se ordena cronológicamente. Los horarios se muestran y capturan en la zona de la clínica. En recepción puedes buscar y editar pacientes por nombre o folio.

Ante pérdida o daño, seguir la guía de incidencias. La corrección posterior de una atención completada es exclusiva de administración, exige motivo y conserva el historial. Los cambios de precio del catálogo no corrigen por sí solos una atención anterior.

## Reportes

Elegir periodo y filtros. Panel ejecutivo muestra pacientes, atenciones completadas, promedio de minutos, valor de servicios y tiempos entre consultas. Incluye evolución diaria y comparación con el periodo anterior de igual número de días. Equipo y desempeño detalla la actividad por dentista, incluidos los que no tuvieron atenciones. Ver detalle abre sus servicios filtrados. Los tiempos muertos excluyen descansos y periodos no operados.

CSV, PDF y Excel descargan el mismo periodo y filtros. Revisar la fecha de actualización y el total. El valor de servicios no acredita pagos recibidos. Cancelaciones e incidencias no se suman como servicios completados.

Los accesos Hoy, Últimos 7 días, Este mes y Semana anterior facilitan la consulta. La comparación requiere calendario completo y una base comparable. No calculable significa ausencia de turnos/base o valor base cero; no equivale a productividad de cero. Un aumento de duración o tiempo muerto no se interpreta automáticamente como mejora.

## Cobertura excepcional de recepción

El dueño no necesita operar la agenda diariamente. Si debe cubrir recepción, abrir Mi cuenta y completar Autorizar acceso temporal con su contraseña actual y un motivo. Se habilitan las funciones durante un máximo de 30 minutos, únicamente en esa sesión. El aviso superior permite Finalizar acceso antes del vencimiento. La autorización y las operaciones quedan auditadas.

## Cuando aparece un error

No repetir escaneos o vinculaciones indiscriminadamente. Comprobar el estado visible, actualizar y revisar con recepción. Si una operación no tiene confirmación, reportarla a soporte para verificarla. No completar tiempos por memoria ni registrar una atención distinta para ocultar la incidencia.

Antes de comenzar operación real, la clínica realizará capacitación y piloto y registrará los problemas encontrados.
