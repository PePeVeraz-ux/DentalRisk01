# 05. Atención y RFID

**Cobertura:** RF04–RF05, RF14–RF15, RF25; RB01–RB06; P04–P06, P10.

**Datos:** rfid_events conserva ID único y respuesta; attentions contiene estados y marcas; assignments conserva asignaciones sucesivas.

**Contrato:** POST `/api/v1/rfid/events` con Bearer de estación y JSON `{event_id,uid,station_id}`. No admite fecha enviada por el lector. Devuelve accepted, code, message y referencia/hora cuando aplica. Repetir el mismo evento devuelve el mismo resultado; reutilizar su ID para otra lectura es conflicto.

**Estados:** Pendiente → En atención → Completada. Primer escaneo exige día operado y horario válido, sin descanso y sin dentista/estación ocupados. Segundo escaneo finaliza y calcula diferencia UTC; la salida no queda bloqueada por terminar el turno. Tercer escaneo no reinicia. Desconocidas, bloqueadas, estación incorrecta y relectura se rechazan sin alterar tiempos.

**Simulación:** ruta `/rfid/simulate` requiere sesión de recepción, o administración con acceso excepcional vigente, y está deshabilitada en producción. Es una herramienta de prueba; no acredita lectura física. `scripts/station.ts` implementa una entrada de UID por línea y reintento persistente, no un controlador USB específico.

**Pruebas:** 15 servicios, eventos repetidos, dos salidas simultáneas, estación ajena, relectura, caída antes/después de respuesta y reloj inválido. El informe de carga identifica motor, duración y ausencia de hardware.

**Validación física pendiente:** identificar modelo y controlador, probar 50 tarjetas y rango 3–5 cm, conectar el proveedor de UID real al contrato, comprobar estación y reconexión. Registrar marca de tiempo de lectura y confirmación visual para medir latencia completa.
