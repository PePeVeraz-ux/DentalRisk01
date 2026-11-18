"""Genera la arquitectura de DentalRisk como SVG y PDF vectoriales."""
from pathlib import Path
from xml.sax.saxutils import escape
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor
import math

ROOT = Path(__file__).resolve().parent
W, H = 2000, 1280
svg = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">',
       '<defs><marker id="arrBlue" markerWidth="12" markerHeight="12" refX="10" refY="6" orient="auto"><path d="M0 0 L12 6 L0 12 Z" fill="#2F6F95"/></marker><marker id="arrAmber" markerWidth="12" markerHeight="12" refX="10" refY="6" orient="auto"><path d="M0 0 L12 6 L0 12 Z" fill="#BB7C12"/></marker></defs>']
pdf = canvas.Canvas(str(ROOT / 'arquitectura-dentalrisk.pdf'), pagesize=(W, H))
pdf.setTitle('Arquitectura multicapa de DentalRisk - avance y propuesta')

def box(x,y,w,h,fill,stroke='#D5E1E8',r=16,sw=2):
    svg.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{r}" fill="{fill}" stroke="{stroke}" stroke-width="{sw}"/>')
    pdf.setFillColor(HexColor(fill));pdf.setStrokeColor(HexColor(stroke));pdf.setLineWidth(sw)
    pdf.roundRect(x,H-y-h,w,h,r,fill=1,stroke=1)
def text(x,y,s,size=20,color='#15334B',bold=False):
    svg.append(f'<text x="{x}" y="{y}" fill="{color}" font-family="Arial, sans-serif" font-size="{size}" font-weight="{700 if bold else 400}">{escape(s)}</text>')
    pdf.setFillColor(HexColor(color));pdf.setFont('Helvetica-Bold' if bold else 'Helvetica',size);pdf.drawString(x,H-y,s)
def arrow(x1,y1,x2,y2,planned=False):
    col='#BB7C12' if planned else '#2F6F95'; marker='arrAmber' if planned else 'arrBlue'
    dash='stroke-dasharray="8 8"' if planned else ''
    svg.append(f'<path d="M{x1} {y1} L{x2} {y2}" fill="none" stroke="{col}" stroke-width="3" {dash} marker-end="url(#{marker})"/>')
    pdf.setStrokeColor(HexColor(col));pdf.setFillColor(HexColor(col));pdf.setLineWidth(3)
    pdf.setDash(8,8) if planned else pdf.setDash()
    pdf.line(x1,H-y1,x2,H-y2);pdf.setDash()
    a=math.atan2(y1-y2,x2-x1);p=pdf.beginPath();p.moveTo(x2,H-y2)
    p.lineTo(x2-12*math.cos(a-.5),H-y2-12*math.sin(a-.5))
    p.lineTo(x2-12*math.cos(a+.5),H-y2-12*math.sin(a+.5));p.close();pdf.drawPath(p,stroke=0,fill=1)
def card(x,y,w,h,title,detail,status='actual'):
    future=status=='propuesto'; demo=status=='demo'
    fill='#FFF8E9' if future else '#F0F5FA' if demo else '#FFFFFF'
    accent='#B97708' if future else '#607C98' if demo else '#167C9A'
    box(x,y,w,h,fill,accent,14,2)
    box(x,y,8,h,accent,accent,4,0)
    text(x+24,y+38,title,20,'#15334B',True)
    for j,line in enumerate(detail): text(x+24,y+68+j*24,line,15,'#4C6476')
    tag='PROPUESTO' if future else 'DEMO' if demo else 'IMPLEMENTADO'
    tx=x+w-16-len(tag)*8.2
    text(tx,y+h-15,tag,12,accent,True)
def layer(y,h,number,name,note):
    box(35,y,1930,h,'#F6F9FB','#D9E4EB',18,2)
    box(55,y+23,205,h-46,'#E4EFF5','#D6E8F0',14,0)
    text(75,y+60,number,22,'#126886',True)
    text(75,y+94,name,20,'#126886',True)
    text(75,y+122,note,14,'#547084')

box(0,0,W,H,'#FFFFFF','#FFFFFF',0,0)
text(55,65,'ARQUITECTURA MULTICAPA · DENTALRISK',33,'#123650',True)
text(55,101,'Avance del proyecto | Implementado, demostración y ampliaciones propuestas',18,'#4C6476')
box(1420,43,250,44,'#E7F3F7','#167C9A',12);text(1440,72,'IMPLEMENTADO',17,'#126886',True)
box(1690,43,250,44,'#FFF8E9','#B97708',12);text(1715,72,'PROPUESTO',17,'#9B690E',True)

layer(135,190,'01','Edge / IoT','Dispositivos y agente')
layer(345,190,'02','Backend / API','Servicios REST')
layer(555,190,'03','Datos','OLTP y OLAP')
layer(765,190,'04','Analítica / ML','ECBD y modelos')
layer(975,190,'05','Frontend','Consulta y acciones')

card(290,175,380,112,'Estación RFID',['Adaptador; evento UID y estación','Credencial propia'])
card(700,175,390,112,'Agente del ESP32',['Habilidad en espclaw; petición local','Altas y fotos mediante HTTP'])
card(1120,175,390,112,'Telemetría y comandos',['Sensores, envío de métricas','Acciones físicas del dispositivo'],'propuesto')

card(290,385,380,112,'API principal · Fastify',['REST /api/v1/rfid/events','Sesiones web y token de estación'])
card(700,385,390,112,'API Agente IA · FastAPI',['REST /api/v1/agent/...','JWT de usuario; llave API del ESP'])
card(1120,385,390,112,'API analítica y comandos',['/api/analitica/...; rutas IoT','Inferencia y control del ESP'],'propuesto')

card(290,595,380,112,'PostgreSQL · dentalrisk',['OLTP: usuarios, atenciones, eventos','Agenda, auditoría e indicadores'])
card(700,595,390,112,'PostgreSQL · agente',['OLTP separado: usuarios, sesiones','Operaciones y auditoría'])
card(1120,595,390,112,'MinIO privado',['Fotos de perfil asociadas','Acceso autenticado'])
card(1540,595,390,112,'OLAP / Data Warehouse',['Modelo analítico y datos preparados'],'propuesto')

card(290,805,380,112,'Analítica descriptiva',['Consultas y agregaciones actuales','KPIs, comparativos y reportes'])
card(700,805,390,112,'ETL de ECBD',['Extraer, depurar y cargar datos','Programación y trazabilidad'],'propuesto')
card(1120,805,390,112,'Modelos de ML',['Entrenamiento y evaluación','Inferencia supervisada / no supervisada'],'propuesto')
card(1540,805,390,112,'Resultados analíticos',['Predicciones por API','Métricas y versión del modelo'],'propuesto')

card(290,1015,380,112,'Web DentalRisk',['Next.js / React · roles clínicos','Gráficas, filtros y KPIs'])
card(700,1015,390,112,'Dashboard Denti',['Vista previa de actividad del agente','Datos sintéticos; sin integración'],'demo')
card(1120,1015,390,112,'Visualización predictiva',['Predicciones, mapas y distribución','Acciones desde la interfaz'],'propuesto')

arrow(480,287,480,385)
arrow(895,287,895,385)
arrow(1315,287,1315,385,True)
arrow(480,497,480,595)
arrow(895,497,895,595)
arrow(480,707,480,805)
arrow(1735,707,1735,805,True)
arrow(1090,861,1120,861,True)
arrow(1510,861,1540,861,True)
arrow(480,917,480,1015)

text(60,1210,'Flujo ECBD propuesto: PostgreSQL clinico > ETL > OLAP > modelos ML > API analitica > frontend.',17,'#4C6476')
text(60,1243,'DentalRisk usa sesiones web; el Agente IA usa JWT para usuarios y llave API para el ESP. Las bases no comparten claves foráneas.',15,'#4C6476')
svg.append('</svg>')
(ROOT/'arquitectura-dentalrisk.svg').write_text(''.join(svg),encoding='utf-8')
pdf.showPage();pdf.save()
print(ROOT/'arquitectura-dentalrisk.pdf')
print(ROOT/'arquitectura-dentalrisk.svg')
