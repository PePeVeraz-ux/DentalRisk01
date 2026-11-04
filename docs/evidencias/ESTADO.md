# Estado de verificación de DentalRisk 1.0.0

Fecha de cierre: 22 de octubre de 2026.

La entrega implementa dirección, recepción, dentista y soporte con rutas persistentes y permisos en servidor. Incluye panel ejecutivo, comparativos, evolución diaria, desempeño por dentista, agenda, atención RFID, incidencias, correcciones auditadas, exportaciones y continuidad.

## Verificado

- 33 comprobaciones automatizadas aprobadas, tipos, compilación, contratos y auditoría sin vulnerabilidades conocidas: verificacion.json y dependencias.json.
- Cuatro perfiles en escritorio y móvil, restricciones de acceso, desconexión y recuperación: interfaz.json.
- Compilación optimizada sobre HTTPS de prueba, cookies seguras, CSP y cuatro perfiles: interfaz-produccion.json. Usa certificado efímero y base aislada; no acredita Docker, Caddy ni servidor clínico.
- PostgreSQL real, conciliación de analítica con una referencia independiente, concurrencia, permisos restringidos y respaldo/restauración cifrados: postgresql.json. La prueba de actualización de esquema usa PGlite y está identificada por separado.
- Instalación local limpia, cuenta del dueño y ausencia de datos clínicos o cuentas sintéticas: instalacion-local.json. La base anterior se conserva.
- Manuales PDF de usuario, técnico e incidencias actualizados y revisados visualmente, con documentación de los nueve módulos.

## Rendimiento pendiente de cerrar

El ensayo anterior de 30 minutos completó 7,076 solicitudes sin errores ni duplicados, pero su máximo RFID fue 2,241.95 ms, superior al límite de dos segundos. No se aprueba ese resultado. Se conserva en carga-1800s-previa-optimizacion.json.

Se optimizó la analítica para agregar en PostgreSQL sin descargar el historial al backend y se añadieron los índices de la migración 003. Una referencia independiente de 240 registros y nueve combinaciones de filtros, descansos y fechas concilió los cálculos, incluido el cambio horario.

La repetición optimizada se detuvo al solicitar el cierre inmediato de la entrega. El último avance observado fue de 1,080 segundos, 5,181 solicitudes y cero errores. Esto es evidencia parcial; no acredita el ensayo completo ni su latencia máxima. Su registro está en carga-interrumpida.json. Debe repetirse la carga de 30 minutos antes de aprobar rendimiento.

Las pruebas de carga usan Fastify.inject, diez sesiones, dos estaciones simuladas y 10,000 registros históricos en PostgreSQL. No incluyen lector físico, red LAN ni negociación HTTPS.

## Pendiente para producción

- Cerrar la prueba completa de rendimiento.
- Verificar lector real, controlador, 50 tarjetas y rango físico.
- Validar servicios, precios, usuarios y calendario reales con la clínica.
- Instalar PostgreSQL y HTTPS en el equipo de producción, con certificados confiables. El motor Docker no estuvo disponible para ejecutar las imágenes.
- Programar respaldos en almacenamiento separado y demostrar los objetivos de recuperación en el equipo instalado.
- Capacitación, medición administrativa, piloto, estabilización y aceptación clínica.

La entrega de código no equivale a aceptación de producción. El hardware y las validaciones clínicas permanecen pendientes.
