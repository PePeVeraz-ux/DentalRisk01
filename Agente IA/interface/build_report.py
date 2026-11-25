"""Genera el entregable académico y sus páginas de revisión visual."""
from pathlib import Path
from xml.sax.saxutils import escape
import json
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor, Color, white
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import Paragraph, Table, TableStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from PIL import Image
import pypdfium2 as pdfium
from pypdf import PdfReader

HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[1]
OUT=ROOT/'output'/'pdf'
OUT.mkdir(parents=True,exist_ok=True)
PDF=OUT/'Interfaz del Agente - Denti DentalRisk.pdf'
RENDER=HERE/'output'/'pdf-review'
RENDER.mkdir(parents=True,exist_ok=True)
for name,file in [('Arial','arial.ttf'),('Arial-Bold','arialbd.ttf'),('Arial-Italic','ariali.ttf')]:
    pdfmetrics.registerFont(TTFont(name,str(Path('C:/Windows/Fonts')/file)))
W,H=A4
INK=HexColor('#173335'); TEAL=HexColor('#087f73'); MUTED=HexColor('#687b78')
LINE=HexColor('#dce6df'); BG=HexColor('#f5f7f2'); GOLD=HexColor('#b58d40')
c=canvas.Canvas(str(PDF),pagesize=A4)
c.setTitle('Interfaz del Agente | Denti - DentalRisk')
c.setAuthor('Proyecto DentalRisk')
c.setSubject('Prototipo configurable, reportes, datos y gráficas del agente')
style=ParagraphStyle('body',fontName='Arial',fontSize=10,leading=15,textColor=INK,spaceAfter=9)
small=ParagraphStyle('small',parent=style,fontSize=8.4,leading=12,textColor=MUTED)
head=ParagraphStyle('head',parent=style,fontName='Arial-Bold',fontSize=13,leading=18,textColor=TEAL)

def para(text,x,y,width=491,kind=style):
    p=Paragraph(text,kind);_,height=p.wrap(width,1000);p.drawOn(c,x,y-height)
    return y-height-10

def line(x,y,w=491):
    c.setStrokeColor(LINE);c.line(x,y,x+w,y)

def page(num,title,kicker='DESARROLLO'):
    c.setFillColor(TEAL);c.rect(0,H-8,W,8,fill=1,stroke=0)
    c.setFillColor(TEAL);c.setFont('Arial-Bold',8);c.drawString(52,H-48,'DENTI / DENTALRISK')
    c.setFillColor(MUTED);c.setFont('Arial',8);c.drawRightString(W-52,H-48,'INTERFAZ DEL AGENTE')
    c.setFillColor(GOLD);c.setFont('Arial-Bold',8);c.drawString(52,H-90,kicker)
    c.setFillColor(INK);c.setFont('Arial-Bold',24);c.drawString(52,H-124,title)
    line(52,49)
    c.setFont('Arial',7.5);c.setFillColor(MUTED);c.drawString(52,33,'Desarrollo Web Integral · 27 de octubre de 2026')
    c.drawRightString(W-52,33,f'{num:02d} / 07')
    return H-149

def section(title,text,y):
    y=para(title,52,y,kind=head)
    return para(text,52,y)

def image(file,x,top,maxw,maxh):
    with Image.open(file) as im: iw,ih=im.size
    scale=min(maxw/iw,maxh/ih);w,h=iw*scale,ih*scale
    c.drawImage(str(file),x,top-h,width=w,height=h,mask='auto')
    return top-h-12,w,h

def table(rows,y,widths):
    data=[[Paragraph(escape(str(t)),small if i else ParagraphStyle('th',parent=small,fontName='Arial-Bold',textColor=TEAL)) for t in row] for i,row in enumerate(rows)]
    t=Table(data,colWidths=widths,hAlign='LEFT')
    t.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),BG),('VALIGN',(0,0),(-1,-1),'TOP'),('LEFTPADDING',(0,0),(-1,-1),10),('RIGHTPADDING',(0,0),(-1,-1),10),('TOPPADDING',(0,0),(-1,-1),10),('BOTTOMPADDING',(0,0),(-1,-1),10),('LINEBELOW',(0,0),(-1,-1),.4,LINE)]))
    _,h=t.wrap(sum(widths),1000);t.drawOn(c,52,y-h);return y-h-18

# 1. Portada
c.setFillColor(BG);c.rect(0,0,W,H,fill=1,stroke=0)
c.setFillColor(TEAL);c.rect(0,H-11,W,11,fill=1,stroke=0)
c.setFillColor(TEAL);c.roundRect(52,H-108,45,45,14,fill=1,stroke=0)
c.setFont('Arial-Bold',35);c.setFillColor(white);c.drawString(62,H-98,'d')
c.setFillColor(INK);c.setFont('Arial-Bold',32);c.drawString(111,H-99,'denti.')
c.setFont('Arial-Bold',9);c.setFillColor(TEAL);c.drawString(52,H-168,'DESARROLLO WEB INTEGRAL')
c.setFillColor(INK);c.setFont('Arial-Bold',37);c.drawString(52,H-228,'Interfaz del agente')
c.setFont('Arial',21);c.drawString(52,H-265,'Datos, reportes y gráficas')
y=para('Prototipo configurable para supervisar la actividad de Denti y adaptar la misma interfaz a otros proyectos.',52,H-297,450,ParagraphStyle('cover',parent=style,fontSize=13,leading=20,textColor=MUTED))
# Tarjeta editorial dibujada en vectores.
c.setFillColor(white);c.setStrokeColor(LINE);c.roundRect(52,222,491,225,15,fill=1,stroke=1)
c.setFont('Arial-Bold',10);c.setFillColor(TEAL);c.drawString(74,421,'DEL AGENTE A UNA VISTA CLARA')
for i,(value,label) in enumerate([('24','Usuarios creados'),('18','Fotos almacenadas'),('96.1 %','Tasa de éxito')]):
    x=74+i*151;c.setFillColor(INK);c.setFont('Arial-Bold',26);c.drawString(x,375,value)
    c.setFillColor(MUTED);c.setFont('Arial',9);c.drawString(x,354,label)
c.setStrokeColor(LINE);c.line(74,330,518,330)
vals=[6,5,8,7,9,6,8];p=c.beginPath()
for i,v in enumerate(vals):
    x=76+i*72;y0=244+v*6
    p.moveTo(x,y0) if i==0 else p.lineTo(x,y0)
c.setStrokeColor(TEAL);c.setLineWidth(2.5);c.drawPath(p)
c.setFont('Arial',8);c.setFillColor(MUTED);c.drawString(74,237,'Datos de ejemplo · 21 al 27 de octubre de 2026')
c.setFillColor(INK);c.setFont('Arial-Bold',10);c.drawString(52,173,'Proyecto: DentalRisk | Agente: Denti')
c.setFillColor(MUTED);c.setFont('Arial',10);c.drawString(52,150,'Docente: Miguel Angel Cardona Contreras')
c.drawString(52,127,'27 de octubre de 2026')
line(52,78);c.setFont('Arial',8);c.drawString(52,57,'Entregable: portada, desarrollo, mockups y conclusión.')
c.drawRightString(W-52,57,'01 / 07');c.showPage()

# 2. Objetivo y diseño
y=page(2,'Propósito y diseño')
y=section('Objetivo', 'Se desarrolló una interfaz que permite consultar la actividad de un agente desde un solo lugar. Presenta indicadores, gráficas, una bitácora y un reporte descargable. El diseño se aplica a Denti y se reutiliza en otro dominio mediante un objeto de configuración.',y)
y=section('Aplicación en DentalRisk', 'Denti es el agente que recibe instrucciones para crear usuarios y asociar fotos de perfil mediante una API. La interfaz propuesta permite supervisar esas acciones. Su enfoque es la actividad del agente; los indicadores de productividad clínica requieren información y permisos adicionales.',y)
y=table([['Vista','Contenido y utilidad'],['Resumen','Tarjetas de indicadores, tendencia diaria, distribución de resultados y últimas operaciones. Permite reconocer el estado general del periodo.'],['Actividad','Bitácora con búsqueda por acción o referencia y filtro de resultado. Permite localizar operaciones específicas.'],['Reportes','Resumen del periodo y descarga CSV de los registros filtrados. Facilita revisar la información fuera de la interfaz.'],['Configuración','Selección de DentalRisk o Inventario y visualización del objeto activo. Demuestra la adaptación del diseño.']],y,[100,391])
y=section('Criterios visuales', 'Se eligió una paleta verde, fondos claros y tarjetas con información breve. La navegación mantiene las cuatro vistas visibles. Los resultados se distinguen mediante texto y color. Las gráficas incluyen descripciones accesibles y los controles muestran el foco al navegar con teclado.',y)
y=para('El prototipo funciona como archivo local y utiliza únicamente registros sintéticos. No necesita iniciar la API para presentar el boceto.',52,y,kind=small)
c.showPage()

# 3. Escritorio
y=page(3,'Mockup de escritorio','PROPUESTA VISUAL')
y=para('La pantalla principal organiza la información de mayor a menor nivel de detalle: periodo, indicadores, gráficas y operaciones recientes.',52,y)
y,_,_=image(HERE/'output/mockup-desktop.png',52,y,491,424)
y=para('Figura 1. Resumen de Denti. Captura del prototipo interactivo; todas las cifras son de ejemplo.',52,y,kind=small)
y=table([['Elemento','Regla de presentación'],['Indicadores','Usuarios y fotos cuentan solo acciones completadas. El total incluye fallidas.'],['Gráfica de línea','Muestra operaciones completadas por día, dentro del periodo seleccionado.'],['Gráfica circular','Separa completadas y fallidas. Éxito = completadas / total × 100.']],y,[110,381])
c.showPage()

# 4. Configuración
y=page(4,'Una interfaz reutilizable')
y=section('Separación entre datos y presentación', 'La identidad, los colores, las etiquetas, las acciones y la serie de ejemplo se declaran en <b>config.js</b>. El archivo <b>app.js</b> interpreta esos valores y actualiza los mismos componentes. Esto evita duplicar la pantalla completa cuando cambia el tema del proyecto.',y)
code='''const PROJECT_CONFIGS = {
  dental: {
    name: "DentalRisk",
    agentName: "Denti",
    accent: "#087f73",
    sourceMode: "demo",
    metrics: [
      { key: "create", label: "Usuarios creados" },
      { key: "photo", label: "Fotos almacenadas" },
      { key: "all", label: "Operaciones realizadas" },
      { key: "rate", label: "Tasa de éxito" }
    ],
    actions: { create: "Crear usuario", ... }
  },
  inventory: { /* otra identidad y otros datos */ }
};'''
c.setFillColor(BG);c.roundRect(52,y-242,491,242,9,fill=1,stroke=0)
c.setFont('Courier',9);c.setFillColor(INK)
for i,l in enumerate(code.splitlines()):c.drawString(67,y-21-i*12,l)
y-=260
y=para('Fragmento abreviado del objeto real. La propiedad counts aporta los datos del ejemplo; actions define las etiquetas de cada tipo de operación.',52,y,kind=small)
y=table([['Archivo','Responsabilidad'],['index.html','Estructura de las cuatro vistas y controles semánticos.'],['styles.css','Diseño, colores mediante variables CSS y adaptación móvil.'],['config.js','Dos configuraciones completas: DentalRisk e Inventario.'],['app.js','Navegación, filtros, cálculos, gráficas SVG y exportación CSV.']],y,[100,391])
y=para('En Configuración, al seleccionar Inventario cambian el nombre a Nexo, el color a morado y los indicadores a entradas y salidas. No es necesario reescribir la navegación ni las gráficas.',52,y)
c.showPage()

# 5. Flujo y seguridad
y=page(5,'Flujo y conexión prevista')
y=section('Recorrido de consulta', 'La persona abre el resumen y elige un periodo. Después revisa los indicadores, entra a Actividad, busca una operación y filtra su resultado. Puede descargar los registros visibles como CSV. Todos los cálculos del prototipo parten del mismo conjunto de operaciones.',y)
y=section('Reglas de los indicadores', 'En los siete días de ejemplo se muestran <b>51 operaciones</b>: 49 completadas y 2 fallidas. Las completadas corresponden a 24 altas, 18 fotos y 7 consultas de conexión. La tasa de éxito es <b>49 / 51 × 100 = 96.1 %</b>, redondeada a un decimal. Cada foto contabilizada representa una operación de almacenamiento completada en los datos simulados.',y)
y=section('Relación con el servicio existente', 'El flujo operativo de Denti utiliza ESP-Claw, FastAPI, PostgreSQL y MinIO. DeepSeek-V4-Pro interpreta las instrucciones desde un servicio externo y el agente utiliza herramientas para llamar a la API. El navegador presenta información de supervisión y no sustituye al agente.',y)
y=table([['Origen','Información aprovechable y trabajo pendiente'],['User','Cuenta y referencia a la foto. La imagen permanece en MinIO privado.'],['AgentOperation','Operaciones completadas y sus identificadores. Sirve como base para agregar resultados exitosos.'],['AuditEvent','Trazabilidad de acciones. Se debe definir qué eventos son visibles por rol.'],['Adaptador futuro','Obtener reportes agregados con autenticación, periodo y zona horaria explícitos. Registrar también fallos: el modelo actual no constituye una bitácora completa de intentos.']],y,[108,383])
y=section('Protección de la información', 'Una conexión real deberá aplicar permisos en el backend. El cliente no recibirá la clave del ESP ni credenciales de MinIO. Los reportes deben minimizar datos personales y la descarga de fotos debe conservar la autorización. El prototipo escapa texto en tablas y neutraliza prefijos de fórmulas en CSV.',y)
y=para('Alcance actual: boceto interactivo local. No consulta servicios ni declara estados de conexión en tiempo real. La instrumentación y el endpoint de estadísticas quedan como siguiente integración.',52,y,kind=small)
c.showPage()

# 6. Móvil
y=page(6,'Adaptación a dispositivos','PROPUESTA VISUAL')
image(HERE/'output/mockup-mobile.png',52,y,150,594)
x=226;ww=317
y=para('Una jerarquía consistente',x,y,ww,head)
y=para('En escritorio se utiliza una barra lateral y cuatro indicadores en una fila. En móvil, la navegación se coloca en la parte superior y las tarjetas se organizan en dos columnas.',x,y,ww)
y=para('Lectura de gráficas',x,y-8,ww,head)
y=para('La tendencia y la distribución pasan a una sola columna. El contenido conserva el orden de lectura y las gráficas se ajustan al ancho disponible.',x,y,ww)
y=para('Tablas y navegación',x,y-8,ww,head)
y=para('La bitácora permite desplazamiento horizontal dentro de su contenedor para conservar las columnas. La página completa no se desborda. Los filtros mantienen sus etiquetas y los resultados incluyen un texto de estado.',x,y,ww)
y=para('Estados contemplados',x,y-8,ww,head)
y=para('El prototipo incluye resultado completado, resultado fallido, búsqueda sin coincidencias y confirmación de descarga. Para una conexión real se añadirán estados de carga, sesión vencida y servicio no disponible.',x,y,ww)
y=para('Figura 2. Vista móvil del mismo prototipo a 390 px. Se conserva el contenido del resumen y su aviso de datos de ejemplo.',x,y-18,ww,small)
c.showPage()

# 7. Verificación y conclusión
y=page(7,'Verificación y conclusión','CIERRE')
y=para('La interfaz se abrió en Edge con automatización de navegador. Se comprobaron acciones de consulta y exportación con los datos locales del prototipo.',52,y)
y=table([['Comprobación','Resultado observado'],['Periodos','7 días: 51 operaciones, 96.1 % de éxito. 3 días: 24 operaciones, 95.8 %. Hoy: 8 operaciones, 100 %.'],['Bitácora','El filtro de fallidas devuelve 2 registros. Una búsqueda sin coincidencias muestra un estado vacío.'],['Reporte CSV','La exportación con el filtro de fallidas contiene un encabezado y los 2 registros correspondientes.'],['Reutilización','Cambiar a Inventario actualiza identidad y métricas con los mismos componentes.'],['Diseño y ejecución','Capturas a 1440 px y 390 px. Sin desbordamiento de página en móvil ni errores JavaScript durante el recorrido.']],y,[110,381])
y=para('Estas verificaciones corresponden al prototipo. No representan pruebas de comunicación con la API, el ESP o MinIO, ni una certificación completa de accesibilidad.',52,y,kind=small)
y=para('Conclusión',52,y-7,kind=head)
y=para('Con esta actividad pude representar de una forma más clara lo que hace Denti. La interfaz permite revisar las operaciones, consultar los resultados y descargar un reporte sin tener que buscar cada dato por separado.',52,y)
y=para('También entendí la importancia de separar la configuración del diseño. Al cambiar el nombre, los indicadores, las acciones y los datos, la misma interfaz puede utilizarse en otro proyecto. Esto facilita hacer cambios sin volver a construir toda la pantalla.',52,y)
y=para('El mockup me permitió organizar cómo se verá la información antes de conectarla a datos reales. El siguiente paso será incorporar los reportes de la API y registrar los resultados necesarios para que los indicadores reflejen lo que ocurre durante el uso del agente.',52,y)
y=para('Material incluido',52,y-7,kind=head)
y=para('PDF de la actividad, prototipo HTML/CSS/JavaScript, mockups de escritorio y móvil, ejemplo de reutilización y resultado de la verificación.',52,y,kind=small)
if y<65:raise RuntimeError(f'Page 7 overflow: {y}')
c.showPage();c.save()

reader=PdfReader(str(PDF))
assert len(reader.pages)==7
for i,p in enumerate(reader.pages):
    text=p.extract_text()
    assert len(text)>250, (i,len(text))
doc=pdfium.PdfDocument(str(PDF))
thumbs=[]
for i,p in enumerate(doc):
    im=p.render(scale=1.35).to_pil().convert('RGB')
    im.save(RENDER/f'page-{i+1}.png')
    im.thumbnail((298,422));thumbs.append(im.copy())
sheet=Image.new('RGB',(298*4,450*2),'#d8dfd9')
for i,im in enumerate(thumbs):sheet.paste(im,((i%4)*298,(i//4)*450))
sheet.save(RENDER/'contact-sheet.png')
print(json.dumps({'pdf':str(PDF),'pages':len(reader.pages),'rendered':str(RENDER)},ensure_ascii=False))
