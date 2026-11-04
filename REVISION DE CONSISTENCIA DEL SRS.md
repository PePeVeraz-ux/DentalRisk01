# Revisión de consistencia del SRS de Clínica Dental

Fecha: 20 de octubre de 2026.

## Dictamen

**El SRS está parcialmente alineado y necesita ajustes antes de servir como base de aceptación.** Describe el ciclo principal de vinculación, entrada, salida, reciclaje, reportes e ingresos. Sin embargo, introduce IA y ESP32-S3 sin respaldo en la planificación, omite condiciones verificables de aceptación y convive con referencias que se contradicen entre sí.

Esta revisión evalúa la documentación disponible. No acredita funcionamiento del software, ejecución de pruebas, firmas, compras o instalación de equipos. Los siete archivos originales se conservaron sin cambios.

## Fuentes y método

Se revisaron íntegramente estos archivos de la carpeta del proyecto:

- `SRS CLINICA DENTAL.md`: especificación evaluada, secciones 1 a 3.
- `Plan Detallado del Proyecto - Monitoreo de Productividad en Clinica Dental.md`: objetivos, PT-01 a PT-09, presupuesto, hitos, roles, riesgos y autorización.
- `Criterios de aceptacion - Hoja 1.csv`: 31 criterios asociados a actividades.
- `Criterios de aceptacion - Hoja 2.csv`: riesgos y contingencias.
- `Diagram_de_Gantt'claude - Criterios de Aceptación.csv`: 24 criterios organizados por área.
- `Diagram_de_Gantt'claude - Gantt.csv`: 31 actividades, fechas y dependencias.
- `Diagram_de_Gantt'claude - Costos por Etapa.csv`: resumen, supuestos, costos directos y detalle por actividad.

La matriz siguiente utiliza los 24 IDs del CSV de criterios del Gantt porque su correspondencia entre área y criterio es más coherente. No se asume que esa versión esté aprobada o tenga prioridad formal. Se contrastaron adicionalmente los 31 criterios de Hoja 1 y el plan. Los IDs de ambos catálogos no son intercambiables.

Estados: **Cubierto** significa que el comportamiento está expresado en el SRS, **Parcial** que faltan condiciones o evidencia de aceptación, **Ausente** que no se exige expresamente. No representan resultados de pruebas.

## Diferencias principales

| Prioridad | Hallazgo y evidencia | Ajuste recomendado |
| --- | --- | --- |
| Alta | SRS 1.2, 1.3, 2.1 y RF06–RF08 añaden ESP32-S3, voz, agenda adaptativa y creación de usuarios por IA. El plan y los CSV contemplan estaciones con lectores USB y no incluyen actividades, costos ni aceptación para esas capacidades. | Retirarlas de la línea base o documentarlas como ampliación pendiente de aprobación, con alcance, recursos, pruebas y calendario propios. No hay evidencia documental de autorización de esa ampliación. |
| Alta | RNF04 fija finalización a más tardar en marzo de 2027. El plan establece cierre el 16/01/2027 y seguimiento de impacto enero–marzo. El Gantt fija producción el 20/02/2027 y cierre el 09/03/2027. | Elegir y versionar un calendario oficial. Si rige el plan, corregir RNF04 y separar entrega de seguimiento. Si rige el Gantt, actualizar también el plan. No inferir prioridad por la hora de modificación de los archivos. |
| Alta | RNF01 limita hardware a $4,000 e incluye ESP32-S3. El plan estima $3,850 para lectores, tarjetas y accesorios. Costos por Etapa estima $5,000 de hardware, $2,450 de hosting y $109,747 totales con mano de obra y contingencia. | Conciliar conceptos y supuestos. El hardware del CSV supera el tope en $1,000. El total de $109,747 no es directamente comparable con el límite exclusivo de infraestructura física. |
| Alta | RF09 exige reporte semanal, pero no exige obtener la medición administrativa en menos de 5 minutos semanales, objetivo general del plan. | Añadir el objetivo medible y un procedimiento de cronometraje. Distinguir esfuerzo administrativo semanal de latencia técnica de una consulta. |
| Alta | RF04 menciona error de 0 minutos al registrar el inicio. Los criterios exigen exactitud de la duración respecto de ambas marcas de tiempo. | Exigir duración = fin − inicio y definir precisión, conversión a minutos y redondeo. No equiparar exactitud aritmética con error físico nulo del reloj o de la lectura. |
| Media | RF04 no exige registrar la estación del escaneo. | Incorporar identificador de estación a cada evento y asociarlo a la atención correspondiente. |
| Media | RNF02 exige menos de 2 segundos, pero no bajo concurrencia, como Hoja 1 ID27. | Añadir prueba de carga y acordar usuarios/lectores simultáneos, volumen de datos, condiciones de red y criterio de medición. Las fuentes no proporcionan valores suficientes para completar esa prueba. |
| Media | Los roles aparecen como descripciones, pero faltan requisitos verificables de acceso. Hoja 1 ID28 exige credenciales activas. | Definir autenticación y permisos por rol. La creación autónoma de usuarios de RF08 requiere reglas adicionales si se conserva. |

## Matriz de trazabilidad de los 24 criterios

Fuente de IDs: `Diagram_de_Gantt'claude - Criterios de Aceptación.csv`.

| ID | Criterio resumido | SRS | Estado y diferencia |
| --- | --- | --- | --- |
| 1 | Especificaciones en PDF firmadas y autorizadas | Documento general | Parcial: existe SRS Markdown, sin condición explícita de PDF, firma ni aprobación. |
| 2 | Diagrama aprobado de recepción a reciclaje | 1.2, 2.1, RF01–RF05 | Parcial: hay descripción textual, falta diagrama aprobado. |
| 3 | Catálogos iniciales validados sin duplicados | 2.3, RF01, RNF05 | Parcial: 15+ servicios y selección de dentista; faltan carga validada y unicidad de catálogos. RNF05 solo aborda vinculaciones de tarjetas. |
| 4 | Lectores conectados y reconocidos por estaciones | 1.3, 2.1 | Parcial: menciona lectores, pero cambia el foco a ESP32-S3 y no exige reconocimiento USB en estaciones. |
| 5 | 50 tarjetas físicas con UID registrado y legible | RNF01, RF01 | Parcial: incluye lote y UID para vinculación; no exige inventario individual de las 50 tarjetas. |
| 6 | Esquema relacional desplegado con pacientes, dentistas y transacciones | 1.3, RNF05 | Parcial: cita motor e integridad, sin entidades mínimas ni condición de despliegue. |
| 7 | API Node.js, Postman y respuestas exitosas de prueba | 1.3, RF06, RNF02 | Parcial: alterna FastAPI/Node.js y no exige documentación ni pruebas en Postman. Acordar códigos de éxito por operación en vez de imponer 200 a todas sin revisar su semántica. |
| 8 | Primer escaneo registra hora y estación | RF04 | Parcial: falta estación. |
| 9 | Vinculación a tarjeta disponible en menos de tres clics | RF01, RNF05 | Parcial: falta límite de clics y exigencia explícita de tarjeta disponible. Definir desde qué pantalla se cuentan los clics. |
| 10 | Dashboard con gráficos de tiempos y métricas en tiempo real | 2.1, RF10 | Parcial: ingresos en tiempo real; faltan gráficos y actualización explícita de tiempos/KPIs. |
| 11 | Segundo escaneo cierra servicio activo | RF05 | Cubierto en comportamiento. Falta precisar manejo de relecturas accidentales como regla complementaria. |
| 12 | Duración coincide exactamente con diferencia entre marcas | RF04–RF05 | Parcial: calcula duración, pero la exigencia de exactitud está aplicada al inicio, no a la diferencia. |
| 13 | Matriz de pruebas exitosa de los 15 servicios y costos | 2.3, RF01, RF10 | Parcial: catálogo e ingresos previstos, sin matriz ni aceptación por servicio. |
| 14 | Liberación devuelve tarjeta a Disponible | RF02 | Cubierto en comportamiento. |
| 15 | Guía PDF de anulación/reasignación sin alterar reportes | RF03 | Parcial: existe cierre/cancelación, faltan guía, reasignación y preservación de reportes. |
| 16 | Reporte semanal exportable CSV o PDF por trabajador | RF09 | Parcial: incluye frecuencia, pacientes y promedio; falta exportación. Hoja 1 ID26 también solicita PDF/Excel. Unificar formatos requeridos. |
| 17 | Total automático diario por dentista | RF10 | Cubierto en la suma de servicios completados. Aclarar si se mide valor de servicios o cobros efectivos: las fuentes usan ambos términos y no describen pagos. |
| 18 | Bitácora de prueba integral sin captura manual | RF01–RF05, 1.2 | Parcial: flujo descrito, falta bitácora y prueba integral. Aclarar que recepción sí selecciona datos y libera tarjetas; la automatización aplica al registro normal de tiempos. |
| 19 | QA con cero incidencias críticas y excepciones controladas | RF03, RNF05 | Parcial: aborda excepciones específicas, falta condición de cero incidencias críticas y reporte QA. |
| 20 | Acta firmada tras prueba de estrés concurrente | RNF02 | Ausente como condición de aceptación final. |
| 21 | Medición administrativa menor a 5 minutos | RF09 | Ausente como umbral. El plan lo expresa como esfuerzo semanal; este CSV lo formula como tiempo de consulta. Conciliar definición. |
| 22 | Piloto clínico con bitácora de incidencias | Sin requisito específico | Ausente como entregable de aceptación. |
| 23 | Versión estable con correcciones del piloto | Sin requisito específico | Ausente como condición de entrega. |
| 24 | Manual de usuario y técnico en PDF | Sin requisito específico | Ausente como entregable. |

Los diagramas, actas, manuales y pruebas no tienen que convertirse todos en requisitos funcionales. Deben quedar vinculados en una sección de entregables y aceptación o en documentos controlados que el SRS referencie.

## Criterios adicionales del plan y Hoja 1

- **Tiempos muertos entre consultas:** PT-08 exige métricas para identificarlos. RF09 mide tiempo promedio de atención, que no equivale a tiempo muerto. Añadir requisito, fórmula y alcance por estación o dentista.
- **Impacto de productividad:** el plan contempla validar un incremento del 15% mensual en pacientes por turno entre enero y marzo de 2027. El SRS no exige información por turno ni comparación mensual. Incorporar los datos y reportes necesarios, definir línea base y fórmula. El incremento es un objetivo de negocio, no un resultado garantizado por instalar software.
- **Rendimiento concurrente:** Hoja 1 ID27 añade menos de 2 segundos bajo alta concurrencia. Falta cuantificar la carga.
- **Producción y accesos:** Hoja 1 ID28 exige despliegue y credenciales activas.
- **Estabilización:** Hoja 1 ID29 exige logs de la primera semana sin interrupciones críticas. El SRS no fija observabilidad ni aceptación de estabilización.
- **Respaldos:** Hoja 2, riesgo de Software, y el plan de riesgos los contemplan. RNF05 no los especifica. Derivar requisitos de respaldo y recuperación si se adoptan esas contingencias como obligatorias, acordando periodicidad y recuperación esperada.
- **Cierre:** Hoja 1 IDs30–31 exige manuales PDF y acta final firmada. Deben agregarse a entregables, sin afirmar que ya existen.

## Inconsistencias de las referencias que deben resolverse

1. **Hoja 1 mezcla actividades y criterios de otras fases.** ID5, aprobación de requerimientos, exige lectores reconocidos; ID6, arquitectura, exige inventario de tarjetas; ID8, wireframes, exige endpoints Postman; ID10, cotización, exige vinculación en menos de tres clics; ID25, correcciones del piloto, exige manuales. El riesgo de Diseño de Hoja 2 ya reconoce el problema. Reasignar por contenido, no por coincidencia numérica.
2. **Calendario divergente.** El plan indica producción el 04/01/2027 y cierre el 16/01/2027; el Gantt indica 20/02/2027 y 09/03/2027. La redacción del SRS solo coincide de manera general con marzo.
3. **Dependencias ambiguas del Gantt.** ID5 se programa el 12/10/2026, aunque depende de ID4, que termina el 20/10/2026. ID15 inicia el 19/11/2026 y depende de ID14, que termina el 26/11/2026. ID18 inicia el 26/11/2026 aunque sus predecesoras 15, 16 y 17 terminan el 07/12/2026. Si son relaciones fin-inicio, hay conflicto; si se busca solapamiento, especificar tipo de relación e hitos parciales.
4. **Presupuesto y despliegue divergentes.** El plan reutiliza servidor local y considera mano de obra externa en cero. El CSV imputa tarifas de trabajo y hosting por siete meses, explícitamente marcados como estimaciones. Acordar si se reporta desembolso autorizado, costo económico del equipo o ambos por separado.
5. **Conteo de días.** El plan llama a 102 días «de trabajo» tras descontar únicamente 20 días de vacaciones de 122 días naturales. Eso no equivale a días hábiles de lunes a viernes. El CSV de costos sí utiliza días hábiles; definir una convención común.
6. **Responsabilidades distintas.** El plan asigna mapeo y pruebas funcionales a Martinez Lopez Santi Erubey, mientras el Gantt asigna ID3 a Bojorquez Barraza Jesus Alejandro e ID20 a Ponce Zeferino Alann Eduardo. Conciliar responsables.
7. **Ambigüedad de automatización.** El criterio integral pide ausencia de intervenciones manuales, pero el plan y SRS necesitan selección y liberación en recepción. Redactar la condición como ausencia de captura manual de tiempos durante el flujo normal.
8. **Cobros frente a servicios completados.** Acordar si ingreso significa valor nominal del servicio completado o pago recibido. No añadir un módulo de cobros sin una decisión de alcance.

## Cambios propuestos para el SRS

1. Ajustar introducción, arquitectura y tecnologías al alcance RFID aprobado. Mantener IA/ESP32-S3 como propuesta separada mientras no exista respaldo documental.
2. Completar RF01 con disponibilidad de tarjeta y el umbral de interacción de recepción; RF03 con anulación, reasignación y conservación del historial; RF04 con estación; RF05 con exactitud de duración; RF09 con exportación; RF10 con definición de ingreso.
3. Agregar requisitos para catálogos iniciales, inventario de UID, entidades mínimas de datos, citas, KPIs de tiempos muertos y datos por turno. El SRS menciona gestión de citas en la descripción de usuarios, pero no la desarrolla como requisito verificable.
4. Incorporar medición administrativa semanal menor de 5 minutos y rendimiento menor de 2 segundos bajo carga acordada. Conservarlos como métricas distintas.
5. Añadir una sección de aceptación con pruebas para los 15 servicios, flujo integral, concurrencia, cero errores críticos, piloto, estabilización, manuales y aprobación formal.
6. Agregar una matriz requisito–criterio–prueba–evidencia y control de versión/aprobación de la línea base.
7. Resolver fecha, presupuesto, arquitectura y formatos de exportación antes de publicar una versión definitiva. No hay evidencia suficiente para escoger unilateralmente cuál referencia reemplaza a las demás.

**Resultado:** el ciclo RFID central está representado. La alineación completa requiere corregir tanto el SRS como las referencias contradictorias. No se recomienda declarar cumplimiento total a partir de los archivos actuales.
