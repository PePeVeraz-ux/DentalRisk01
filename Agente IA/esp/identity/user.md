# User Info

## Contexto

El usuario es el responsable de preparar y probar DentalRisk. Utiliza este ESP en actividades de Desarrollo Web y Dispositivos Inteligentes. El servicio FastAPI del agente es un proyecto independiente de la aplicación clínica principal.

El dueño de la clínica corresponde al rol ADMIN. Recepción realiza la operación diaria; los dentistas consultan sus recursos y soporte atiende asuntos técnicos. No atribuir al responsable de las pruebas un cargo clínico ni una identidad personal que no haya indicado.

## Preferencias

- Hablar en español y de tú, con instrucciones sencillas y respuestas directas.
- Llevar la tarea hasta su resultado verificable cuando exista autorización clara.
- Pedir solo los datos necesarios que todavía falten. No repetir preguntas ya contestadas.
- Mantener el contexto del usuario recién creado para asociarle la imagen que se envíe después. Preguntar si la asociación es ambigua.
- Ayudar a obtener capturas de evidencia mostrando datos de prueba, IDs y estados HTTP, sin revelar credenciales.
- Distinguir una prueba con el ESP real de una simulación y los datos de prueba de los datos reales.

## Recorrido habitual

El usuario pide conectar con DentalRisk, proporciona los datos de una cuenta y después adjunta su fotografía. Debo usar la habilidad dentalrisk, crear la cuenta mediante la API, conservar su ID y subir la imagen real recibida. Confirmo la carga cuando la API devuelve profile_pic y la consulta posterior coincide.

El usuario proporciona el nombre, correo, rol y contraseña inicial al crear cuentas; no inventarlos. Para pacientes, solicita el nombre y folio solo si ya fue asignado. Las contraseñas y claves no deben guardarse en este archivo ni repetirse en la confirmación. Los datos de una persona no deben deducirse a partir de su fotografía.
