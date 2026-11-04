"""Build the versioned operational manuals from their reviewed Markdown sources."""
from pathlib import Path
from xml.sax.saxutils import escape
import re
from reportlab.pdfgen import canvas
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, ListFlowable, ListItem
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.colors import HexColor
from reportlab.lib.enums import TA_LEFT
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'output' / 'pdf'
OUT.mkdir(parents=True, exist_ok=True)
font_dir = Path('C:/Windows/Fonts')
if font_dir.exists():
    pdfmetrics.registerFont(TTFont('Manual', str(font_dir / 'arial.ttf')))
    pdfmetrics.registerFont(TTFont('ManualBold', str(font_dir / 'arialbd.ttf')))
    pdfmetrics.registerFontFamily('Manual', normal='Manual', bold='ManualBold', italic='Manual', boldItalic='ManualBold')
    regular, bold = 'Manual', 'ManualBold'
else:
    regular, bold = 'Helvetica', 'Helvetica-Bold'

styles = {
    'title': ParagraphStyle('title', fontName=bold, fontSize=25, leading=30, textColor=HexColor('#193b39'), spaceAfter=18, keepWithNext=True),
    'heading': ParagraphStyle('heading', fontName=bold, fontSize=13, leading=18, textColor=HexColor('#007f73'), spaceBefore=17, spaceAfter=8, keepWithNext=True),
    'body': ParagraphStyle('body', fontName=regular, fontSize=9.5, leading=14, textColor=HexColor('#29453f'), spaceAfter=8, splitLongWords=True, allowWidows=0, allowOrphans=0),
    'meta': ParagraphStyle('meta', fontName=regular, fontSize=9, leading=13, textColor=HexColor('#718582'), spaceAfter=20),
}

def inline(text):
    text = text.replace('\u2013', '-').replace('\u2014', '-').replace('\u2011', '-').replace('→', '/')
    text = escape(text)
    text = re.sub(r'\*\*(.*?)\*\*', r'<b>\1</b>', text)
    text = re.sub(r'`(.*?)`', r'<font name="Courier" size="8.5">\1</font>', text)
    return text

def footer(c, doc):
    c.setStrokeColor(HexColor('#dce6df'))
    c.line(44, 49, 551, 49)
    c.setFillColor(HexColor('#718582'))
    c.setFont(regular, 8)
    c.drawString(44, 34, 'DentalRisk | Documentación operativa | Versión 1.0.0')
    c.drawRightString(551, 34, str(doc.page))

for filename in ['manual-usuario', 'manual-tecnico', 'guia-incidencias']:
    source = ROOT / 'docs' / 'operacion' / (filename + '.md')
    body_style = ParagraphStyle('body-' + filename, parent=styles['body'],
                               fontSize=9.2 if filename == 'manual-tecnico' else 9.5,
                               leading=13 if filename == 'manual-tecnico' else 14,
                               spaceAfter=7 if filename == 'manual-tecnico' else 8)
    story = []
    paragraph = []
    def flush():
        if paragraph:
            story.append(Paragraph(inline(' '.join(paragraph)), body_style))
            paragraph.clear()
    for line in source.read_text(encoding='utf-8').splitlines():
        if line.startswith('# '):
            flush()
            story.append(Paragraph(inline(line[2:]), styles['title']))
            story.append(Paragraph('Sistema de control operativo y productividad dental<br/>22 de octubre de 2026', styles['meta']))
        elif line.startswith('## '):
            flush()
            story.append(Paragraph(inline(line[3:]), styles['heading']))
        elif not line.strip():
            flush()
        elif re.match(r'^\d+\. ', line):
            flush()
            story.append(Paragraph(inline(line), body_style))
        else:
            paragraph.append(line.strip())
    flush()
    path = OUT / (filename + '.pdf')
    doc = SimpleDocTemplate(str(path), pagesize=(595.28, 841.89), rightMargin=44, leftMargin=44, topMargin=44, bottomMargin=66,
                            title='DentalRisk - ' + filename.replace('-', ' '), author='DentalRisk')
    doc.build(story, onFirstPage=footer, onLaterPages=footer)
    print(path.name)
