# 06. Incidencias y correcciones

**Cobertura:** RF03, RF16; RB07; P07.

**Interfaces:** POST atención/incident para recepción y administración con acceso excepcional vigente; POST atención/correct exclusivo de administración, sin necesitar permiso de recepción; GET incidents para revisión operativa.

**Pérdida o daño:** exige motivo. Bloquea la tarjeta anterior y termina su asignación. Con tarjeta Disponible de reemplazo conserva folio, estado y marcas previas; sin reemplazo cierra por Incidencia y libera la asignación sin inventar hora final ni ingreso.

**Corrección:** exige atención Completada, motivo, fechas válidas, servicio y dentista. Conserva antes/después en incidents. Si no cambia servicio, conserva precio histórico; si cambia, toma el precio vigente de ese servicio. Los reportes se recalculan de los datos actuales y la auditoría conserva la modificación.

**Pruebas:** reasignar durante atención, leer tarjeta bloqueada, intentar reemplazo ocupado, cierre excepcional excluido de ingresos, corrección no autorizada, fin anterior a inicio y preservación de historial.

**Recuperación:** si una incidencia falla, la transacción revierte todos sus cambios. No liberar manualmente una tarjeta perdida ni darla de alta con otro UID para eludir su bloqueo.
