# Guía de incidencias de tarjeta

## Tarjeta perdida o dañada antes de finalizar

1. Identificar la atención por paciente y comprobar su folio y estado.
2. Abrir Incidencia y describir el motivo con suficiente detalle.
3. Para continuar la misma atención, seleccionar una tarjeta Disponible como reemplazo y guardar.
4. Verificar que permanece el mismo folio, que la tarjeta anterior está Bloqueada y que la nueva es la asignada.
5. Si ya había inicio, finalizar con la nueva tarjeta al terminar la atención. No crear una atención adicional.

Si no se va a continuar, registrar la incidencia sin reemplazo. El ciclo queda Cerrado por incidencia, con las marcas realmente disponibles, sin inventar finalización ni ingreso. La tarjeta anterior permanece Bloqueada.

## Tarjeta recuperada

Administración verifica físicamente funcionamiento y UID y utiliza Rehabilitar con motivo. Una tarjeta aún vinculada no puede rehabilitarse. No registrar el mismo plástico con otro identificador para eludir el bloqueo.

## Escaneo sin confirmación

Comprobar conectividad y estado de estación. El adaptador conserva el mismo ID del evento pendiente; REINTENTAR reenvía ese evento. No generar un UUID nuevo hasta resolver el pendiente, pues podría interpretarse como el siguiente escaneo físico.

## Corrección de un servicio completado

Solo administración podrá corregir servicio, dentista o marcas con motivo. Revisar el registro antes y después, comprobar el total del reporte y conservar evidencia. Nunca borrar una atención histórica como procedimiento de corrección.

## Incidencia crítica

Ante datos perdidos, operación bloqueada, acceso indebido o cálculo incorrecto, detener el flujo afectado, comunicar a soporte y registrar fecha, estación y folio. No compartir contraseñas o tokens en la bitácora. Corregir y repetir pruebas antes de dar por resuelta la incidencia.
