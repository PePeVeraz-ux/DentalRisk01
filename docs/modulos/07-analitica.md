# 07. Analítica y reportes

**Cobertura:** RF09–RF10, RF17, RF19–RF21; RB06–RB09; P05, P08–P09, P14.

**Interfaces:** GET reports con from/to y filtros por dentista, servicio, estación o turno; GET reports/productivity por mes. Dentista se restringe en el servidor a su propia referencia, incluso si envía otro filtro. Intervalo máximo por consulta: 366 días.

`GET reports/executive` entrega resumen, comparación con el periodo inmediatamente anterior de igual número de días calendario, evolución diaria con ceros explícitos, ranking, detalle por dentista y distribución por servicio. Las lecturas se ejecutan en una transacción de solo lectura con aislamiento REPEATABLE READ. El porcentaje es No calculable cuando la base es cero o falta denominador. Las variaciones de duración y tiempos muertos no se presentan como mejora automática. Los pacientes diarios no se suman para calcular pacientes distintos del periodo.

El dueño accede a Panel ejecutivo, Equipo y desempeño y Reportes. El dentista ve Mi productividad, con datos propios y sin selección de otros dentistas. Los accesos rápidos Hoy, Últimos 7 días, Este mes y Semana anterior respetan la zona clínica. El comparativo del panel usa periodos consecutivos; el endpoint mensual conserva su comparación entre meses completos. Exportaciones mantienen el periodo y filtros efectivos, incluido el dentista impuesto por el servidor.

**Cálculos:** pacientes distintos por periodo; atenciones completadas; promedio de duración por servicio/dentista; suma de precio histórico en centavos. Ranking por pacientes distintos descendente con igual posición en empate. No compara el tiempo de servicios distintos como si fueran equivalentes.

Los tiempos muertos usan atenciones consecutivas reales en una estación, dentro del mismo turno/día; excluyen descansos, cierres y extremos sin observación. Filtrar un servicio no crea intervalos ficticios saltando consultas de otro servicio.

Pacientes por turno suma pacientes distintos de cada turno operado y divide entre días/turnos explícitamente operados, incluidos los de cero atenciones. La comparación mensual utiliza el mes previo; base inexistente/cero produce No calculable. Administración debe verificar periodos completos comparables antes de interpretar el 15%.

**Reporte semanal:** tarea periódica genera la semana anterior de lunes a domingo y actualiza una única fila por periodo. Reiniciar recupera las semanas faltantes desde la primera atención sin duplicar periodos. La semana anterior se regenera para reflejar correcciones; para correcciones más antiguas, usar reporte personalizado calculado en vivo.

La actividad e ingresos se asignan al día de finalización; pacientes por turno se atribuye al turno y día de entrada, incluso si la salida ocurre después de medianoche. El denominador utiliza el calendario operado de la clínica, restringido por turno cuando se aplica ese filtro; no infiere horarios individuales de cada dentista.

**Pruebas:** resultados conocidos, cancelaciones e incidencias excluidas, precio histórico, redondeo, medianoche, días de 23/25 horas, turnos sin atenciones, descansos y base cero. La interfaz actualiza cada cuatro segundos y muestra fecha de generación.
