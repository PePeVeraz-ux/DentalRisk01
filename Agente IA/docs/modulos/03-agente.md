# Asistente operativo

El agente que ya reside en el ESP puede conectarse a la API, consultar actividad operativa autorizada, crear cuentas no administrativas y asignarles imágenes adjuntas. Este flujo utiliza la habilidad `esp/SKILL.md`, la herramienta HTTP del firmware y una delegación limitada. Su documentación operativa está en [Integración ESP](04-esp.md). No necesita el modelo propuesto a continuación ni un LLM dentro de FastAPI.

El dueño necesita comprender productividad por clínica, dentista y periodo. Recepción necesita consultar procedimientos de operación e incidencias. Cada dentista debe limitarse a sus métricas. Soporte solo necesita información técnica. Estas capacidades se declaran en `agent/policy.py`, separadas de las reglas de autenticación.

La variante propuesta es Qwen2.5 7B Instruct ejecutada localmente mediante Ollama. Se evaluará su redacción en español y su capacidad de explicar resultados estructurados. No calculará indicadores a partir de expedientes ni recibirá información personal de pacientes. La ejecución local reduce la necesidad de transferir información a un servicio externo, pero no sustituye la autorización ni demuestra por sí sola la privacidad.

Flujo implementado de consulta: usuario autenticado o ESP delegado → autorización en FastAPI → registros, conteos y rendimiento de la base clínica compartida → respuesta estructurada sin identidad de paciente. El ESP puede consultar `/api/v1/agent/clinical/performance` para atenciones completadas, pacientes distintos y valor de servicios por dentista, con límites `start_at` y `end_at` ISO 8601. El monto es valor de servicios, no cobros ni utilidad. El dentista se filtra por `dentist_id`; soporte recibe 403. El agente del ESP puede explicar estos datos. La inferencia propia del servidor sigue siendo futura.

La API no implementa chat propio, herramientas MCP, recuperación de documentos ni memoria de conversaciones. El chat y la inferencia pertenecen al ESP. El servidor no instala Ollama ni descarga pesos. El contrato `/agent/capabilities` informa que el conector clínico sí está habilitado en la instalación compartida y que la inferencia del servidor no lo está.

La siguiente entrega deberá validar el emparejamiento físico renovado del ESP, cálculos analíticos conciliados, pruebas de inyección de instrucciones y comportamiento cuando el modelo o la API no estén disponibles. También se medirá memoria y latencia en el servidor seleccionado. Una mejora de productividad requiere medición en operación, no se infiere por disponer del agente.
