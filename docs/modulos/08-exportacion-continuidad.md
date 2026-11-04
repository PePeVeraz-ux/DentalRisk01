# 08. Exportación y continuidad

**Cobertura:** RF18, RF23–RF25; RNF07; P08, P11.

CSV, PDF y XLSX comparten el mismo cálculo y filtros de reportes. Incluyen periodo, zona, fecha de generación, filtros y total. CSV escapa comillas y neutraliza celdas que puedan interpretarse como fórmulas; XLSX escribe nombres como texto, no como fórmulas.

**Respaldo PostgreSQL:** `backup` ejecuta pg_dump, cifra AES-256-GCM y guarda formato DRB1 en un destino fuera de la aplicación. BACKUP_KEY de 32 bytes permanece separado del respaldo. Conservar 30 días por defecto; registrar resultado sin contraseñas. La tarea diaria se configura con el programador del sistema, no depende de un navegador abierto.

**Restauración:** `restore` exige base aislada distinta y no utiliza opciones de borrado. Producción directa está bloqueada. Verificar integridad, conteos, accesos y reportes antes de conciliar y cambiar destino. Los scripts requieren herramientas PostgreSQL instaladas y no son un respaldo de PGlite.

**Objetivos:** pérdida máxima 24 horas, recuperación en cuatro horas, sujetos a demostración en el servidor y destino reales. Registrar duración, responsable, resultado y ubicación de la evidencia. Perder la clave de cifrado impide recuperar el archivo.

**Pruebas:** formatos y totales, datos que empiezan con signos de fórmula, archivo alterado o clave incorrecta, fallo de conexión, respaldo y restauración aislada. Los resultados pendientes no deben registrarse como aprobados.
