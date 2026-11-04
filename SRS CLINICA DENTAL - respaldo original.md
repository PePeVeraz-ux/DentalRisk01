# **Especificación de Requisitos de Software (SRS)**

## **1\. Introducción**

### **1.1 Propósito**

El propósito de este documento es definir las especificaciones de software, hardware e inteligencia artificial para el **Sistema Automatizado de Control Operativo y Medición de Productividad**. Este documento está dirigido al equipo de desarrollo (Frontend, Backend, IoT, IA) y a los *stakeholders* de la clínica dental.

### **1.2 Alcance del Proyecto**

El sistema es una plataforma híbrida (Web \+ IoT \+ IA) diseñada para rastrear el flujo de pacientes desde la recepción hasta la salida del consultorio mediante el uso de tarjetas RFID temporales. El sistema elimina la captura manual de tiempos y proporciona al administrador métricas financieras y operativas exactas. Además, integra un Agente de IA ejecutado a través de microcontroladores ESP32-S3, el cual permite la operación "manos libres" en el consultorio y la gestión adaptativa de la agenda ante retrasos o imprevistos.

### **1.3 Tecnologías Empleadas**

* **Frontend / Dashboard:** Next.js / React  
    
* **Backend / API RESTful:** FastAPI / Node.js  
    
* **Base de Datos:** PostgreSQL / MySQL  
    
* **Hardware IoT:** Microcontroladores ESP32-S3, Lectores RFID (ej. ACR122U), Tarjetas/Llaveros de PVC.

## **2\. Descripción General**

### **2.1 Perspectiva del Producto**

El sistema funciona bajo una arquitectura cliente-servidor distribuida:

1. **Módulo de Recepción (Web):** Interfaz para la vinculación y desvinculación de tarjetas RFID a pacientes y servicios.  
     
2. **Módulo de Consultorio (IoT/Edge):** Estaciones basadas en ESP32-S3 que leen las tarjetas para el *check-in* y *check-out* automático, e interactúan con el Agente de IA para recibir comandos del personal médico.  
     
3. **Módulo Administrativo (Web):** Dashboard analítico para visualización de KPIs, ingresos y reportes de productividad.

### **2.2 Características de los Usuarios**

* **Recepcionista:** Encargado de la gestión de citas, asignación inicial de tarjetas y recuperación (desvinculación) al final del servicio. No requiere conocimientos técnicos avanzados.  
    
* **Dentista / Personal Médico:** Interactúa con el sistema de forma pasiva (el paciente escanea la tarjeta) o mediante comandos de voz/interfaz simplificada al Agente de IA. Requiere mínima interacción manual por protocolos de higiene.  
    
* **Administrador:** Accede a la plataforma web para analizar la productividad, generar reportes y monitorear ingresos en tiempo real.


### **2.3 Suposiciones y Dependencias**

* Las estaciones de trabajo y consultorios cuentan con conectividad LAN o Wi-Fi estable para la comunicación del ESP32-S3 con la API.  
    
* Se dispone de un catálogo de al menos 15 servicios dentales estandarizados proporcionados por la administración.  
    
* El rango de lectura de los módulos RFID (13.56 MHz) está limitado físicamente a una distancia de 3 a 5 centímetros.


## **3\. Requisitos Específicos**

### **3.1 Requisitos Funcionales (RF)**

**Módulo de Recepción y Flujo RFID:**

* **RF01 (Vinculación):** El sistema debe permitir al recepcionista seleccionar un paciente, un servicio (de un catálogo de 15+ opciones) y el dentista asignado, vinculando estos datos a un ID único de tarjeta RFID.  
    
* **RF02 (Desvinculación):** El sistema debe permitir el cierre del ciclo de atención de forma manual en recepción, desvinculando al paciente y regresando el estado de la tarjeta a "Disponible".  
    
* **RF03 (Excepciones):** El sistema debe incluir una función de cierre o cancelación manual en caso de que el paciente extravíe o dañe la tarjeta física durante su estancia.


**Módulo de Cronometraje e IoT (ESP32-S3):**

* **RF04 (Check-in Automático):** Al detectar una tarjeta vinculada en el lector del consultorio, el sistema debe registrar el *timestamp* de inicio con un margen de error de 0 minutos.  
    
* **RF05 (Check-out Automático):** Al detectar la misma tarjeta por segunda vez, el sistema debe registrar el *timestamp* de fin, calcular la duración total e identificar el servicio como "Completado".


**Módulo del Agente de IA:**

* **RF06 (Comandos Médicos):** El Agente de IA alojado a través del ESP32-S3 y FastAPI debe procesar solicitudes del dentista (ej. extender tiempo de cita, cambiar tipo de servicio) sin necesidad de teclado.  
    
* **RF07 (Gestión Adaptativa):** El sistema debe identificar proactivamente retrasos en el cronómetro de un consultorio y sugerir modificaciones en la agenda o emitir alertas a recepción.  
    
* **RF08 (Administración Autónoma):** El Agente de IA debe permitir la creación de nuevos usuarios o registros en la base de datos a través de instrucciones en lenguaje natural dirigidas a la API.


**Módulo de Reportes y Panel de Control:**

* **RF09 (Reporte Semanal):** El sistema debe generar automáticamente un reporte cada semana clasificando a los dentistas en función de la cantidad de pacientes atendidos y el tiempo promedio por servicio.  
    
* **RF10 (Métricas Financieras):** El panel de control debe sumar de forma automática el costo de los servicios completados para mostrar los ingresos diarios generados por cada especialista en tiempo real.


### **3.2 Requisitos No Funcionales (RNF)**

* **RNF01 (Presupuesto de Hardware):** La adquisición de lectores RFID, módulos ESP32-S3 y el lote inicial de 50 tarjetas de PVC no debe exceder el tope de \$4,000.00 MXN.  
    
* **RNF02 (Tiempos de Respuesta):** La validación de la tarjeta RFID y la respuesta de la API de FastAPI debe ejecutarse en menos de 2 segundos para evitar cuellos de botella en el consultorio.  
    
* **RNF03 (Interfaz de Usuario):** El Frontend desarrollado en Next.js debe ser responsivo, optimizado para su visualización tanto en computadoras de escritorio (recepción) como en dispositivos móviles (dashboard del administrador).  
    
* **RNF04 (Tiempo de Desarrollo):** La arquitectura, desarrollo, pruebas de conexión del hardware e implementación total deben estar finalizados a más tardar en marzo de 2027\.  
    
* **RNF05 (Persistencia y Seguridad):** El sistema debe realizar validaciones de integridad en la base de datos para evitar la duplicidad de vinculaciones de una misma tarjeta RFID en citas concurrentes.

			  