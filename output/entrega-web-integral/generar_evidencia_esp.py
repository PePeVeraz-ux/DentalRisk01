"""Generate a presentation card from the sanitized ESP verification records."""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parent
DEST = ROOT / "evidencia-demo-esp.png"
W, H = 1500, 1080

BG = "#F4F8FD"
NAVY = "#173454"
BLUE = "#155DAA"
MUTED = "#52677E"
LINE = "#D9E5F1"
GREEN_BG = "#EAF8EF"
GREEN = "#147D44"
WHITE = "#FFFFFF"


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    windows_font = Path("C:/Windows/Fonts/segoeuib.ttf" if bold else "C:/Windows/Fonts/segoeui.ttf")
    if windows_font.exists():
        return ImageFont.truetype(str(windows_font), size)
    return ImageFont.truetype("DejaVuSans-Bold.ttf" if bold else "DejaVuSans.ttf", size)


image = Image.new("RGB", (W, H), BG)
draw = ImageDraw.Draw(image)

# Header
draw.rounded_rectangle((70, 62, 1430, 1022), radius=34, fill=WHITE, outline=LINE, width=2)
draw.rounded_rectangle((110, 103, 325, 147), radius=20, fill="#E8F1FC")
draw.text((135, 109), "DENTALRISK", font=font(24, True), fill=BLUE)
draw.text((110, 169), "Demo del agente en el ESP", font=font(55, True), fill=NAVY)
draw.text((110, 245), "Solicitud en lenguaje natural → API → resultado comprobado", font=font(29), fill=MUTED)
draw.line((110, 311, 1390, 311), fill=LINE, width=2)

steps = [
    ("01", "Conectar con DentalRisk", "GET /api/v1/agent/connection", "200", "Conexión confirmada"),
    ("02", "Crear cuenta de prueba", "POST /api/v1/agent/users", "201", "Cuenta RECEPTION creada"),
    ("03", "Asignar imagen sintética", "POST /api/v1/agent/users/{id}/profile-pic", "200", "Foto asociada y guardada en MinIO"),
    ("04", "Consultar el resultado", "GET /api/v1/agent/users/{id}", "200", "profile_pic: JPEG con acceso autenticado"),
]

start_y, gap, card_h = 342, 144, 122
for index, (number, title, route, status, result) in enumerate(steps):
    y = start_y + index * gap
    draw.rounded_rectangle((110, y, 1390, y + card_h), radius=22, fill="#F8FBFF", outline=LINE, width=2)
    draw.ellipse((133, y + 30, 198, y + 95), fill=BLUE)
    draw.text((147, y + 39), number, font=font(29, True), fill=WHITE)
    draw.text((222, y + 17), title, font=font(31, True), fill=NAVY)
    draw.text((222, y + 65), route, font=font(22), fill=MUTED)
    draw.rounded_rectangle((1150, y + 20, 1355, y + 58), radius=18, fill=GREEN_BG)
    draw.text((1170, y + 23), f"HTTP {status}", font=font(22, True), fill=GREEN)
    result_w = draw.textbbox((0, 0), result, font=font(21))[2]
    draw.text((1355 - result_w, y + 78), result, font=font(21), fill=MUTED)

draw.line((110, 934, 1390, 934), fill=LINE, width=2)
draw.text((110, 951), "Reconstrucción a partir del registro verificado; no captura en vivo", font=font(23, True), fill=NAVY)
draw.text((110, 983), "Ensayo registrado: 26 oct 2026 · Datos sintéticos · Sin credenciales ni identificadores", font=font(21), fill=MUTED)

image.save(DEST, optimize=True)
print(DEST)
