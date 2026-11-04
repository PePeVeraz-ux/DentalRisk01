# Plan de Desarrollo de Software

**Proyecto:** DentalRisk - Control operativo y productividad en clínica dental  
**Versión:** 2.0  
**Fecha:** 21 de octubre de 2026  
**Modelo de ejecución:** Desarrollo integral por módulos con verificación continua

## 1. Objetivo y responsabilidades

Construir una aplicación local que gestione pacientes y citas, registre el ciclo de atención mediante RFID y permita consultar productividad, tiempos e ingresos operativos. Cada módulo incluirá arquitectura, implementación, seguridad, pruebas, documentación y evidencia de resultados.

Las funciones técnicas se asumirán de forma integral: coordinación, arquitectura, base de datos, backend, frontend, integración de estación, aseguramiento de calidad, seguridad y preparación de despliegue. La clínica conserva la responsabilidad de validar operación, proporcionar equipos y datos, participar en capacitación/piloto y aceptar formalmente la entrega.

El avance se determinará por entregas verificadas. No se simulará disponibilidad de cuatro desarrolladores ni se declararán completadas actividades por alcanzar una fecha. Los hitos de producción y seguimiento se fijarán conforme a la disponibilidad clínica, el hardware y los resultados de las pruebas.

## 2. Alcance y arquitectura

Aplicación Next.js/React y TypeScript, API REST Fastify/Node.js y PostgreSQL. Servidor local accesible desde la red clínica mediante HTTPS. La base de datos y API no estarán expuestas directamente a equipos cliente. Desarrollo y pruebas tendrán datos y credenciales separados.

La entrega principal incluye identidades y permisos, catálogos, pacientes, citas, inventario de tarjetas, vinculación, entrada/salida, incidencias, correcciones, dashboard, reportes y exportaciones CSV/PDF/Excel, auditoría, respaldo, restauración y manuales.

El contrato de estación será independiente del lector: evento UUID, UID y estación autenticada; el servidor decide transición y hora. Mientras no exista hardware, se utilizarán simulación y un adaptador de entrada reemplazable. La aprobación física del lector permanecerá pendiente hasta demostrar compatibilidad y lectura real.

IA, voz y ESP32-S3 son ampliaciones posteriores y requieren un cambio explícito de alcance. No se incluyen expediente clínico, facturación ni registro de cobros efectivos.

## 3. Entregas por módulo

| Entrega | Contenido | Dependencia | Condición de terminación |
| --- | --- | --- | --- |
| M01 Base técnica | Entornos, configuración, migración, contratos y controles automáticos | Inicio | Instalación reproducible, esquema versionado y compilación válida. |
| M02 Identidad y seguridad | Sesiones, usuarios, roles, CSRF, auditoría y límites | M01 | Acceso autorizado y revocación verificados; sin secretos expuestos. |
| M03 Configuración | Servicios, precios, dentistas, estaciones, tarjetas, turnos y calendario | M01-M02 | Datos válidos, disponibilidad y referencias históricas preservadas. |
| M04 Recepción | Pacientes, agenda, vinculación y liberación | M02-M03 | Flujo operativo y conflictos concurrentes comprobados. |
| M05 Atención RFID | Eventos, estados, duración, simulador y adaptador de estación | M04 | Entrada/salida sin duplicidad y reintentos idempotentes. |
| M06 Incidencias | Pérdida, daño, reasignación y correcciones | M05 | Folio y auditoría conservados; ingresos no duplicados. |
| M07 Analítica | Dashboard, ranking, productividad, tiempos muertos y reporte semanal | M05-M06 | Cálculos conciliados con resultados independientes. |
| M08 Exportación y continuidad | Archivos, respaldo cifrado, recuperación y diagnóstico | M02, M07 | Formatos válidos, permisos correctos y restauración aislada demostrada. |
| M09 Implementación | Instalación local, capacitación, piloto, estabilización y cierre | M01-M08 | Pruebas aprobadas, lector validado, cero críticos abiertos y aceptación clínica. |

Las interfaces de usuario se revisarán en escritorio y móvil. Los formularios conservarán datos durante refrescos y los estados distinguirán éxito, rechazo y operación no confirmada.

## 4. Seguridad y verificación

- Argon2id para contraseñas; sesiones opacas revocables con cookie HttpOnly, SameSite y Secure en producción.
- Permisos por rol y recurso en backend, incluyendo aislamiento de cada dentista y exportaciones.
- Validación estricta, consultas parametrizadas, protección CSRF, orígenes explícitos y límites de acceso.
- Credenciales revocables por estación; tarjetas sin datos personales y sin función de autenticación de usuario.
- Transacciones, bloqueos y restricciones PostgreSQL contra asignaciones o cierres concurrentes duplicados.
- Precio histórico en centavos, tiempos UTC y auditoría de correcciones con valores anteriores y posteriores.
- Roles de base de datos separados para migración, ejecución y respaldo; auditoría no modificable por la aplicación.
- HTTPS, configuración sin secretos incorporados y procesos de aplicación sin privilegios de administrador.

Cada tarea debe superar revisión de tipos, pruebas relevantes, revisión de seguridad y documentación antes de considerarse terminada. Las pruebas verificarán los 15 servicios, campos inválidos, permisos, sesiones revocadas, relecturas, concurrencia, incidencias, recuperación, tiempos, importes, filtros y formatos exportados.

La carga objetivo será de diez sesiones y dos estaciones simuladas con 10,000 registros históricos durante 30 minutos. Se registrarán motor de datos, duración, errores y latencias; la simulación no sustituirá el ensayo con lector real. La operación RFID deberá responder en menos de dos segundos. La medición administrativa semanal deberá obtenerse con menos de cinco minutos de intervención.

Cada módulo tendrá propósito, requisitos cubiertos, interfaces, reglas, permisos, pruebas y limitaciones en docs/modulos. Las decisiones arquitectónicas estarán separadas y los resultados reales se conservarán en docs/evidencias. Los manuales de usuario, técnico e incidencias estarán disponibles en PDF y en su fuente editable.

## 5. Parámetros y recursos

| Concepto | Valor inicial |
| --- | --- |
| Zona clínica | America/Tijuana, configurable antes de datos reales. |
| Relectura | Ventana de dos segundos. |
| Dashboard | Actualización automática cada cuatro segundos. |
| Sesión | Ocho horas; revocable antes de vencimiento. |
| Reporte semanal | Semana anterior de lunes a domingo; una fila por periodo y regeneración segura. |
| Respaldo | Diario, cifrado AES-256-GCM, retención de 30 días, destino separado. |
| Objetivos de recuperación | RPO 24 horas y RTO cuatro horas; demostrar en equipo instalado. |
| Hardware RFID | Tope $4,000 MXN; cantidad de lectores y cotización deben validarse antes de compra. |

No se inventarán pacientes, precios ni horarios reales. Los datos sintéticos estarán identificados y prohibidos en producción. La clínica configurará turnos, descansos, días operados, especialidades, servicios y responsables.

## 6. Puesta en operación y aceptación

1. Confirmar parámetros, datos y presupuesto de la instalación.
2. Identificar y verificar lector físico, controlador y 50 tarjetas; probar cada estación y lectura a 3-5 cm.
3. Preparar PostgreSQL, HTTPS, cuentas restringidas, respaldo y restauración en el servidor local.
4. Capacitar al personal y ejecutar un piloto representativo con bitácora.
5. Corregir incidencias y repetir pruebas afectadas.
6. Autorizar producción con cero incidencias críticas abiertas.
7. Observar la primera semana operativa y verificar lectores, reportes, logs y respaldos.
8. Entregar versión identificada, manuales, contratos, configuración sin secretos, evidencias y acta.

No se restaurará un respaldo sobre nuevas atenciones sin conciliación. Si falla un despliegue, se preservarán estado y logs y se verificará compatibilidad de esquema antes de revertir código.

El objetivo del 15% de incremento mensual se medirá después de producción sobre periodos completos comparables y una línea base validada. Es un objetivo de negocio que requiere observación real; no se dará por alcanzado por aprobar las pruebas técnicas.
