# Especificación de Requisitos de Software (SRS)

**Proyecto:** Sistema Automatizado de Control Operativo y Medición de Productividad en Clínica Dental  
**Versión:** 2.2  
**Fecha:** 22 de octubre de 2026  
**Estado:** Para revisión y aprobación  
**Responsable de revisión:** Líder del Proyecto  
**Autoridad de aprobación:** Dueño del Proyecto y Dirección de la Clínica

## 1. Introducción

### 1.1 Propósito

Definir el comportamiento del sistema, sus interfaces, restricciones, datos, reglas de negocio y condiciones de aceptación. El documento está dirigido al equipo de desarrollo, responsables de hardware, personal de recepción, dentistas y administración de la clínica.

Los requisitos establecen las condiciones de operación y los resultados que deberán verificarse antes de la puesta en producción y la aceptación del sistema.

### 1.2 Objetivo

Automatizar las marcas de inicio y fin de atención mediante RFID, calcular duración e importe de servicios completados y reducir a **menos de cinco minutos semanales** el trabajo administrativo dedicado a obtener la medición de productividad.

El objetivo de negocio es incrementar un **15% mensual los pacientes atendidos por turno**. El sistema proporcionará datos para evaluar este indicador durante el seguimiento operativo.

### 1.3 Alcance de la entrega principal

La entrega comprende recepción y citas, catálogos, inventario y vinculación de tarjetas, lectores RFID USB en estaciones, registro automático de tiempos, incidencias, dashboard, reportes exportables, accesos, respaldo, pruebas, piloto, capacitación, documentación y estabilización.

El flujo normal requiere seleccionar datos y liberar tarjetas en recepción. La automatización elimina la captura manual de tiempos durante la atención; no elimina esas acciones de recepción.

### 1.4 Ampliaciones propuestas

La integración con ESP32-S3, comandos de voz, agenda adaptativa y administración por IA se contempla como ampliación posterior mediante RF06–RF08. Su incorporación requiere un cambio de alcance con arquitectura, presupuesto, permisos y pruebas específicos.

No se incluye un expediente clínico, facturación ni registro de cobros efectivos. Una solicitud de esas capacidades deberá tratarse como cambio de alcance.

### 1.5 Definiciones

- **UID:** identificador de la tarjeta; referencia una asignación temporal, no contiene los datos personales del paciente.
- **Atención:** registro de un paciente, servicio, dentista, estación y ciclo de tiempos.
- **Check-in / check-out:** primer y segundo escaneo válidos que inician y finalizan una atención.
- **Reciclaje:** liberación de la asignación temporal para reutilizar una tarjeta físicamente devuelta.
- **Ingreso operativo:** suma del precio registrado de servicios completados. No representa necesariamente dinero cobrado.
- **Incidencia crítica:** pérdida o corrupción de datos, acceso no autorizado, cálculo incorrecto que afecta reportes o bloqueo del flujo esencial sin alternativa controlada.

## 2. Descripción general

### 2.1 Arquitectura e interfaces

La arquitectura de referencia para la entrega principal será cliente-servidor: aplicación web, API REST, base de datos relacional y un componente de integración con lectores USB en las estaciones existentes.

| Componente | Especificación |
| --- | --- |
| Frontend | Next.js / React, recepción y dashboard responsivos. |
| Backend | API REST con Node.js y Fastify, desarrollada en TypeScript. |
| Base de datos | PostgreSQL en producción, con esquema versionado y migraciones explícitas. |
| Hardware | Lectores RFID USB de 13.56 MHz, ACR122U o equivalente compatible; 50 tarjetas reutilizables de PVC. |
| Integración local | Componente o servicio que identifica lector/estación y comunica eventos a la API. La tecnología concreta se documentará tras validar compatibilidad. |
| Despliegue | Servidor local o computadora central de la clínica. El uso de alojamiento externo requiere la definición técnica y presupuestaria de D03–D04. |

La API recibirá identificador de evento, UID, estación y tipo de operación cuando aplique; devolverá resultado, identificador de atención y estado confirmado. Documentará autenticación, validaciones, errores y códigos HTTP apropiados. Las pruebas de consulta incluirán respuestas 200; las demás operaciones usarán el código correspondiente a su resultado.

### 2.2 Usuarios y permisos propuestos

| Rol | Operaciones permitidas |
| --- | --- |
| Recepción | Gestionar pacientes y citas, consultar disponibilidad, vincular, liberar y registrar incidencias con motivo. |
| Dentista | Consultar sus atenciones y estado operativo. No administra cuentas ni precios. |
| Dueño / Administración | Consultar todos los indicadores y exportaciones; administrar catálogos, usuarios y permisos; autorizar correcciones. Su espacio principal es ejecutivo. |
| Soporte autorizado | Configurar estaciones, respaldo, restauración y diagnóstico según permisos asignados; sin acceso adicional por defecto. |
| Paciente | Portar y presentar la tarjeta; sin acceso a la aplicación. |

La clínica validará esta distribución antes del piloto. Las autorizaciones se aplicarán también en la API.

### 2.3 Dependencias

La clínica proporcionará catálogo validado de al menos 15 servicios, precios, dentistas, horarios y turnos, equipos y red disponibles, personal para pruebas y autorización de entregables. Se verificará lectura a 3–5 cm en el entorno instalado. Número de estaciones, carga simultánea y configuración de los equipos se documentarán antes de adquirir hardware.

## 3. Requisitos funcionales

Cada requisito funcional tiene un identificador único para relacionarlo con sus reglas de negocio y pruebas de aceptación. RF06–RF08 corresponden a ampliaciones propuestas.

### 3.1 Recepción, catálogos y RFID

- **RF01 — Vinculación.** El sistema permitirá seleccionar paciente, servicio y dentista y asociarlos a una tarjeta Disponible. Con esos datos previamente seleccionados y desde la pantalla de vinculación, la asociación se completará en menos de tres clics, incluida la confirmación. La selección previa no forma parte de ese conteo; esta interpretación requiere validación del cliente.
- **RF02 — Liberación.** Recepción podrá liberar una tarjeta tras completar o cerrar de forma excepcional la atención. La liberación conservará el historial y devolverá a Disponible solo la tarjeta recuperada y utilizable.
- **RF03 — Incidencias.** Ante tarjeta perdida o dañada, recepción podrá cerrar excepcionalmente o reasignar la atención, registrando usuario, motivo y fecha. La tarjeta afectada quedará bloqueada. El cierre excepcional no se contabilizará automáticamente como servicio completado y no inventará marcas de tiempo. La reasignación conservará el folio y los eventos previos sin duplicar atenciones ni ingresos.
- **RF04 — Entrada.** El primer escaneo válido registrará automáticamente inicio, estación, tarjeta, paciente, servicio y dentista. Se confirmará visualmente el resultado en la estación.
- **RF05 — Salida.** El segundo escaneo válido en la estación autorizada registrará fin, calculará duración y marcará la atención Completada. La duración será exactamente fin menos inicio en la precisión almacenada; su visualización en minutos seguirá la regla RB06.
- **RF11 — Catálogos.** El administrador podrá crear, actualizar e inactivar servicios, dentistas y estaciones. La carga inicial contendrá al menos 15 servicios, precios en MXN y dentistas validados, sin duplicar identificadores. La inactivación no eliminará registros históricos.
- **RF12 — Pacientes y citas.** Recepción podrá registrar y actualizar la identificación mínima del paciente y crear, reprogramar o cancelar citas con fecha, horario, servicio y dentista. El sistema impedirá duplicar una atención activa para la misma cita y advertirá conflictos de horario antes de confirmar.
- **RF13 — Inventario.** El sistema registrará individualmente las 50 tarjetas iniciales con UID único, estado e historial de asignaciones. Se verificará físicamente la lectura de cada tarjeta.
- **RF14 — Eventos e integridad.** Cada escaneo tendrá identificador de evento y se procesará una sola vez. Reintentos del mismo evento devolverán el resultado previo. Las relecturas dentro de una ventana configurable se ignorarán sin cerrar la atención; su duración se acordará y probará con la clínica antes del piloto.
- **RF15 — Errores de lectura.** El sistema rechazará de manera controlada tarjetas desconocidas, bloqueadas o no vinculadas y escaneos en estaciones no autorizadas, sin modificar tiempos ni importes. El mensaje indicará la acción necesaria y el evento quedará registrado.
- **RF16 — Correcciones.** Las correcciones de tiempos, servicio o dentista requerirán permiso de administrador, motivo y conservación de valores anteriores. Los reportes se recalcularán sin borrar la trazabilidad.

### 3.2 Reportes e indicadores

- **RF09 — Reporte semanal.** Generar automáticamente un reporte por semana con atenciones completadas, pacientes distintos atendidos y duración promedio por servicio y dentista. El ranking ordenará por pacientes distintos descendente y mostrará los promedios por servicio sin mezclar especialidades como si fueran equivalentes; los empates conservarán la misma posición. La regla definitiva y el cierre semanal se aprobarán antes del piloto.
- **RF10 — Ingresos operativos.** Sumar automáticamente el precio registrado de los servicios completados por dentista y día. Los cancelados e incompletos quedarán excluidos y los ajustes serán trazables. El dashboard identificará el resultado como valor de servicios completados, salvo que se apruebe otra definición.
- **RF17 — Dashboard.** Mostrar atenciones, pacientes distintos, tiempos promedio, tiempos muertos e ingresos operativos con filtros por fecha, dentista, servicio, estación y turno. Incluir gráficos, última actualización y actualización automática tras eventos confirmados; la latencia máxima quedará definida en D05.
- **RF18 — Exportación.** Permitir exportar reportes semanales y financieros en CSV, PDF y Excel (.xlsx), conservando filtros, periodo, fecha de generación, unidades y totales.
- **RF19 — Tiempos muertos.** Calcular por estación el intervalo entre fin de una atención completada e inicio de la siguiente dentro del mismo turno. No incluir cierres, descansos ni periodos no laborables configurados. No inferir tiempo muerto antes de la primera atención ni después de la última sin una regla adicional aprobada.
- **RF20 — Productividad por turno.** Conservar fecha, turno y dentista para comparar mensualmente pacientes distintos atendidos por turno. Mostrar línea base, periodos comparados y variación porcentual. Si falta línea base o es cero, mostrar No calculable y explicar la causa.
- **RF21 — Medición administrativa.** Permitir obtener y exportar la medición semanal con menos de cinco minutos acumulados de intervención del administrador, sin transcribir datos ni efectuar cálculos externos.

### 3.3 Administración y continuidad

- **RF22 — Cuentas.** Autenticar usuarios individuales y permitir al administrador activar, desactivar y asignar roles. Impedir operaciones fuera de los permisos del rol.

  La cuenta ADMIN representa al dueño o dirección e inicia en un panel de KPIs, con comparativos, evolución diaria y desempeño por dentista. Recepción opera pacientes, agenda y tarjetas con su propia cuenta. Si el dueño debe cubrir recepción, requerirá contraseña actual y motivo para un permiso excepcional de hasta 30 minutos, revocable, limitado a esa sesión y auditado. El dentista consultará exclusivamente su actividad y el soporte no accederá a pacientes. La navegación tendrá módulos con direcciones persistentes; sus restricciones también se aplicarán en el servidor.
- **RF23 — Auditoría.** Registrar accesos fallidos, asignaciones, escaneos, incidencias, correcciones, cambios de precios y permisos, respaldos y restauraciones con usuario o componente, fecha, entidad y resultado. Los usuarios operativos no podrán alterar la bitácora.
- **RF24 — Respaldo y recuperación.** Ejecutar respaldos automáticos y permitir restauración controlada por personal autorizado, conservando registros de éxito o fallo. Periodicidad, retención, destino y objetivos de recuperación deberán definirse en D07 y demostrarse mediante restauración de prueba.
- **RF25 — Fallos de comunicación.** Si no se puede persistir una operación, mostrar estado no confirmado y evitar anunciar éxito. Los reintentos serán idempotentes. Al restablecer servicio se verificará consistencia. Esta entrega no promete funcionamiento sin conexión; el procedimiento de contingencia distinguirá tiempos reales, recuperados y no disponibles.

### 3.4 Ampliaciones sujetas a cambio de alcance

- **RF06 — Comandos médicos por voz:** propuesta para extender citas o solicitar cambios sin teclado.
- **RF07 — Agenda adaptativa:** propuesta para detectar retrasos y sugerir cambios o alertas a recepción.
- **RF08 — Administración por lenguaje natural:** propuesta para solicitar altas y modificaciones mediante IA. De aprobarse, deberá aplicar permisos, validación y confirmación explícita de cambios, sin acceso irrestricto a la base de datos.

Estos tres requisitos no forman parte de la entrega principal. Su incorporación requiere un cambio de alcance autorizado.

## 4. Reglas de negocio y datos

### 4.1 Estados

| Entidad | Estados y transiciones permitidas |
| --- | --- |
| Tarjeta | Disponible → Asignada al vincular. Asignada → Disponible al liberar tras cierre y devolución. Cualquier estado utilizable → Bloqueada por pérdida o daño. Solo el administrador podrá rehabilitar una tarjeta recuperada tras verificarla. |
| Atención | Pendiente → En atención con entrada válida → Completada con salida válida. Pendiente → Cancelada. Pendiente o En atención → Cerrada por incidencia con motivo. La liberación de tarjeta no borra ni cambia automáticamente el resultado de la atención. |
| Cita | Programada → Reprogramada, Cancelada o Atendida. Atendida requiere atención completada; una incidencia conservará su resultado separado hasta revisión. |

### 4.2 Reglas

- **RB01:** un UID tendrá como máximo una asignación activa. Una atención tendrá como máximo una tarjeta activa.
- **RB02:** una estación no iniciará dos atenciones simultáneas. Las atenciones de un mismo dentista no se solaparán salvo excepción operativa expresamente aprobada y documentada.
- **RB03:** una tarjeta liberada no podrá iniciar una nueva atención sin nueva vinculación. Un tercer escaneo no modificará una atención completada.
- **RB04:** conservar el precio del servicio asociado a la atención al vincularla. Cambiar el catálogo no alterará ingresos históricos. Un cambio durante la atención requerirá RF16.
- **RB05:** las marcas usarán una referencia horaria común, se almacenarán en UTC y se mostrarán en la zona horaria de la clínica. El mecanismo de sincronización se documentará; no se aceptará fin anterior al inicio.
- **RB06:** almacenar tiempos al menos con precisión de segundos. Calcular duración en segundos y convertir a minutos dividiendo entre 60. Mostrar dos decimales y redondear solo al presentar. El margen de error aritmético será cero respecto de las marcas almacenadas; no implica precisión física absoluta del reloj.
- **RB07:** excluir cancelaciones e incidencias de promedios e ingresos de servicios completados. Mostrar sus cantidades por separado.
- **RB08:** registrar turno explícito de la atención. Periodos diario y semanal se calcularán con zona horaria y horario de corte aprobados. Para comparar productividad se usarán poblaciones y turnos equivalentes.
- **RB09:** variación mensual = (valor actual − valor base) / valor base × 100. La media de pacientes por turno usará pacientes distintos dentro de cada turno y número de turnos efectivamente considerados, incluidos turnos operados sin atenciones. La línea base, calendario de turnos y comparación contra mes previo u otro periodo se resolverán en D08.

### 4.3 Modelo mínimo de información

| Entidad | Información mínima |
| --- | --- |
| Paciente | ID interno, identificación necesaria para recepción, estado. No se exige información clínica. |
| Usuario y rol | ID, nombre, rol, credencial protegida, estado. |
| Dentista | ID, nombre, especialidad y estado. |
| Servicio | ID, nombre, precio MXN, vigencia y estado. |
| Cita | ID, paciente, servicio, dentista, fecha/horario y estado. |
| Estación y lector | ID, ubicación, lector asociado y estado. |
| Tarjeta y asignación | UID, estado, atención, fechas de asignación/liberación y responsable. |
| Atención | Folio, cita si aplica, paciente, servicio, precio registrado, dentista, estación, turno, inicio, fin, duración y estado. |
| Evento/incidencia/auditoría | ID único, entidad, marca temporal, origen, usuario, resultado, motivo y cambios cuando corresponda. |
| Calendario operativo | Turnos, fechas operadas, descansos, cierres y zona horaria. |

Usar claves primarias y foráneas, restricciones de unicidad y transacciones para las operaciones de asignación y cierre. La clínica aprobará campos personales obligatorios, responsables de acceso y retención antes de la carga real.

## 5. Requisitos no funcionales y restricciones

- **RNF01 — Hardware y presupuesto.** La infraestructura física RFID, incluidos lectores, 50 tarjetas y accesorios de conexión, no deberá exceder $4,000 MXN. La cantidad de lectores y su compatibilidad se validarán mediante cotización antes de la adquisición. La incorporación de ESP32-S3 requiere aprobar su alcance y costo.
- **RNF02 — Rendimiento.** La validación RFID y confirmación persistida de la operación deberán tardar menos de dos segundos bajo la carga simultánea aprobada. Medir desde envío del evento por el componente local hasta respuesta de confirmación, incluyendo API y persistencia. El ensayo informará además el tiempo desde lectura hasta confirmación visual. D05 debe fijar carga, volumen, duración y condiciones de prueba.
- **RNF03 — Interfaz.** Aplicación responsiva para escritorio de recepción y móvil del administrador, sin pérdida de acciones ni datos esenciales en los dispositivos acordados. Errores y estados serán legibles y no dependerán exclusivamente del color.
- **RNF04 — Calendario.** El desarrollo, integración, pruebas e implementación deberán concluir a más tardar en marzo de 2027. Las fechas de aceptación, puesta en producción, estabilización y cierre se establecerán en D02. El seguimiento de impacto operativo tendrá un periodo definido a partir de la puesta en producción.
- **RNF05 — Integridad.** Impedir duplicidad de asignaciones y cierres, duración negativa y eventos sin referencias válidas, incluso ante solicitudes concurrentes. Fallos parciales no dejarán datos incoherentes.
- **RNF06 — Seguridad.** Proteger credenciales sin almacenarlas en texto plano; validar permisos en cada operación; proteger comunicaciones autenticadas; no incluir contraseñas ni datos personales innecesarios en logs. Las tarjetas no almacenarán datos personales.
- **RNF07 — Continuidad.** Documentar contingencia de red, energía y lector; mostrar fallos claramente y recuperar operación sin duplicar registros. Verificar respaldo y restauración antes de producción según D07.
- **RNF08 — Estabilización.** Conservar evidencia de logs durante la primera semana operativa tras producción. No aceptar cierre con caídas o incidencias críticas sin resolver; después de corregir, repetir el periodo de observación acordado.
- **RNF09 — Compatibilidad.** Verificar un lector antes de compra general: sistema operativo, controlador, puertos USB, reconocimiento en Administrador de Dispositivos y lectura de tarjetas a 3–5 cm. Registrar modelos, versiones y estaciones soportadas.
- **RNF10 — Calidad.** Cero incidencias críticas abiertas al autorizar producción y cierre. Registrar las demás incidencias con responsable y decisión de aceptación o corrección.
- **RNF11 — Mantenibilidad.** Entregar configuración reproducible, esquema/migraciones de datos, documentación de API y manual técnico con instalación, actualización, diagnóstico, respaldo y recuperación.
- **RNF12 — Despliegue.** La entrega principal utilizará los equipos existentes de la clínica y software sin costo de licencia. La capacidad del servidor, la conectividad y los accesos se validarán antes del piloto. Cualquier servicio externo requerirá identificar su costo operativo y responsable de mantenimiento.

## 6. Entregables

| ID | Entregable y evidencia requerida |
| --- | --- |
| E01 | SRS versionado en PDF, revisado y firmado por la autoridad de aprobación. |
| E02 | Diagrama de flujo aprobado, arquitectura, modelo entidad-relación, wireframes y definición de KPIs. |
| E03 | Cotización validada, inventario de 50 UID y acta de compatibilidad/instalación de lectores. |
| E04 | Sistema desplegado, catálogos iniciales validados y cuentas activas por rol. |
| E05 | Colección y documentación Postman, matriz de pruebas de los 15 servicios, resultados de integración, exactitud y carga, y reporte de incidencias. |
| E06 | Reportes exportados y contrastados con los registros de prueba. |
| E07 | Guía PDF de tarjeta perdida/dañada, anulación, reasignación y cierre sin alterar indebidamente reportes. |
| E08 | Capacitación práctica, manual de usuario y manual técnico en PDF. |
| E09 | Bitácora de piloto, correcciones, logs de estabilización y prueba de restauración. |
| E10 | Actas de aceptación y cierre firmadas; plan de seguimiento de impacto y responsables. |

## 7. Plan de verificación y aceptación

Cada prueba identificará versión, entorno, ejecutor, datos, pasos, resultado esperado, resultado real, evidencia y estado. Los siguientes escenarios son obligatorios; su inclusión no significa que ya se hayan ejecutado.

| Prueba | Escenario y condición de éxito |
| --- | --- |
| P01 | Revisar SRS, flujo y diseño: entregables E01–E02 completos y aprobados, decisiones bloqueantes resueltas. |
| P02 | Validar catálogos sin duplicados y leer físicamente las 50 tarjetas en estaciones compatibles; inventario completo. |
| P03 | Vincular desde pantalla con datos preseleccionados en menos de tres clics; impedir UID ocupado y operaciones concurrentes duplicadas. |
| P04 | Ejecutar recepción → entrada → atención → salida → liberación para cada uno de al menos 15 servicios: estación, precio, estados y duración correctos, sin capturar tiempos manualmente. Conservar bitácora digital. |
| P05 | Probar marcas conocidas, cruce de día y redondeo: duración exacta respecto de fin menos inicio e ingresos iguales a la suma de completados; excluir cancelaciones e incidencias. |
| P06 | Probar UID desconocido, bloqueo, relectura, reenvío, tercer escaneo y estación incorrecta: sin cierres ni cargos duplicados. |
| P07 | Simular pérdida/daño, cierre excepcional, reasignación y corrección autorizada: mantener folio e historial y conservar resultados verificables en reportes. |
| P08 | Generar reporte semanal, ranking y dashboard y exportar CSV/PDF/XLSX: filtros, pacientes distintos, duración e ingresos coinciden con datos de prueba. Comprobar tiempos muertos y turnos con ejemplos conocidos. |
| P09 | Cronometrar todas las acciones administrativas necesarias para obtener y exportar la medición de una semana representativa: total de intervención menor de cinco minutos, sin cálculo externo. |
| P10 | Ejecutar carga concurrente con parámetros D05: cada operación del conjunto de aceptación satisface RNF02, sin pérdida, duplicidad ni corrupción. Reportar cantidad de solicitudes, errores y distribución de latencias. |
| P11 | Probar accesos por rol y desactivación, interrupción de comunicación, reintento y restauración: permisos efectivos y consistencia preservada. |
| P12 | Capacitar, ejecutar piloto clínico y registrar incidencias. Corregir errores críticos y repetir escenarios afectados antes de producción. |
| P13 | Verificar despliegue, credenciales y primera semana de estabilización con logs, sin interrupciones críticas abiertas; entregar manuales y obtener actas firmadas. |
| P14 | Verificar reporte mensual por turno con línea base y fórmula aprobadas, incluyendo base cero y datos faltantes. El logro del 15% se evalúa en seguimiento, separado de aceptación técnica. |

## 8. Matriz de trazabilidad

La matriz relaciona cada criterio de aceptación con los requisitos, entregables y pruebas que permiten verificarlo.

| Criterio | Requisitos o entregables | Verificación |
| --- | --- | --- |
| CA01 Especificaciones aprobadas | E01 | P01 |
| CA02 Flujo aprobado | E02, RF01–RF05 | P01, P04 |
| CA03 Catálogos | RF11, RNF05 | P02 |
| CA04 Lectores reconocidos | RNF09, E03 | P02 |
| CA05 Inventario 50 tarjetas | RF13, E03 | P02 |
| CA06 Base relacional desplegada | Sección 4.3, RNF05, E04 | P02, P04 |
| CA07 API y Postman | Sección 2.1, E05 | P04, P11 |
| CA08 Inicio y estación | RF04 | P04 |
| CA09 Vinculación en menos de tres clics | RF01 | P03 |
| CA10 Dashboard y gráficos | RF17 | P08, P10 |
| CA11 Segundo escaneo | RF05, RF14 | P04, P06 |
| CA12 Exactitud de duración | RF05, RB05–RB06 | P05 |
| CA13 Pruebas de 15 servicios | RF11, E05 | P04–P05 |
| CA14 Reciclaje | RF02, RB03 | P04 |
| CA15 Guía de incidencias | RF03, RF16, E07 | P07 |
| CA16 Reporte exportable | RF09, RF18 | P08 |
| CA17 Ingresos diarios | RF10, RB04, RB07 | P05, P08 |
| CA18 Integración completa | RF01–RF05, E05 | P04 |
| CA19 Cero incidencias críticas | RNF10, E05 | P06–P07, P11–P12 |
| CA20 Estrés y acta | RNF02, RNF10, E10 | P10, P13 |
| CA21 Medición administrativa | RF21 | P09 |
| CA22 Piloto | E09 | P12 |
| CA23 Correcciones y estabilidad | RNF08, RNF10, E09 | P12–P13 |
| CA24 Manuales | RNF11, E08 | P13 |
| CA25 Exportación CSV/PDF/Excel | RF18 | P08 |
| CA26 Rendimiento concurrente | RNF02 | P10 |
| CA27 Producción y credenciales | RF22, E04 | P11, P13 |
| CA28 Logs de estabilización | RNF08, E09 | P13 |
| CA29 Cierre formal | E10 | P13 |
| CA30 Tiempos muertos | RF19 | P08 |
| CA31 Productividad mensual por turno | RF20, RB09 | P14 |
| CA32 Respaldo y recuperación | RF24, RNF07 | P11 |

## 9. Condiciones para autorizar producción y cierre

La producción requiere pruebas funcionales, de integridad, permisos, rendimiento, respaldo y flujo integral aprobadas, cero incidencias críticas abiertas, capacitación concluida y acta de autorización. No basta con disponer de pantallas o respuestas exitosas aisladas de la API.

El cierre requiere además manuales PDF, piloto y correcciones documentados, periodo de estabilización validado, evidencias entregadas y acta firmada. El seguimiento de impacto operativo tendrá su propio periodo y responsable y no sustituirá la aceptación técnica.

## 10. Control de cambios

El líder registrará cada cambio con motivo, requisitos afectados, impacto en costo, fecha, arquitectura y pruebas, responsable y decisión del Dueño del Proyecto. Los cambios autorizados deberán reflejarse en los requisitos y criterios de aceptación correspondientes. Las nuevas funciones se evaluarán separadamente de las correcciones necesarias para cumplir la entrega acordada.

## 11. Definiciones técnicas y validaciones operativas

| ID | Decisión y propuesta | Responsable y momento límite |
| --- | --- | --- |
| D01 | Entrega principal con RFID USB. IA, voz y ESP32-S3 quedan como ampliaciones posteriores sujetas a cambio de alcance. | Dueño y Dirección, ante cualquier ampliación. |
| D02 | Establecer fechas de aceptación, producción, estabilización, cierre y seguimiento operativo dentro del plazo de RNF04. | Dueño y líder, antes de aprobar el calendario de ejecución. |
| D03 | Definir cantidad de lectores y cotización de lectores, tarjetas y accesorios dentro del límite de RNF01. Identificar por separado cualquier costo de operación o alojamiento externo. | Dueño y responsable de hardware, antes de compra. |
| D04 | Next.js/React, TypeScript, API Node.js/Fastify, PostgreSQL y servidor local. Verificar equipo, integración USB y compatibilidad física. | Responsable técnico, antes de instalación y piloto. |
| D05 | Ensayo inicial: diez sesiones web, dos estaciones simuladas, 10,000 atenciones históricas y 30 minutos. Relectura: dos segundos. Dashboard: actualización cada cuatro segundos. Validar escritorio, móvil y latencia completa con el lector real. | Responsable técnico y clínica, antes de aceptar producción. |
| D06 | Ratificar ingreso como valor de servicios completados, formatos CSV/PDF/XLSX, conteo de clics, ranking, reglas de agenda y permisos propuestos. | Administración y recepción, antes de validar interfaz/reportes. |
| D07 | Respaldo diario cifrado, retención de 30 días, destino separado, objetivo de pérdida máxima de 24 horas y recuperación en cuatro horas. Validar almacenamiento, recuperación, datos personales mínimos y conservación del historial en la instalación real. | Administración y responsable técnico, antes de piloto con datos reales. |
| D08 | Definir zona horaria de la clínica, turnos/cortes, línea base, comparación mensual y periodo de seguimiento del objetivo del 15%. | Dirección y analista de métricas, antes del piloto y medición base. |
| D09 | Validar reglas de estados, precios y excepciones y asignar responsables de ejecución y verificación de los criterios de aceptación. | Líder y Dueño, antes de aprobar la matriz de aceptación. |

Cada decisión deberá registrar su resultado, responsable y fecha de aprobación. Los parámetros pendientes deberán definirse antes de iniciar la etapa que dependa de ellos.

## 12. Registro de aprobación

| Participante | Responsabilidad | Nombre y firma | Fecha |
| --- | --- | --- | --- |
| Dueño del Proyecto | Autoriza alcance, restricciones y cambios | Pendiente | Pendiente |
| Dirección de la Clínica | Valida operación, datos, indicadores y aceptación | Pendiente | Pendiente |
| Líder del Proyecto | Confirma viabilidad, trazabilidad y cronograma | Pendiente | Pendiente |
| Responsable de pruebas | Confirma plan y condiciones de verificación | Pendiente | Pendiente |
