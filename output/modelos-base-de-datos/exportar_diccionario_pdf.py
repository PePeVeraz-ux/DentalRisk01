"""Exporta el diccionario Markdown a un PDF apaisado para entrega."""
from pathlib import Path
from xml.sax.saxutils import escape
from reportlab.platypus import SimpleDocTemplate, Paragraph, Table, TableStyle, Spacer, KeepTogether
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors

ROOT=Path(__file__).resolve().parents[2]
SOURCE=ROOT/'output/modelos-base-de-datos/Diccionario-de-datos.md'
OUT=ROOT/'output/pdf/Diccionario-de-datos-DentalRisk-y-Agente-IA.pdf'
OUT.parent.mkdir(parents=True,exist_ok=True)
styles=getSampleStyleSheet()
styles.add(ParagraphStyle(name='MainDR',fontName='Helvetica-Bold',fontSize=20,leading=23,textColor=colors.HexColor('#123650'),spaceAfter=15))
styles.add(ParagraphStyle(name='DBDR',fontName='Helvetica-Bold',fontSize=15,leading=19,textColor=colors.HexColor('#126886'),spaceBefore=16,spaceAfter=9))
styles.add(ParagraphStyle(name='TableDR',fontName='Helvetica-Bold',fontSize=11,leading=14,textColor=colors.HexColor('#123650'),spaceBefore=9,spaceAfter=4))
styles.add(ParagraphStyle(name='BodyDR',fontName='Helvetica',fontSize=8.5,leading=12,spaceAfter=6))
styles.add(ParagraphStyle(name='CellDR',fontName='Helvetica',fontSize=7.4,leading=9.5))
styles.add(ParagraphStyle(name='HeadDR',fontName='Helvetica-Bold',fontSize=7.5,leading=9,textColor=colors.HexColor('#123650')))
styles.add(ParagraphStyle(name='ConstraintDR',fontName='Helvetica',fontSize=7.2,leading=9,spaceAfter=2,leftIndent=9))
story=[]; lines=SOURCE.read_text(encoding='utf-8').splitlines(); i=0
while i<len(lines):
    line=lines[i].strip()
    if not line: i+=1;continue
    if line.startswith('# '): story.append(Paragraph(escape(line[2:]),styles['MainDR']));i+=1;continue
    if line.startswith('## '): story.append(Paragraph(escape(line[3:].replace('`','')),styles['DBDR']));i+=1;continue
    if line.startswith('### '):
        story.append(Paragraph(escape(line[4:].replace('`','')),styles['TableDR']));i+=1;continue
    if line.startswith('| Campo |'):
        rows=[]
        while i<len(lines) and lines[i].startswith('|'):
            if not lines[i].startswith('|---'):
                values=[x.strip().replace('`','') for x in lines[i].strip('|').split('|')]
                rows.append([Paragraph(escape(v),styles['HeadDR'] if not rows else styles['CellDR']) for v in values])
            i+=1
        t=Table(rows,colWidths=[96,116,43,45,105,360],hAlign='LEFT',repeatRows=1)
        t.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),colors.HexColor('#DCEEF4')),
                               ('VALIGN',(0,0),(-1,-1),'TOP'),('GRID',(0,0),(-1,-1),.35,colors.HexColor('#D7E1E7')),
                               ('ROWBACKGROUNDS',(0,1),(-1,-1),[colors.white,colors.HexColor('#F8FBFD')]),
                               ('LEFTPADDING',(0,0),(-1,-1),5),('RIGHTPADDING',(0,0),(-1,-1),5),
                               ('TOPPADDING',(0,0),(-1,-1),4),('BOTTOMPADDING',(0,0),(-1,-1),4)]))
        story.append(t);story.append(Spacer(1,5));continue
    if line.startswith('- '): story.append(Paragraph('• '+escape(line[2:].replace('`','')),styles['ConstraintDR']));i+=1;continue
    clean=line.replace('**','').replace('`','')
    story.append(Paragraph(escape(clean),styles['BodyDR']));i+=1

def footer(c,d):
    c.setStrokeColor(colors.HexColor('#CCDCE5'));c.line(35,33,807,33)
    c.setFont('Helvetica',8);c.setFillColor(colors.HexColor('#5E7585'))
    c.drawString(35,20,'DentalRisk y Agente IA · diccionario del esquema PostgreSQL verificado el 03/11/2026')
    c.drawRightString(807,20,str(d.page))
SimpleDocTemplate(str(OUT),pagesize=landscape(A4),leftMargin=35,rightMargin=35,topMargin=34,bottomMargin=43).build(story,onFirstPage=footer,onLaterPages=footer)
print(OUT)
