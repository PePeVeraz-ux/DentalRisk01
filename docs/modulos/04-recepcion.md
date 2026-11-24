# 04. Recepción y agenda

**Cobertura:** RF01–RF02, RF12; P03–P04.

**Datos:** patients, appointments, attentions y assignments. Un folio identifica al paciente; una cita vincula paciente, dentista, servicio y horario. La atención conserva precio, estación y el horario que DentalRisk asignó automáticamente.

**Interfaces:** pacientes y citas, reprogramar, cancelar, crear atención y liberar. Recepción opera con su cuenta individual. El dueño solo puede realizar estas mutaciones mientras tenga acceso excepcional vigente. Dentistas consultan solo su agenda. La interfaz permite iniciar vinculación desde una cita y conservar su referencia.

El resumen de jornada distingue citas de hoy, espera, atenciones en curso e inventario disponible. La espera y la atención en curso incluyen pendientes anteriores. Agenda y Atenciones admiten fecha y estado además de búsqueda/paginación; la fecha corresponde al inicio de la cita o al registro de atención, respectivamente. La agenda se ordena cronológicamente. La interfaz convierte entradas de fecha/hora usando la zona clínica devuelta por la API, incluso si el equipo cliente usa otra zona.

**Reglas:** conflictos de agenda se rechazan; una cita en atención no se reprograma ni cancela sin cerrar primero su atención. La tarjeta debe estar Disponible y las referencias activas. Las asignaciones concurrentes se resuelven en una transacción y solo una tiene éxito.

Con los datos seleccionados, Guardar confirma la vinculación en un clic. Recepción elige paciente, servicio, dentista, estación y tarjeta; el servidor resuelve el horario según el día y la hora. Liberar exige atención cerrada y devolución física; conservar tarjeta Bloqueada cuando corresponda.

**Pruebas:** alta, cita superpuesta concurrente, reprogramación, cancelación, referencia incorrecta de cita, tarjeta ocupada y liberación doble. Los formularios mantienen sus valores durante la actualización automática.

Los listados de agenda y atenciones admiten q, limit y offset, devuelven total y mantienen el filtro de rol en todas las páginas. La interfaz usa páginas de 50 registros y búsqueda por paciente, folio, servicio o dentista. Los selectores de paciente buscan en el servidor y pueden recuperar una referencia individual al editar una cita.

**Recuperación:** ante respuesta no confirmada, actualizar y comprobar el folio antes de repetir. No crear otra cita o atención para compensar un problema de red sin revisar la existente.
