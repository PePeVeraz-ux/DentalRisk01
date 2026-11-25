# Demostración del primer entregable

1. Iniciar los servicios con el procedimiento del README y abrir `/docs`. Mostrar el título DentalRisk Agente IA y los grupos de rutas.
2. Ejecutar `bootstrap.py` para crear al dueño, si todavía no existe. No mostrar `.env` ni la contraseña en la grabación o exposición.
3. En Authorize, escribir el correo en `username` y la contraseña individual. Consultar `GET /api/v1/users/me` y mostrar que la respuesta no incluye hash ni contraseña.
4. Crear una cuenta RECEPTION mediante `POST /api/v1/users`. Intentar repetir el correo para mostrar el error 409; intentar crear DENTIST sin `dentist_id` para mostrar el error 422.
5. Cargar una imagen de prueba mediante `PUT /api/v1/users/me/profile-pic`, campo `file`. Recuperarla con `GET /api/v1/users/me/profile-pic`. Mostrar que la aplicación entrega JPEG y que una petición anónima no tiene acceso.
6. Cerrar sesión con `POST /api/v1/users/logout`. Volver a consultar `/users/me` con el mismo token y comprobar 401.
7. Entrar como recepción y comprobar 403 al listar o crear cuentas. Consultar `/agent/capabilities`: solo muestra su rol y capacidades previstas; la inferencia permanece desactivada.
8. Explicar el modelo User, las tres tablas auxiliares y la separación entre archivos e información relacional. Mostrar el documento `docs/ENTREGABLE-01.md`, la política del agente y la rama `v01`.
9. Presentar `evidence/pytest.xml`, `integration.json` y el estado de auditoría. Distinguir las pruebas con almacenamiento simulado del flujo comprobado con PostgreSQL y MinIO reales.

La consola MinIO puede usarse para inspeccionar el bucket privado, pero no se deben publicar las credenciales ni grabar el archivo de configuración. Las imágenes de la demostración deben ser sintéticas y no contener pacientes.

## Demostración desde el ESP

La habilidad `dentalrisk` ya puede guiar la conexión, el alta y la foto. En el chat del ESP se solicita primero “Conéctate a DentalRisk”, después el alta con sus datos y finalmente se adjunta la imagen indicando el usuario. El agente usa JSON y la ruta real del adjunto; no necesita multipart ni una credencial MinIO.

El ensayo físico se conserva en la conversación “Validación DentalRisk ESP”. Las herramientas reales y sus respuestas sanitizadas están en `evidence/esp-tools.json`: conexión 200, creación 201, asignación de imagen 200 y consulta del usuario 200. El resultado comprobado en PostgreSQL y MinIO se encuentra en `esp-hardware.json`. La imagen utilizada fue un cuadro sintético de color, no la foto de una persona.

En UserResponse, mostrar `profile_pic` antes y después de la carga. Antes vale null; después contiene la URL autenticada, `content_type=image/jpeg` y `requires_auth=true`. En la instalación compartida, la referencia persistida está en `users.profile_object_key`; los bytes viven en MinIO.
