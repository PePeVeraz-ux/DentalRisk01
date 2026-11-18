# Datos de trabajo coherentes en PostgreSQL local

El 12 de noviembre de 2026 se sustituyó exclusivamente la carga sintética `QA-20261111` por `QA-20261112`. Se conservó el respaldo previo `.local/backups/before-synthetic-seed-20261111-180358.dump` y se creó `.local/backups/before-coherent-reseed-20261112-144704.dump` antes del cambio. La sustitución se ensayó primero en una base restaurada y desechable con [verify_coherent_data.py](../../scripts/verify_coherent_data.py).

| Entidad | Distribución actual de prueba |
| --- | ---: |
| Consultorios/estaciones QA | 4 |
| Tarjetas QA | 50 |
| Dentistas QA | 7 |
| Servicios QA | 15 |
| Turnos semanales QA | 5 |
| Pacientes QA | 500 |
| Citas QA | 500 |
| Atenciones QA | 500 |
| Incidencias QA de tarjeta | 5 |
| Eventos RFID QA | 956 |
| Semanas con actividad registrada | 20 |

Las atenciones comprenden 475 completadas, cinco cerradas por incidencia de tarjeta, 19 pendientes y una en curso. Cada completada tiene un evento de entrada y otro de salida; cada incidencia y la atención en curso tienen solo entrada. Las cinco citas canceladas no tienen atención. Los reportes semanales se recalcularon con la lógica del sistema; no se generaron semanas vacías para cumplir una cuota.

Las 50 tarjetas se reutilizan a lo largo de las atenciones históricas. Al cierre de la carga, 25 están disponibles, 20 asignadas y cinco bloqueadas por incidencia. Los cuatro consultorios son **datos QA**, no lectores físicos: sus credenciales de estación permanecen vacías hasta configurar y probar cada lector real. La cuenta del dueño y otros registros previos no fueron sustituidos. Las credenciales aleatorias de las cuentas QA nuevas permanecen solo en `.local/seed-coherent-credentials.json`, excluido de Git.

La carga es un escenario de trabajo, no información clínica real. El número de cuatro consultorios fue confirmado por el usuario; los servicios, precios, nombres, horarios y UID todavía requieren cotejo con la clínica. La [auditoría de coherencia](AUDITORIA_COHERENCIA_DATOS_2026-11-12.md) conserva el diagnóstico de la carga anterior y las tareas de aceptación física.
