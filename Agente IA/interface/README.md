# Interfaz del agente · Denti

Prototipo interactivo para la actividad **Interface del Agente**. Usa datos sintéticos locales: no inicia sesión, no llama a la API, no altera usuarios ni accede al ESP o a MinIO.

## Abrir

Abrir `index.html` con Edge, Chrome o Firefox. Funciona directamente como archivo local, sin instalar paquetes ni levantar servicios. Mantener `index.html`, `styles.css`, `config.js` y `app.js` juntos.

1. En Resumen, cambiar entre 7 días, 3 días y Hoy.
2. En Actividad, buscar por acción o referencia y filtrar el resultado.
3. En Reportes, descargar CSV. La descarga respeta los filtros de Actividad y el periodo global.
4. En Configuración, seleccionar Inventario y pulsar Ver resumen actualizado. Cambian identidad, colores, etiquetas y datos usando los mismos componentes.
5. Volver a DentalRisk para presentar Denti.

Los días del ejemplo están fijados del 21 al 27 de octubre de 2026. No se desplazan con el reloj del equipo. Las referencias son sintéticas y no contienen datos personales.

## Configuración

`config.js` declara `PROJECT_CONFIGS`. Cada objeto contiene identidad, colores, descripción, indicadores, acciones y una serie de datos. `app.js` interpreta esa configuración, genera un conjunto común de operaciones y calcula tarjetas, gráficas y tablas. `styles.css` adapta el diseño a escritorio y móvil.

El objeto es código local de confianza; no se admite cargar JavaScript arbitrario de usuarios. Las cadenas mostradas en tablas se escapan y la exportación neutraliza prefijos de fórmulas.

## Alcance y continuidad

Implementado: cuatro vistas, navegación, periodos, búsqueda, filtro de resultado, estado vacío, CSV, dos configuraciones y adaptación móvil.

Pendiente para conectar datos reales: un adaptador autenticado, endpoint de reportes agregados y registro de intentos fallidos. El servicio actual conserva usuarios, operaciones exitosas y auditoría; no expone un contrato de estadísticas equivalente al del prototipo. No inferir éxitos o fallos a partir de registros incompletos. El servidor deberá aplicar permisos y minimizar datos personales; nunca se incluirá la clave privada del ESP en JavaScript. La interfaz no ejecuta tareas del agente: permite supervisarlas.

## Verificación

`verify.cjs` usa Playwright del repositorio principal y Edge instalado. Ejecutar con Node desde esta carpeta: `node verify.cjs`. Las capturas y el resultado se escriben en `output/`.

- Indicadores para cada periodo conciliados con los registros.
- Filtro, búsqueda y estado vacío.
- CSV filtrado.
- Cambio de dominio por configuración.
- Anchos de 1440 px y 390 px, sin desbordamiento de página en móvil.
- Ausencia de errores JavaScript.

El PDF de la actividad se genera con `build_report.py`, usando ReportLab y pypdfium2 del runtime documental. Las pruebas comprueban el prototipo; no constituyen pruebas de integración con la API, el ESP o MinIO.
