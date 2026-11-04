# Revisión del frontend frente a los wireframes

Fecha: 4 de noviembre de 2026.

## Resultado

Se revisaron las 39 referencias de Operación clínica y Dirección y administración del [archivo de Figma](https://www.figma.com/design/qB8VVHs6mRhV3dYSw8n6EY). Se corrigieron diferencias de presentación e interacción y se aplicó la paleta azul solicitada. **No se afirma coincidencia exacta de las 39 pantallas**: varias representan estados o secciones de una misma ruta; otras siguen siendo propuestas o tienen diferencias indicadas abajo.

La nueva consulta `get_design_context` fue rechazada por el límite MCP del plan Starter. La comparación usa los marcos, contenido y capturas producidos en este chat, el índice local `docs/wireframes-figma.md`, el código actual y capturas nuevas del frontend. Posteriormente se actualizó la paleta de los 55 marcos de Figma desde el navegador autenticado; véase `tema-visual-azul.md`. Las diferencias funcionales de esta revisión siguen vigentes.

## Cambios realizados

- Paleta azul: acción principal #2563EB, texto #17324F, fondo #F4F7FC, bordes #DBE5F1 y superficies blancas/azul claro. Los estados de éxito, advertencia y error conservan colores semánticos.
- Formularios en una columna con ancho máximo de 760 px, botones explícitos y foco visible; navegación activa azul y superficies limpias.
- Recepción: accesos a pacientes, nueva cita y vinculación; botón Confirmar vinculación y mensaje de entrega posterior.
- Liberación: panel con contexto y casilla obligatoria de devolución física, en lugar de confirmación del navegador.
- Cancelación de cita y atención pendiente: formulario dentro de la aplicación con motivo.
- Incidencias: explicación de cierre frente a reasignación y conservación de folio/eventos. Correcciones: valores anteriores visibles.
- Atenciones: duración visible con dos decimales. Simulador: entrada/salida confirmada, hora y duración al cierre, o lectura rechazada.
- Dirección: título Panel ejecutivo; tres indicadores principales; gráfico inicial de barras de pacientes distintos por día; promedio en resumen operativo; ranking ordenado con posición y empates.
- Exportación: descarga real con estado de preparación, errores visibles y posibilidad de reintentar conservando filtros. Etiqueta Excel para XLSX.

## Operación clínica

| Referencia | Correspondencia actual y diferencia restante |
| --- | --- |
| O01 Acceso | Cuenta individual y errores presentes. Conserva portada ilustrativa de texto y composición de dos zonas, ahora azul; no es una réplica geométrica del wireframe. |
| O02 Mi cuenta | Cambio de contraseña y revocación de sesiones presentes. No incluye segundo campo de confirmación de contraseña. |
| O03 Cobertura temporal | Contraseña, motivo, límite de 30 minutos y revocación presentes. Muestra hora de vencimiento, no contador regresivo. |
| O04 Jornada | Indicadores y acciones presentes; cuatro indicadores operativos, incluida espera. La lista principal muestra atenciones; agenda se consulta en su módulo. |
| O05 Pacientes | Búsqueda/listado integrados en Recepción. Hasta 200 coincidencias con búsqueda, no paginación de 50 como la propuesta. |
| O06 Alta/edición paciente | Formulario integrado en Recepción, ahora vertical. Estado no editable en este formulario. |
| O07 Agenda | Fecha, estado, búsqueda y paginación presentes. No hay selector dedicado de dentista; puede buscarse por texto. |
| O08 Cita | Crear/reprogramar, zona clínica y rechazo de conflictos presentes; formulario vertical. |
| O09 Cancelación | Motivo ahora dentro del formulario de agenda; no vista separada de detalle. |
| O10 Vinculación | Datos, tarjeta disponible y confirmación explícita presentes. El precio no se muestra junto al servicio antes de guardar; la API conserva el precio. |
| O11 Entrega | Mensaje explícito tras vinculación; no marco independiente. |
| O12 Estación lista | Simulador disponible solo fuera de producción. No hay quiosco web de estación física equivalente al wireframe. |
| O13 Entrada | Estado específico y hora confirmada añadidos al simulador; estado actualizado en listado. |
| O14 Salida | Estado específico, hora y duración con dos decimales añadidos al simulador. |
| O15 Lectura/error | Rechazo y mensaje visibles. El quiosco físico y una pantalla dedicada de operación no confirmada siguen pendientes. |
| O16 Atenciones | Listado, filtros, inicio, fin, valor y duración presentes. Falta vista dedicada del historial de una atención. |
| O17 Liberación | Panel con tarjeta recibida/utilizable obligatoria y confirmación; conserva historial. |
| O18 Incidencia | Motivo y reemplazo opcional presentes, con reglas explicadas. Sin selector separado pérdida/daño. |
| O19 Reasignación/cierre | Se elige mediante reemplazo opcional: con reemplazo reasigna; sin él cierra. No son dos pantallas separadas. |

## Dirección y administración

| Referencia | Correspondencia actual y diferencia restante |
| --- | --- |
| D01 Panel ejecutivo | Tres KPIs, pacientes por día, filtros, resumen y actualización presentes. Conserva bloques adicionales de equipo, detalle y preparación. |
| D02 Equipo | Tabla ordenada por pacientes con posición y empates; incluye integrantes sin actividad. |
| D03 Detalle dentista | Ver detalle abre Reportes con filtro del dentista. No reproduce un marco independiente con gráfico propio. |
| D04 Semanal | Semana anterior y formatos disponibles en Reportes; mantiene estructura general de filtros. |
| D05 Ingresos diarios | Valor por dentista en Equipo y por servicio en Reportes; datos diarios desplegables en gráfico. No hay vista dedicada día/dentista idéntica a Figma. |
| D06 Tiempos muertos | Agregado y filtros de estación/turno presentes; no se muestra tabla de cada intervalo fin-inicio. |
| D07 Productividad mensual | Pacientes por turno y comparación con periodo previo de igual duración presentes. No hay selector independiente del mes base ni comparación mensual exacta como vista dedicada. |
| D08 Exportación | Preparación, descarga, error/reintento y vacío presentes; probado error 503. |
| D09 Dentista | Indicadores y atenciones propios; agenda en módulo separado. Permisos comprobados. |
| A01 Preparación | Checklist y catálogos presentes. |
| A02 Servicios | Precio, edición e inactivación presentes. Sin campo de vigencia futura. |
| A03 Dentistas/estaciones | Catálogos separados por pestañas; credenciales y estado presentes. Sin campos dedicados de ubicación/modelo de lector. |
| A04 Tarjetas | UID, estado y rehabilitación presentes. Sin resumen 3 KPIs, buscador específico ni vista de historial por tarjeta. |
| A05 Calendario | Turnos, fecha operada y descanso presentes. Zona horaria administrada en configuración de servidor, no editable en esta vista. |
| A06 Usuarios | Alta, roles, vínculo a dentista, edición y desactivación presentes. |
| A07 Corrección | Motivo y valores anteriores visibles; la API conserva historial. No hay comparación reactiva completa antes/después; campos de tiempo del formulario trabajan en minutos. |
| A08 Auditoría | Bitácora y detalle presentes; soporte recibe vista reducida. Sin filtros dedicados por fecha/entidad/resultado. |
| A09 Diagnóstico | Estado de base y entorno; lector físico marcado pendiente. No inventa conectividad de hardware ni estado de respaldo. |
| A10 Restauración | Sigue como propuesta visual; respaldo/restauración operan mediante scripts. No se incorporó una acción destructiva web sin su arquitectura de autorización. |
| A11 Restricciones | API rechaza permisos; la interfaz redirige a inicio autorizado y vuelve a acceso al vencer sesión. No existen las tres pantallas dedicadas del wireframe. |

## Validación

- `npm run build`: compilación y TypeScript aprobados después de los cambios.
- `npm run test:ui`, con Edge: aprobado con base aislada en memoria; cuatro perfiles, 1440 × 1000 y 390 × 844, sin desbordamiento horizontal y sin errores JavaScript.
- Se comprobó que no se libera sin marcar devolución; ciclo RFID simulado; permisos y revocación de acceso temporal; exportación CSV real y error 503 visible; tres KPIs y gráfico inicial de pacientes.
- Evidencia de ejecución: `docs/evidencias/interfaz.json`.
- Capturas: `.local/screenshots/` (acceso, vinculacion, agenda, recepcion, jornada, direccion, configuracion, reportes, dentista y soporte; escritorio y móvil).
- Inspección visual de capturas: vinculación, panel ejecutivo y versiones móviles. Los datos son de prueba; no validan lector físico ni servidor de producción.

La tipografía de la aplicación sigue siendo Arial. Figma usó Inter como sustitución por disponibilidad; no se añadió una dependencia externa de fuentes para ocultar esa diferencia documentada.
