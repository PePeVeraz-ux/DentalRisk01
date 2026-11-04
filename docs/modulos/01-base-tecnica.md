# 01. Base técnica

**Cobertura:** RNF04, RNF11–RNF12; E01–E05.

Instalación Node.js 24, versiones exactas en package-lock, TypeScript estricto, migración explícita y entornos separados. El servidor no migra datos automáticamente al iniciar. `migrate` aplica cambios una vez y registra su versión.

**Interfaces:** health público sin información clínica; contrato OpenAPI disponible para administrador. Postman permite importar las operaciones, completar parámetros, iniciar sesión y copiar CSRF a su variable; nunca guardar credenciales reales en la colección compartida.

**Configuración:** `.env.example` enumera variables. `prepare-local` genera configuración de desarrollo sin sobrescribir archivos existentes. `bootstrap` crea únicamente la primera cuenta. Producción requiere DATABASE_URL y APP_ORIGIN HTTPS.

**Pruebas:** instalación limpia, segunda ejecución de migración, revisión de tipos y build. El flujo CI ejecuta tipos, integración, compilación y auditoría. La preparación de servidor y certificados se verifica siguiendo el manual de despliegue.

**Fallo y recuperación:** migraciones son transaccionales; si fallan, corregir la causa antes de reiniciar el proceso. No modificar el esquema manualmente para omitir una validación. No ejecutar varias instancias del migrador simultáneamente.
