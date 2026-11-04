# **PLAN DETALLADO DEL PROYECTO**

**Proyecto:** Monitoreo de Productividad en Clínica Dental (Sistema RFID de Control Operativo y Productividad)  
**Estándar de Competencia:** N-FO-02 (Versión 7.0)

## **1\. Información General y Duración del Proyecto**

| Concepto | Detalle |
| :---- | :---- |
| **Nombre del Proyecto** | Monitoreo de Productividad en Clínica Dental |
| **Dueño del Proyecto** | Ing. Angel David Mora Fernandez |
| **Líder del Proyecto** | Sanchez Murillo Edoardo |
| **Objetivo General** | Automatizar el registro de tiempos de atención y reducir a menos de 5 minutos semanales el tiempo administrativo dedicado a la medición de productividad. |
| **Tiempo Total de Ejecución** | **4 meses / 122 días naturales** (del 17 de septiembre de 2026 al 16 de enero de 2027). Nota: Incluye un receso vacacional de 20 días (del 15 de diciembre de 2026 al 3 de enero de 2027), resultando en **102 días de trabajo**. Una vez que termine el proyecto, se contempla el seguimiento operativo entre enero y marzo de 2027 para validar el incremento del 15% mensual en pacientes atendidos por turno. |
| **Presupuesto Máximo Autorizado** | \$4,000.00 MXN (Restricción presupuestal para infraestructura física RFID). |

## 

## **2\. Paquetes de Trabajo, Actividades y Criterios de Aceptación**

| Paquete de Trabajo | Periodo y Duración | Actividades para Terminar el Paquete (según Gantt) | Criterio de Aceptación |
| :---- | ----- | :---- | :---- |
| **PT-01: Inicio y Análisis de Requerimientos** | 17/sep/26 | 25/sep/26 (9 días) | • **ID 1:** Kickoff y organización del proyecto (1 día). • **ID 2:** Levantamiento de requerimientos (6 días). • **ID 3:** Mapeo del proceso de atención y reglas de negocio (8 días). • **ID 4:** Catálogo de servicios, dentistas y costos (8 días). • **ID 5:** Aprobación de requerimientos (2 días). | • Los requerimientos funcionales y operativos del sistema están documentados y aprobados. • El flujo mapeado corresponde a recepción, vinculación, check-in, atención, check-out y reciclaje. • Al menos 15 servicios dentales, dentistas en nómina y costos están registrados correctamente. |
| **PT-02: Diseño del Sistema** | 26/sep/26 | 03/oct/26 (8 días) | • **ID 6:** Diseño de arquitectura cliente-servidor (8 días). • **ID 7:** Diseño de base de datos relacional (8 días). • **ID 8:** Diseño de interfaz y wireframes (8 días). • **ID 9:** Diseño de KPIs y reportes del administrador (8 días). | • Diagramas de arquitectura cliente-servidor y modelo entidad-relacional completados y validados. • Wireframes de recepción y diseño de indicadores (KPIs financieros y operativos) aprobados sin observaciones críticas.  |
| **PT-03: Infraestructura y Hardware RFID** | 18/sep/26 | 22/oct/26 (20 días) | • **ID 10:** Cotización y validación del presupuesto RFID (8 días). • **ID 11:** Adquisición de lectores y 50 tarjetas RFID (6 días). • **ID 12:** Instalación y configuración de lectores USB en estaciones (6 días). | • La compra de equipos respeta el límite presupuestal máximo de \$4,000.00 MXN. • Los lectores RFID USB (13.56 MHz) son reconocidos por las estaciones de cómputo y leen tarjetas a 3–5 cm. • Las 50 tarjetas RFID de PVC están disponibles y pueden identificarse individualmente en el sistema.  |
| **PT-04: Desarrollo de Software (BD, Backend y Frontend)** | 04/oct/26 | 26/nov/26 (54 días) | • **ID 13:** Implementación de base de datos MySQL/PostgreSQL (7 días). • **ID 14:** Desarrollo API REST (39 días). • **ID 15:** Integración de lectura RFID y timestamps (35 días). • **ID 16:** Frontend de recepción: citas y vinculación (39 días). • **ID 17:** Dashboard de administrador y KPIs (39 días). | • La base de datos almacena correctamente pacientes, dentistas, servicios, tarjetas y registros. • La API comunica correctamente lectores RFID, aplicación web y base de datos sin errores críticos. • El primer escaneo registra automáticamente fecha y hora de entrada (check-in) e identifica la estación. • Recepción puede seleccionar paciente, servicio y dentista y asignar una tarjeta disponible. • El administrador puede consultar en su dashboard pacientes, tiempos, ingresos diarios e indicadores en tiempo real. |
| **PT-05: Integración por Módulos** | 12 nov 2026 – 19 nov 2026 (8 días) | • **ID 18:** Integración del flujo completo: recepción → check-in → check-out → reciclaje (8 días). • **ID 19:** Pruebas integrales con los 15 tipos de servicios dentales (8 días). | • Un paciente completa el proceso mediante RFID sin captura manual durante el flujo normal. • El segundo escaneo registra la salida y finaliza el servicio; la desvinculación devuelve la tarjeta al estado "Disponible". • Los 15 servicios del catálogo calculan correctamente su duración en minutos y costo asociado. • Existe un procedimiento funcional en recepción para cerrar el ciclo manualmente en caso de tarjeta perdida o dañada.  |
| **PT-06: Pruebas y Validación de Calidad** | 12 nov 2026 – 14 dic 2026 (27 días activos) | • **ID 20:** Pruebas funcionales y de manejo de errores (15 días). • **ID 21:** Validación de exactitud de tiempos y cálculo de ingresos (11 días). • **ID 22:** Prueba de aceptación del sistema (7 días). • **ID 27:** Pruebas de rendimiento y aceptación final (8 días). | • La duración calculada es exactamente la diferencia entre el primer y segundo escaneo, con margen de error de 0 minutos. • Los ingresos diarios se calculan sumando automáticamente los servicios completados por cada dentista. • La información de productividad semanal se obtiene automáticamente en menos de 5 minutos. • El sistema cumple los requisitos y no presenta errores críticos que impidan operar. |
| **PT-07: Implementación y Piloto Controlado** | 27 nov 2026 – 06 dic 2026 (10 días) | • **ID 23:** Capacitación de personal de recepción y dentistas (7 días). • **ID 24:** Ejecución de piloto controlado en la clínica (10 días). | • El personal operativo ejecuta el proceso de vinculación y escaneo correctamente. • El flujo completo se ejecuta en un escenario real/controlado dentro de la clínica y se registran las incidencias para ajuste. |
| **PT-08: Mejora Continua y Ajuste Operativo** | 27 nov 2026 – 14 dic 2026 (18 días) | • **ID 25:** Correcciones y ajustes derivados del piloto (18 días). • **ID 26:** Validación de reportes semanales y ranking operativo (14 días). | • Se genera 1 reporte semanal automatizado que clasifica a los trabajadores según pacientes atendidos y tiempo promedio por servicio. • El sistema proporciona métricas exactas para identificar tiempos muertos entre consultas y evaluar la productividad. |
| **PT-09: Cierre y Puesta en Producción (Go-Live)** | 04 dic 2026 – 16 ene 2027 (23 días activos) | • **ID 28:** Go-live / puesta en producción (11 días). • **ID 29:** Monitoreo y estabilización inicial (11 días). • **ID 30:** Documentación final y manuales de usuario/técnicos (22 días). • **ID 31:** Presentación, evaluación y cierre del proyecto (13 días). | • Sistema operando de forma estable en producción en todas las estaciones de la clínica. • Los manuales entregados permiten explicar claramente la operación y los procedimientos principales. • Entrega formal y cierre del proyecto aceptado por el Dueño del Proyecto. |

## **3\. Costo Estimado del Proyecto Desglosado por Paquete de Trabajo**

---

De acuerdo con las expectativas y limitantes del proyecto, el desarrollo de software, diseño, pruebas y capacitación son realizados por el equipo interno (costo \$0.00 MXN de mano de obra externa) y se reutilizan las computadoras y red LAN existentes en la clínica. El presupuesto se destina exclusivamente a la infraestructura física RFID con un tope máximo de **\$4,000.00 MXN**.

| Paquete de Trabajo | Concepto de Gasto / Recursos | Costo Estimado (MXN) |
| ----- | :---- | ----: |
| **PT-01: Inicio y Análisis** | Ejecutado por el equipo interno del proyecto; uso de herramientas digitales sin costo. | \$0.00 |
| **PT-02: Diseño del Sistema** | Modelado de base de datos, arquitectura y wireframes con software libre/académico. | \$0.00 |
| **PT-03: Infraestructura y Hardware RFID** | • Lectores de tarjetas RFID por USB (modelo ACR122U o compatible 13.56 MHz para recepción y consultorios): **\$2,700.00** • Lote de 50 tarjetas/tags RFID reutilizables de PVC (13.56 MHz): **\$650.00** • Accesorios de conexión (extensiones/adaptadores USB, soportes de estación y envío): **\$500.00** | **\$3,850.00** |
| **PT-04: Desarrollo de Software** | Desarrollo interno (Node.js, MySQL/PostgreSQL, Frontend Web) y despliegue en servidor local/computadora central de la clínica. | \$0.00 |
| **PT-05: Integración por Módulos** | Pruebas de integración ejecutadas por el equipo interno con el hardware adquirido en PT-03. | \$0.00 |
| **PT-06: Pruebas y Validación** | Pruebas funcionales, de exactitud y de rendimiento realizadas por el equipo interno. | \$0.00 |
| **PT-07: Implementación y Piloto** | Capacitación impartida por el equipo en sitio; ejecución de piloto en instalaciones de la clínica. | \$0.00 |
| **PT-08: Mejora Continua** | Ajustes de código y validación de reportes por parte del equipo desarrollador. | \$0.00 |
| **PT-09: Cierre y Puesta en Producción** | Documentación digital, manuales de usuario y puesta en marcha por el equipo interno. | \$0.00 |
| **COSTO TOTAL ESTIMADO DEL PROYECTO (Tope máximo: \$4,000.00 MXN)** |  | **\$3,850.00 MXN** |

## **4\. Fechas Importantes (Hitos del Proyecto)**

---

| Fecha | Hito / Evento Importante | Descripción y Entregable Clave |
| :---- | :---- | :---- |
| **17 de septiembre de 2026** | Kickoff e Inicio del Proyecto | Arranque formal, alineación del equipo y organización del plan de trabajo (ID 1). |
| **25 de septiembre de 2026** | Aprobación de Requerimientos y Presupuesto RFID | Cierre del levantamiento de requerimientos, mapeo de procesos, catálogo de 15 servicios y validación de cotización de hardware (ID 5, ID 10). |
| **03 de octubre de 2026** | Cierre de la Fase de Diseño | Finalización del diseño de arquitectura cliente-servidor, base de datos relacional, wireframes y definición de KPIs (ID 6 a ID 9). |
| **22 de octubre de 2026** | Infraestructura RFID Lista e Instalada | Recepción de las 50 tarjetas y lectores RFID, e instalación/configuración en las estaciones USB de la clínica (ID 11, ID 12). |
| **11 de noviembre de 2026** | Conclusión de Módulos Web y API REST | Término del desarrollo de la API REST, Frontend de recepción y Dashboard administrativo con KPIs (ID 14, ID 16, ID 17). |
| **26 de noviembre de 2026** | Cierre de Integración RFID y Pruebas de Aceptación | Integración completa de timestamps RFID, pruebas de los 15 servicios y prueba de aceptación inicial del sistema (ID 15, ID 18–20, ID 22). |
| **27 de noviembre de 2026** | Inicio de Capacitación y Piloto Controlado | Arranque de la capacitación a recepcionistas y dentistas, e inicio del piloto controlado en la clínica (ID 23, ID 24). |
| **14 de diciembre de 2026** | Aceptación Final Pre-Producción | Conclusión de correcciones del piloto, validación del ranking semanal y pruebas finales de rendimiento antes del receso (ID 25, ID 26, ID 27). |
| **15 dic 2026 – 03 ene 2027** | Receso Vacacional | Pausa programada de actividades académicas y de desarrollo (20 días naturales). |
| **04 de enero de 2027** | Go-Live / Puesta en Producción | Despliegue definitivo del sistema en operación real e inicio del monitoreo de estabilización (ID 28, ID 29). |
| **16 de enero de 2027** | Cierre Formal del Proyecto | Entrega de manuales finales, presentación de resultados, evaluación y cierre técnico del proyecto (ID 30, ID 31). |
| **Enero – Marzo de 2027** | Evaluación de Impacto Operativo Post-Implementación | Seguimiento de métricas en producción para verificar el aumento del 15% mensual en pacientes atendidos por turno (Objetivo Específico 1.4). |

## **5\. Roles y Responsabilidades de los Participantes Internos**

---

| Nombre del Participante | Rol en el Proyecto | Responsabilidades Asignadas |
| :---- | :---- | :---- |
| **Ing. Angel David Mora Fernandez** | Dueño del Proyecto (Patrocinador / Autorizador) | Autorizar el alcance, validar el cumplimiento de los entregables estratégicos, aprobar el presupuesto y firmar la autorización para pasar a la fase de implementación y cierre. |
| **Sanchez Murillo Edoardo** | Líder del Proyecto y Desarrollador de Arquitectura / API | Coordinar al equipo, organizar las actividades y dar seguimiento al cumplimiento de objetivos y tiempos del Gantt. Facilitar la comunicación interna, liderar el levantamiento/aprobación de requerimientos, diseñar la arquitectura cliente-servidor, desarrollar la API REST, coordinar el piloto controlado y dirigir el Go-Live. |
| **Bojorquez Barraza Jesus Alejandro** | Administrador de Base de Datos (DBA) y Especialista en Hardware RFID | Diseñar, implementar y administrar la base de datos relacional (MySQL/PostgreSQL). Gestionar la cotización, adquisición e instalación de los lectores RFID USB y las 50 tarjetas de PVC. Desarrollar la integración de lectura RFID con marcas temporales (timestamps), aplicar correcciones del piloto y monitorear la estabilización inicial. |
| **Martinez Lopez Santi Erubey** | Desarrollador de Lógica de Negocio, Frontend de Recepción y QA | Mapear el proceso de atención y reglas de negocio, diseñar wireframes y desarrollar el módulo Frontend de recepción (citas y vinculación de tarjetas). Ejecutar las pruebas funcionales y de manejo de errores, impartir la capacitación a recepción y dentistas, y elaborar la documentación final y manuales de usuario. |
| **Ponce Zeferino Alann Eduardo** | Desarrollador Frontend Analítico (UI/UX) y Analista de Métricas | Estructurar el catálogo de servicios, dentistas y costos; diseñar y desarrollar la interfaz del Dashboard de administrador y visualización de KPIs. Ejecutar pruebas con los 15 tipos de servicios, validar la exactitud de tiempos (margen de error 0 min), el cálculo automático de ingresos diarios y los reportes semanales de ranking operativo, además de liderar la presentación de cierre. |

## **6\. Roles y Responsabilidades de los Participantes Externos**

---

| Participante Externo | Rol en el Proyecto | Responsabilidades Asignadas |
| :---- | :---- | :---- |
| **Dirección / Administración de la Clínica Dental** | Cliente Operativo y Proveedor de Información | Proporcionar el catálogo exacto y actualizado de los servicios dentales, costos y personal en nómina antes del diseño de la base de datos. Facilitar el acceso a las instalaciones, computadoras y red LAN, así como utilizar el Dashboard administrativo para evaluar la productividad semanal. |
| **Personal de Recepción de la Clínica** | Usuarios Operativos Primarios (Recepción) | Participar activamente en la capacitación y el piloto controlado. Operar el panel de recepción para registrar citas, vincular tarjetas RFID disponibles a los pacientes al llegar, desvincular (reciclar) las tarjetas al finalizar y ejecutar el cierre manual en caso de extravío o daño de plástico. |
| **Dentistas y Especialistas de la Clínica** | Usuarios Operativos en Consultorio | Asistir a las sesiones de capacitación, adoptar el flujo estandarizado sin resistencia al cambio y supervisar/guiar al paciente para que realice el primer escaneo (check-in al entrar) y segundo escaneo (check-out al salir) en el lector RFID de su estación. |
| **Pacientes de la Clínica** | Usuarios Finales de Tarjeta Temporal | Recibir la tarjeta RFID temporal en recepción, conservarla durante su estancia en la clínica, acercarla físicamente (a una distancia de 3 a 5 cm) al lector del consultorio al iniciar y finalizar su consulta, y devolverla en recepción al retirarse. |
| **Proveedor de Equipos de Radiofrecuencia (RFID)** | Proveedor Externo de Hardware | Suministrar en tiempo y forma los lectores RFID USB (13.56 MHz, modelo ACR122U o equivalente) y el lote de 50 tarjetas de PVC reutilizables dentro del presupuesto autorizado, garantizando el funcionamiento de fábrica de los componentes. |

## **7\. Identificación de Riesgos y Plan Alterno de Manejo (Contingencia)**

---

| Etapa | Riesgos del Proyecto | Probabilidad | Severidad | Plan de Contingencia |
| :---- | :---- | :---: | :---: | :---- |
| **Inicio** | **Falta de alineación inicial en el Kickoff y definición de roles del proyecto.** Durante la sesión de organización inicial, la ausencia de algún participante clave o la falta de claridad sobre las responsabilidades individuales y el alcance operativo puede retrasar el arranque formal de las actividades del cronograma. | Probabilidad Media | Severidad Media | Establecer una agenda estructurada para la reunión de Kickoff, documentar formalmente en una minuta la asignación de roles, canales de comunicación y entregables iniciales, y requerir la confirmación de enterado de todos los integrantes antes de iniciar la fase de análisis. |
| **Análisis** | **Retrasos por dependencias de aprobación del cliente.** Exigir documentos físicos firmados y diagramas aprobados crea un cuello de botella crítico; si el cliente se demora en revisar o autorizar, el cronograma completo del proyecto se paraliza antes de comenzar el desarrollo. | Probabilidad Alta | Severidad Alta | Establecer en el contrato un tiempo límite de revisión (por ejemplo, 72 horas) e incluir una cláusula de "aprobación tácita" que permita al equipo avanzar automáticamente con la siguiente fase si el cliente no emite comentarios o firmas en ese periodo. |
| **Diseño** | **Inconsistencia entre el diseño planteado y los criterios de aceptación.** Algunos entregables de esta fase requieren elementos que corresponden a etapas posteriores, como tarjetas RFID funcionando, endpoints de la API y registros automáticos de escaneo. Esto puede provocar que el diseño sea rechazado o tenga que modificarse cuando el desarrollo ya haya comenzado. | Probabilidad Alta | Severidad Alta | Revisar y validar cada criterio de aceptación antes de iniciar el desarrollo, asegurando que corresponda realmente a la fase de diseño. Cualquier criterio que dependa de hardware o software deberá trasladarse a la etapa correspondiente y dejar aprobados únicamente diagramas, modelos de base de datos, wireframes y definición de KPIs. |
| **Hardware** | **Incompatibilidad técnica de los dispositivos de hardware.** Al momento de la instalación y configuración, los lectores RFID USB podrían presentar conflictos con los puertos, carecer de controladores actualizados, o ser incompatibles con el sistema operativo de las computadoras actuales de la recepción y consultorios. | Probabilidad Media | Severidad Alta | Realizar una prueba de compatibilidad con al menos un lector RFID antes de adquirir e instalar todos los dispositivos, verificando puertos USB, controladores, sistema operativo y lectura correcta de las tarjetas. En caso de incompatibilidad, mantener identificado un modelo alternativo de lector compatible con el sistema. |
| **Software** | **Errores en el registro de tiempos, costos o estados de las tarjetas.** Una falla en la API, la base de datos o la lógica de timestamps puede provocar cálculos incorrectos en los tiempos de atención, ingresos de los dentistas o disponibilidad de las tarjetas RFID, afectando directamente los reportes del sistema. | Probabilidad Alta | Severidad Alta | Implementar pruebas unitarias durante el desarrollo para validar timestamps, costos, estados de tarjetas y cálculos de tiempo antes de integrar los módulos. Mantener respaldos de la base de datos y registros de errores que permitan localizar y corregir rápidamente cualquier inconsistencia. |
| **Integración** | **Fallas en el flujo completo entre recepción, RFID, API, base de datos y dashboard.** Aunque cada módulo funcione correctamente por separado, al integrarlos podrían presentarse errores de comunicación que impidan completar correctamente el proceso desde el check-in del paciente hasta el check-out y reciclaje de la tarjeta. | Probabilidad Alta | Severidad Alta | Realizar pruebas de integración progresivas entre los módulos antes de ejecutar el flujo completo. Utilizar casos de prueba para los 15 tipos de servicios y registrar cada incidencia encontrada para corregirla antes de continuar con las pruebas de aceptación. |
| **Pruebas** | **Detección tardía de errores críticos o problemas de rendimiento.** Durante las pruebas podrían encontrarse fallas que provoquen cálculos incorrectos, tiempos de respuesta elevados o errores cuando varios usuarios utilizan el sistema al mismo tiempo, impidiendo cumplir los criterios de aceptación establecidos. | Probabilidad Alta | Severidad Alta | Ejecutar las pruebas funcionales, de rendimiento y de concurrencia con anticipación al despliegue final, clasificando los errores según su gravedad. No permitir el paso a producción mientras existan incidencias críticas abiertas y repetir las pruebas después de cada corrección importante. |
| **Implementación** | **Uso incorrecto del sistema por falta de capacitación del personal.** Durante el piloto, recepcionistas o dentistas podrían realizar escaneos incorrectos, olvidar liberar tarjetas o utilizar de forma equivocada las funciones del sistema, generando registros que no representen el proceso real de la clínica. | Probabilidad Media | Severidad Alta | Realizar una capacitación práctica antes del piloto y entregar una guía rápida con los procedimientos principales. Durante los primeros días deberá existir soporte para resolver dudas y registrar las incidencias de los usuarios para corregir problemas antes del despliegue definitivo. |
| **Mejora** | **Aparición de cambios adicionales después del piloto que aumenten el alcance del proyecto.** Las pruebas reales pueden generar nuevas solicitudes de funciones, modificaciones en reportes o cambios en el proceso que no estaban contemplados originalmente, retrasando la estabilización del sistema. | Probabilidad Media | Severidad Media | Clasificar las observaciones del piloto entre correcciones necesarias y nuevas funcionalidades. Resolver únicamente los errores y ajustes indispensables para cumplir los requerimientos aprobados, dejando las funciones adicionales documentadas como mejoras futuras para evitar ampliar el alcance del proyecto. |
| **Cierre** | **Fallas críticas después de la puesta en producción.** Aunque el sistema haya superado las pruebas, durante los primeros días de uso real pueden aparecer errores no detectados, interrupciones del servicio o problemas con los accesos que dificulten la aceptación y cierre formal del proyecto. | Probabilidad Media | Severidad Alta | Mantener un periodo de monitoreo y estabilización durante la primera semana después del despliegue, revisando logs, respaldos y funcionamiento de los lectores RFID. Cualquier incidencia crítica deberá corregirse antes de solicitar la firma del acta final de cierre y aceptación del proyecto. |

## **8\. Autorización para Pasar a la Fase de Implementación**

---

Mediante la presente firma, el Dueño del Proyecto aprueba el **Plan Detallado del Proyecto "Monitoreo de Productividad en Clínica Dental"**, incluyendo sus paquetes de trabajo, criterios de aceptación, cronograma, presupuesto estimado y plan de manejo de riesgos, autorizando formalmente al equipo del proyecto para **pasar a la fase de implementación**.

|  \_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_ Ing. Angel David Mora Fernandez Dueño del Proyecto *Autoriza el pase a la Fase de Implementación* |  \_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_ Sanchez Murillo Edoardo Líder del Proyecto *Responsable de la Ejecución y Seguimiento* |
| :---: | :---: |

