Práctica 4
Avance de proyecto

DentalRisk · Control operativo y productividad en clínica dental

Extracción de conocimientos en Base de Datos · Parcial 2
Corte documental: 4 de noviembre de 2026, America/Tijuana.

## Resultado de la revisión

Tenemos avance hasta la etapa IV de desarrollo y construcción. La aplicación web, las bases relacionales y las APIs cuentan con implementación y evidencias. La integración del agente es parcial y el componente ECBD se limita a indicadores descriptivos. Esto no representa el cumplimiento completo de la práctica ni la aceptación de producción.

Se revisaron la consigna, documentación, contratos, archivos de implementación y resultados guardados. En esta revisión no se volvieron a ejecutar pruebas, servicios ni hardware. Los resultados citados corresponden a ensayos anteriores y no garantizan que los servicios estén activos hoy.

| Punto de la práctica | Cobertura encontrada |
| --- | --- |
| 1. Alcance, objetivos y planeación | Documentado: SRS, matriz de trazabilidad y plan por módulos. |
| 2. Requerimientos | Parcial: web y seguridad definidos; ECBD/ML e integración total pendientes. |
| 3. Casos de uso e historias | Parcial: recorridos y pruebas; falta una especificación unificada de CU/HU. |
| 4. Arquitectura e integración | Parcial: componentes documentados; sin OLAP ni capa ML implementada. |
| 5. Bases de datos y modelo analítico | ER y modelo relacional existentes; diccionario semántico y modelo analítico pendientes. |
| 6. APIs, seguridad y agente | Contratos y controles existentes; falta diagrama integrado de lógica del agente. |
| 7. Wireframes / mockups | Material existente y capturas; Denti es un prototipo con datos sintéticos. |
| 8. Firmware IoT y agente Edge | Parcial: habilidad y prueba previa del ESP; no firmware propio completo. |
| 9. Backend, base y APIs | Implementados dentro del alcance operativo actual. |
| 10. Frontend y dashboard | Implementados para operación y KPIs descriptivos; sin predicciones ML. |



---

## I. Planeación del proyecto

## 1. Alcance y objetivos de la solución

El propósito de DentalRisk es organizar pacientes, citas y atenciones, registrar tiempos mediante eventos RFID y consultar la productividad de la clínica. Incluye roles de dueño, recepción, dentista y soporte. Los reportes muestran valor de servicios completados; no equivalen a cobros, utilidad o diagnóstico clínico.

Se dispone de un SRS con requisitos y matriz de trazabilidad, un plan detallado con actividades, costos e hitos y un plan de desarrollo por módulos con verificación continua. Estos documentos acreditan planeación; sus fechas no demuestran por sí mismas que una actividad esté terminada. [E1]

| Requisitos / módulo | Entregable y evidencia |
| --- | --- |
| RF01-RF05, RF12-RF16 · Operación | Pacientes, agenda, tarjetas, ciclo RFID e incidencias. API, pruebas y documentación M04-M06. |
| RF09-RF10, RF17-RF20 · Analítica | Indicadores, tiempos muertos, comparativos y exportaciones. M07-M08; analytics.ts y weekly.ts. |
| RF22-RF25 · Seguridad y continuidad | Roles, auditoría, sesiones, respaldo y restauración. M02 y M08. |
| Ampliación de agente · alcance separado | FastAPI, usuarios, fotos y conexión ESP. No integra todavía indicadores clínicos. |


## II. Análisis del sistema

## 2. Estandarización de requerimientos

Web: se documentan registro de pacientes, citas, catálogos, asignación de tarjetas, atención, incidencias, reportes, permisos y continuidad. ECBD: existe agregación de información operacional para KPIs, pero no se identificaron un proceso ETL independiente, un Data Warehouse ni entrenamiento o evaluación de modelos. [E1, E2]

IoT y agente: el sistema principal recibe eventos RFID de una estación autenticada. El servicio independiente permite al agente del ESP crear cuentas y asociar imágenes privadas. No existe todavía una integración completa entre este agente y la analítica clínica. [E2, E5]

Seguridad: DentalRisk utiliza sesiones opacas, cookies HttpOnly, CSRF y permisos en servidor. Agente IA utiliza JWT revocables para usuarios y X-Agent-Key para el ESP. Por ello, el flujo completo dispositivo-servidor-web con JWT descrito como ejemplo en la consigna no está implementado de esa manera. [E2, E5]

## 3. Casos de uso e historias de usuario

Hay recorridos operativos y pruebas para vincular una tarjeta, iniciar/finalizar atención, consultar reportes, crear cuentas y cargar fotos por medio del ESP. Son base para documentar casos de uso. No se localizó un catálogo único de CU/HU con actores, precondiciones, alternativas y aceptación para todos los módulos; tampoco casos implementados de ETL, reentrenamiento o predicción. [E1, E3, E5]


---

## III. Diseño del sistema

## 4. Arquitectura de software e integración

La aplicación principal está organizada en frontend Next.js/React, API Fastify/Node.js, PostgreSQL y adaptador de estación. El agente es otro servicio: FastAPI, su propia base PostgreSQL, MinIO para imágenes privadas y una habilidad ejecutada desde el agente del ESP. [E2, E5]

Las dos bases permanecen independientes. El campo dentist_id del agente es una referencia lógica externa, no una clave foránea entre bases. La arquitectura operativa está documentada; no hay una capa OLAP ni ML construida. Falta consolidar un diagrama de integración que distinga los enlaces reales de los propuestos. [E4]

## 5. Diseño de base de datos y modelo analítico

Se cuenta con diagramas entidad-relación y modelos relacionales de las dos bases: dentalrisk tiene 19 tablas y dentalrisk_agent tiene 6, incluyendo tablas técnicas. El documento generado del esquema describe atributos, tipos, nulabilidad, valores por defecto, claves, restricciones e índices. [E4]

Esto cubre una parte importante del diccionario técnico. Falta completar una descripción de negocio por atributo y los rangos válidos que no estén expresados en restricciones. No se dispone de un diccionario analítico ni de un esquema dimensional para un almacén de datos. No se debe presentar el modelo OLTP como si fuera un modelo de machine learning.

## 6. Diseño de APIs, seguridad y agente

Hay contratos OpenAPI y colecciones Postman para ambos servicios. Las rutas implementadas incluyen POST /api/v1/rfid/events, GET /api/v1/reports/executive, GET /api/v1/reports/productivity y exportaciones. El servicio del agente expone conexión, alta de usuarios y asociación de foto. [E2, E5]

El recorrido del agente documentado es: recibe una petición, consulta su configuración privada, verifica conexión, envía JSON autorizado y confirma el resultado de la API. Para imágenes utiliza la ruta real del adjunto; la API descarga y guarda el archivo en MinIO. Este recorrido está en instrucciones y código, pero no se localizó el diagrama formal del flujo solicitado por la práctica.

No se acreditan rutas genéricas de telemetría, comandos de control físico, inferencia ni un flujo de renovación JWT en el firmware. Las capacidades de explicación de KPIs en agent/policy.py son una propuesta para una entrega posterior, no inferencia conectada a la clínica.

## 7. Diseño de interfaz

Existen referencias de wireframes, capturas de la aplicación web por rol y mockups de Denti para escritorio y móvil. La interfaz clínica corresponde a software implementado. Denti es un prototipo interactivo con datos sintéticos: no inicia sesión, no consume la API y no controla el ESP. [E7]


---

## IV. Desarrollo y construcción

## 8. Firmware IoT y agente inteligente

El avance comprobable es la configuración de una habilidad nativa del agente del ESP y su comunicación HTTP con la API. La evidencia del 26 de octubre de 2026, hora de Tijuana, registra creación de una cuenta por lenguaje natural y almacenamiento de un adjunto JPEG en MinIO desde el dispositivo real. La cuenta y la imagen utilizadas fueron sintéticas. [E6]

No se presenta como desarrollo de firmware propio con SDK, lectura de sensores o voz, renovación JWT y transmisión HTTPS/WSS. La prueba del ESP usó HTTP en red local. Tampoco demuestra lectura RFID física ni inferencia sobre datos clínicos. La validación del lector y las 50 tarjetas sigue pendiente.

## 9. Backend, bases de datos y APIs

La aplicación principal incluye migraciones SQL, autenticación, autorizaciones, catálogos, pacientes, agenda, estados de atención, auditoría, analítica y exportaciones. Existen scripts de instalación, datos de demostración aislados, respaldo cifrado y restauración. El agente incluye migraciones Alembic, gestión de usuarios, JWT, auditoría, idempotencia y almacenamiento de perfiles en MinIO. [E2, E5]

La migración local a PostgreSQL quedó registrada. La base del agente se creó vacía al no existir el archivo SQLite configurado. Por tanto, las cuentas de un ensayo anterior en contenedores no se deben asumir presentes en la instalación local actual. [E4, E5]

## 10. Frontend y dashboard analítico

La aplicación web implementa espacios por rol, agenda, atención, indicadores, comparativos, gráficos y exportaciones CSV, PDF y Excel. El dashboard trabaja con analítica descriptiva: atenciones, pacientes distintos, duraciones, tiempos muertos y productividad por turno. No muestra predicciones provenientes de un modelo entrenado. [E2, E3]

## Pruebas disponibles y límites

Los registros existentes reportan 33 comprobaciones en la verificación general de DentalRisk del 22 de octubre; un ensayo sobre PostgreSQL del 3 de noviembre, hora local, incluye concurrencia, permisos y respaldo/restauración. El archivo pytest-postgres.xml del agente registra 57 pruebas sin errores ni fallos el 3 de noviembre. Estos resultados fueron consultados, no repetidos en esta revisión. [E3, E5]

El rendimiento no está cerrado: el ensayo completo registrado tuvo un máximo RFID de 2,241.95 ms, por encima de dos segundos, y figura como no aprobado. La repetición optimizada quedó interrumpida. Permanecen pendientes la validación de hardware, el despliegue clínico, la capacitación, el piloto y la aceptación. [E3]

## Conclusión del avance

Hasta este corte tengo desarrollada la parte operativa de DentalRisk y una primera integración independiente del agente con el ESP. Puedo presentar evidencia de las cuatro etapas, aclarando sus límites. Todavía no cuento con el módulo completo de extracción de conocimiento ni con la integración clínica final. Por eso reporto lo que ya existe y dejo los puntos restantes como pendientes, sin considerarlos terminados.


---

## Evidencias visuales existentes

Las siguientes capturas ya estaban en el proyecto. Se incorporan como evidencia visual del diseño y de las interfaces; no son capturas de una ejecución realizada durante esta revisión.

![Evidencia visual](C:/Users/lalo3/Desktop/DENTALRISK/.local/screenshots/direccion-desktop.png)

Figura 1. Interfaz de dirección de DentalRisk. Captura guardada del ensayo de interfaz; no acredita datos ni operación clínica actual. [E7]

![Evidencia visual](C:/Users/lalo3/Desktop/DENTALRISK/Agente IA/interface/output/mockup-desktop.png)

Figura 2. Mockup de Denti. Los indicadores proceden de datos sintéticos locales; no hay conexión con la API, el ESP o MinIO. [E7]


---

## Índice de evidencias y fuentes

Rutas relativas a la carpeta DENTALRISK. Estos archivos permiten rastrear cada afirmación del avance. No se incluyen credenciales, información clínica ni archivos privados de configuración.

## Consigna

C:/Users/lalo3/Desktop/Practica 4. Avance de Proyecto.pdf. Tres páginas; admite documento o presentación e indica agregar el avance disponible de etapas III y IV.

## E1 · Planeación y análisis

SRS CLINICA DENTAL.md (requisitos, aceptación y matriz); PLAN DE DESARROLLO DE SOFTWARE.md (M01-M09); Plan Detallado del Proyecto - Monitoreo de Productividad en Clinica Dental.md.

## E2 · Arquitectura y código clínico

docs/arquitectura/001-base.md; apps/api/src/app.ts; apps/api/src/analytics.ts; apps/api/src/weekly.ts; database/001_initial.sql, 002_owner_workspace.sql y 003_analytics_indexes.sql; docs/api/openapi.json y postman.json.

## E3 · Verificación clínica guardada

docs/evidencias/ESTADO.md; verificacion.json; postgresql.json; interfaz.json; interfaz-produccion.json; carga-1800s.json; carga-interrumpida.json. Los nombres de esta lista se ubican en docs/evidencias/.

## E4 · Modelos y transferencia

output/modelos-base-de-datos/Modelos-relacionales.md; docs/evidencias/migracion-postgresql.json; Agente IA/evidence/migracion-postgresql.json. El modelo documenta el esquema verificado el 3 de noviembre de 2026.

## E5 · Servicio Agente IA

Agente IA/README.md; api/v1/agent_api.py; core/security.py; agent/policy.py; docs/api/openapi.json; evidence/ESTADO.md; evidence/pytest-postgres.xml. Las rutas posteriores al README pertenecen a Agente IA/.

## E6 · ESP real

Agente IA/esp/SKILL.md e INSTRUCCIONES.md; Agente IA/evidence/esp-hardware.json. Registro del 27 de octubre a las 06:45 UTC, equivalente al 26 de octubre en Tijuana; prueba con cuenta e imagen sintéticas.

## E7 · Interfaz y mockups

docs/wireframes-figma.md; .local/screenshots/direccion-desktop.png; Agente IA/interface/README.md; Agente IA/interface/output/mockup-desktop.png y mockup-mobile.png.

## Cómo interpretar la cobertura

Documentado significa que existe un artefacto revisable. Implementado significa que se encontró código y contratos correspondientes. Una prueba guardada acredita el alcance y la fecha de ese ensayo. Parcial significa que se cubre solo una parte de lo pedido. No se asigna un porcentaje global porque la consigna no establece ponderaciones.
