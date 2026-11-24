# Revisión de claridad y notas de mejora

Fecha: 23 de noviembre de 2026.

## Cambio principal

La pantalla **Usuarios y seguridad** mostraba `Dentista (para rol Dentista)`. Ese campo no entregaba un número: obligaba a enlazar la cuenta con un registro del catálogo de especialistas. La etiqueta y el orden del proceso hacían parecer que el usuario debía conocer un identificador técnico.

El alta quedó simplificada:

1. Administración captura nombre, correo, contraseña temporal y rol.
2. Si el rol es Dentista, la API busca un perfil profesional disponible con el mismo nombre.
3. Si existe uno solo, lo vincula. Si no existe, PostgreSQL crea el perfil y genera el identificador.
4. La cuenta queda enlazada dentro de la misma transacción. El identificador no se muestra ni se solicita al dueño.

También se retiró el selector técnico al editar cuentas, se corrigieron las descripciones genéricas de cada página y se marcaron los campos de contraseña como contraseña nueva para reducir el autocompletado confuso del navegador.

## Segunda revisión de claridad

- **Usuarios y seguridad:** la cuenta del dueño ya no descarga ni muestra el estado técnico ni la bitácora. El diagnóstico reducido se conserva únicamente en el espacio interno del rol Soporte.
- **Equipo y desempeño:** el indicador visible se llama `Pacientes`. El cálculo sigue contando a cada persona una vez dentro del periodo.
- **Vinculación RFID:** recepción ya no elige turno. La API selecciona el horario vigente según la zona de la clínica y marca el día como operado. Si no existe un horario aplicable, crea uno automático para ese día. El primer escaneo deja de fallar por calendario, descanso u operación fuera del horario configurado; se mantienen los bloqueos por dentista o estación ocupados.
- **Registro rápido:** el formulario se muestra antes del buscador y solo exige el nombre. El folio sigue siendo opcional y se genera automáticamente; el estado activo solo aparece al editar un registro existente.

Por indicación del usuario, esta segunda revisión quedó implementada sin ejecutar pruebas adicionales. El contrato OpenAPI y la colección Postman sí se regeneraron para reflejar que `shift_id` ya no es obligatorio al vincular una atención.

## Revisión de las notas entregadas

| Nota                                              | Estado en DentalRisk                  | Decisión                                                                                                                                                                                                    |
| ------------------------------------------------- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Registrar inicio, fin y duración                  | Implementado                          | `attentions` guarda `started_at` y `ended_at`. La duración se calcula a partir de ambas marcas para evitar guardar un tercer valor que pueda quedar inconsistente.                                          |
| Primer escaneo en curso y segundo completado      | Implementado                          | El primer evento cambia la atención de `PENDING` a `IN_PROGRESS`; el segundo la cambia a `COMPLETED` y devuelve la duración.                                                                                |
| Vincular y desvincular tarjetas                   | Implementado                          | `assignments` registra asignación y liberación. La tarjeta solo se libera cuando recepción confirma su devolución física.                                                                                   |
| Estados de tarjeta                                | Implementado con tres estados simples | Se usan `AVAILABLE`, `ASSIGNED` y `BLOCKED`. Daño, pérdida o revisión física permanecen bloqueados hasta rehabilitación; no se añadió un estado de mantenimiento separado porque no cambia el flujo actual. |
| Marcar `released` y regresar tarjeta a disponible | Implementado                          | La liberación actualiza `attentions.released_at`, `assignments.released_at` y `cards.status` dentro de una transacción.                                                                                     |
| Vista consolidada por dentista, estación y turno  | Implementado                          | Los reportes aceptan filtros por dentista, estación/consultorio y turno, además de servicio y periodo.                                                                                                      |
| Operación mutex                                   | Implementado                          | Las operaciones de escritura usan el bloqueo de `operation_mutex` en PostgreSQL para serializar cambios sensibles.                                                                                          |
| Incidencias                                       | Implementado                          | Se registran motivo, responsable, estado anterior y posterior. Una tarjeta con incidencia se bloquea; se puede asignar un reemplazo.                                                                        |

## Puntos que aún requieren validación externa

- Lectores RFID físicos y tarjetas reales en los cuatro consultorios.
- Servicios, precios, plantilla, turnos y calendario aprobados por la clínica.
- HTTPS y respaldo fuera del equipo de producción.
- Piloto de un turno completo con recepción y dentistas.
- Prueba de carga completa de 30 minutos con la versión instalada.
- Actualización de Next.js: al iniciar la validación visual, el entorno mostró un aviso de seguridad para la versión 16.4.2. Debe planearse la actualización y revisar compatibilidad antes de producción.

Estos puntos no se resuelven agregando más campos a la interfaz. Requieren equipo físico, datos confirmados o participación de la clínica.
