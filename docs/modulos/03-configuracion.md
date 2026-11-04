# 03. Configuración operativa

**Cobertura:** RF11, RF13; RB04, RB08; P02.

**Datos:** services, dentists, stations, cards, shifts y calendar_days. UID único; tarjetas Disponible, Asignada o Bloqueada. Los catálogos se inactivan conservando referencias históricas.

**Interfaces:** GET/POST/PATCH para catálogos permitidos; tarjetas se registran y rehabilitan mediante operaciones específicas. El administrador configura turnos, días operados y descansos no superpuestos. La fecha debe coincidir con el día de semana del turno. Una estación puede rotar o revocar su token; el nuevo secreto se muestra una sola vez.

**Reglas:** precio no negativo en centavos; snapshots de precio al vincular; cambiar el catálogo no cambia ingresos históricos. El turno debe iniciar y terminar el mismo día. Operaciones nocturnas que requieran turnos cruzando medianoche necesitan dividir el horario en turnos separados antes del piloto.

**Configuración inicial:** clínica valida al menos 15 servicios, dentistas activos, cantidad de estaciones, 50 UID, turnos y días operados. No usar catálogos DEMO como carga real.

**Pruebas:** unicidad de UID y nombres de servicio, restricciones referenciales, precio inválido, turno inválido, descanso superpuesto, fecha incompatible e inventario individual.

**Fallo:** una tarjeta bloqueada no vuelve a Disponible al cerrar una incidencia. Rehabilitación exige verificación física y motivo, sin asignaciones pendientes.
