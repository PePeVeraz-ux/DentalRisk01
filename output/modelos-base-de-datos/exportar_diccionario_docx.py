"""Exporta el diccionario a Word editable conservando todas las tablas."""
from pathlib import Path
from docx import Document
from docx.shared import Cm, Pt, RGBColor
from docx.enum.section import WD_ORIENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_CELL_VERTICAL_ALIGNMENT
from docx.oxml import OxmlElement
from docx.oxml.ns import qn

ROOT=Path(__file__).resolve().parents[2]
SOURCE=ROOT/'output/modelos-base-de-datos/Diccionario-de-datos.md'
OUT=ROOT/'output/modelos-base-de-datos/Diccionario-de-datos-DentalRisk-y-Agente-IA.docx'
doc=Document(); sec=doc.sections[0]
sec.orientation=WD_ORIENT.LANDSCAPE; sec.page_width=Cm(29.7);sec.page_height=Cm(21)
sec.left_margin=Cm(1.6);sec.right_margin=Cm(1.6);sec.top_margin=Cm(1.5);sec.bottom_margin=Cm(1.5)

styles=doc.styles
styles['Normal'].font.name='Aptos';styles['Normal'].font.size=Pt(9)
styles['Normal'].paragraph_format.space_after=Pt(5)
for name,size,before,after in [('Title',21,0,12),('Heading 1',15,14,8),('Heading 2',11.5,10,5)]:
    s=styles[name];s.font.name='Aptos Display';s.font.size=Pt(size);s.font.color.rgb=RGBColor(0,0,0)
    s.paragraph_format.space_before=Pt(before);s.paragraph_format.space_after=Pt(after)
    s.paragraph_format.keep_with_next=True

def shade(cell,fill):
    tcPr=cell._tc.get_or_add_tcPr(); shd=OxmlElement('w:shd');shd.set(qn('w:fill'),fill);tcPr.append(shd)
def borders(cell):
    tcPr=cell._tc.get_or_add_tcPr();bd=OxmlElement('w:tcBorders')
    for side in ('top','left','bottom','right'):
        e=OxmlElement('w:'+side);e.set(qn('w:val'),'single');e.set(qn('w:sz'),'4');e.set(qn('w:color'),'D9D9D9');bd.append(e)
    tcPr.append(bd)
def repeat_header(row):
    trPr=row._tr.get_or_add_trPr();el=OxmlElement('w:tblHeader');el.set(qn('w:val'),'true');trPr.append(el)
def no_split(row):
    trPr=row._tr.get_or_add_trPr();el=OxmlElement('w:cantSplit');trPr.append(el)

lines=SOURCE.read_text(encoding='utf-8').splitlines();i=0
while i<len(lines):
    line=lines[i].strip();i+=1
    if not line:continue
    if line.startswith('# '):doc.add_paragraph(line[2:],'Title');continue
    if line.startswith('## '):doc.add_paragraph(line[3:].replace('`',''),'Heading 1');continue
    if line.startswith('### '):doc.add_paragraph(line[4:].replace('`',''),'Heading 2');continue
    if line.startswith('| Campo |'):
        rows=[line]
        while i<len(lines) and lines[i].startswith('|'):
            if not lines[i].startswith('|---'):rows.append(lines[i])
            i+=1
        widths=[3.0,4.0,1.25,1.25,3.0,14.0]
        t=doc.add_table(rows=len(rows),cols=6);t.alignment=WD_TABLE_ALIGNMENT.CENTER;t.autofit=False
        for r,raw in enumerate(rows):
            cells=[x.strip().replace('`','') for x in raw.strip('|').split('|')]
            no_split(t.rows[r])
            for c,val in enumerate(cells):
                cell=t.cell(r,c);cell.width=Cm(widths[c]);cell.vertical_alignment=WD_CELL_VERTICAL_ALIGNMENT.CENTER
                cell.text=val;borders(cell)
                if r==0:shade(cell,'DCEEF4')
                elif r%2==0:shade(cell,'F8FBFD')
                for p in cell.paragraphs:
                    p.paragraph_format.space_after=Pt(0)
                    for run in p.runs:
                        run.font.name='Aptos';run.font.size=Pt(7.4);run.bold=(r==0)
        repeat_header(t.rows[0]);doc.add_paragraph().paragraph_format.space_after=Pt(1)
        continue
    if line.startswith('- '):
        p=doc.add_paragraph(style='Normal');p.paragraph_format.left_indent=Cm(.4)
        p.add_run('• '+line[2:].replace('`','')).font.size=Pt(8)
        continue
    p=doc.add_paragraph(line.replace('**','').replace('`',''))
    if line.startswith('Restricciones e índices'):p.paragraph_format.keep_with_next=True

footer=sec.footer.paragraphs[0];footer.alignment=WD_ALIGN_PARAGRAPH.RIGHT
footer.add_run('DentalRisk y Agente IA · Esquema PostgreSQL verificado el 03/11/2026').font.size=Pt(8)
doc.save(OUT)
print(OUT)
