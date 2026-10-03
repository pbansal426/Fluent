# Builds clinica-familiar-es.pdf: the Spanish clinic registration form as a real fillable PDF (text boxes, drop-downs,
# radio buttons, a checkbox), for trying Fluent's PDF flow. Run with:
#   uv run --with reportlab python tools/make-clinic-pdf.py [output.pdf]
import sys

from reportlab.lib.colors import Color, white
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas

OUT = sys.argv[1] if len(sys.argv) > 1 else 'clinica-familiar-es.pdf'
W, H = letter
MARGIN = 50
CONTENT = W - 2 * MARGIN
BRAND = Color(0.12, 0.37, 0.55)
INK = Color(0.11, 0.15, 0.2)
MUTED = Color(0.36, 0.41, 0.47)
LINE = Color(0.62, 0.69, 0.76)
BOX = Color(0.89, 0.92, 0.99)

try:
    c = canvas.Canvas(OUT, pagesize=letter, lang='es-ES')
except TypeError:
    c = canvas.Canvas(OUT, pagesize=letter)
c.setTitle('Registro de nuevo paciente - Clínica Familiar Lakeside')
c.setAuthor('Clínica Familiar Lakeside')
form = c.acroForm

y = H


def header(first_page):
    global y
    if first_page:
        c.setFillColor(BRAND)
        c.rect(0, H - 62, W, 62, stroke=0, fill=1)
        c.setFillColor(white)
        c.setFont('Helvetica-Bold', 19)
        c.drawString(MARGIN, H - 30, 'Clínica Familiar Lakeside')
        c.setFont('Helvetica', 9)
        c.drawString(MARGIN, H - 46, 'Calle Harbor Oeste 1420, Champaign, IL 61820  ·  (217) 555-0142')
        c.setFillColor(INK)
        c.setFont('Helvetica-Bold', 17)
        c.drawString(MARGIN, H - 92, 'Registro de nuevo paciente')
        c.setFillColor(MUTED)
        c.setFont('Helvetica', 9)
        c.drawString(MARGIN, H - 108, 'Por favor complete todas las secciones antes de su primera cita. Los campos marcados con * son obligatorios.')
        c.drawString(MARGIN, H - 120, 'Toda la información es confidencial.')
        y = H - 142
    else:
        c.setFillColor(MUTED)
        c.setFont('Helvetica', 9)
        c.drawString(MARGIN, H - 34, 'Registro de nuevo paciente  ·  Clínica Familiar Lakeside  ·  página 2')
        y = H - 62


def section(title):
    global y
    c.setFillColor(BRAND)
    c.setFont('Helvetica-Bold', 9.5)
    c.drawString(MARGIN, y, title.upper())
    c.setStrokeColor(LINE)
    c.line(MARGIN, y - 4, W - MARGIN, y - 4)
    y -= 24


def slot(i, n):
    gap = 14
    w = (CONTENT - gap * (n - 1)) / n
    return MARGIN + i * (w + gap), w


def label(text, x, top):
    c.setFillColor(INK)
    c.setFont('Helvetica-Bold', 8.5)
    c.drawString(x, top, text)


def text_field(name, text, i, n, span=1, multiline=False, height=19):
    x, w = slot(i, n)
    if span > 1:
        w = slot(i + span - 1, n)[0] + slot(i + span - 1, n)[1] - x
    label(text, x, y)
    form.textfield(name=name, tooltip=text.rstrip(' *'), x=x, y=y - 6 - height, width=w, height=height, borderStyle='solid', borderColor=LINE,
                   fillColor=BOX, textColor=INK, fontSize=10, forceBorder=True, fieldFlags='multiline' if multiline else '')
    return height


def drop_down(name, text, options, i, n):
    x, w = slot(i, n)
    label(text, x, y)
    # a placeholder entry whose stored value is empty: choosing nothing must not count as an answer
    form.choice(name=name, tooltip=text.rstrip(' *'), value='Seleccione...', options=[('Seleccione...', '')] + [(o, o) for o in options], x=x, y=y - 25, width=w, height=19, borderStyle='solid',
                borderColor=LINE, fillColor=BOX, textColor=INK, fontSize=10, forceBorder=True, fieldFlags='combo')


def radio_row(name, text, options):
    global y
    label(text, MARGIN, y)
    x = MARGIN
    for value, caption in options:
        form.radio(name=name, tooltip=f'{text.rstrip(" *")} {caption}', value=value, selected=False, x=x, y=y - 22, size=11, buttonStyle='circle',
                   borderColor=LINE, fillColor=BOX, textColor=INK, forceBorder=True)
        c.setFillColor(INK)
        c.setFont('Helvetica', 9.5)
        c.drawString(x + 16, y - 19.5, caption)
        x += 16 + c.stringWidth(caption, 'Helvetica', 9.5) + 26
    y -= 40


def row(*cells, height=19, gap_after=22, columns=None):
    """cells: (kind, name, text, extra...) laid out left to right; the row is as tall as its tallest cell."""
    global y
    n = columns or len(cells)
    tallest = height
    i = 0
    for cell in cells:
        kind = cell[0]
        if kind == 'text':
            _, name, text = cell
            text_field(name, text, i, n)
            i += 1
        elif kind == 'wide':
            _, name, text, span, columns = cell
            text_field(name, text, i, columns, span=span)
            i += span
        elif kind == 'area':
            _, name, text = cell
            tallest = max(tallest, 70)
            text_field(name, text, 0, 1, multiline=True, height=70)
            i += 1
        elif kind == 'select':
            _, name, text, options = cell
            drop_down(name, text, options, i, n)
            i += 1
    y -= tallest + gap_after + 6


# ---------------------------------------------------------------- page 1
header(True)

section('Información del paciente')
row(('text', 'nombre_legal', 'Nombre legal *'), ('text', 'apellido_legal', 'Apellido legal *'), ('text', 'fecha_nacimiento', 'Fecha de nacimiento (mm/dd/aaaa) *'))
row(('select', 'sexo', 'Sexo asignado al nacer', ['Femenino', 'Masculino', 'Intersexual', 'Prefiero no decirlo']),
    ('select', 'estado_civil', 'Estado civil', ['Soltero(a)', 'Casado(a)', 'Divorciado(a)', 'Viudo(a)']),
    ('text', 'seguro_social', 'Número de Seguro Social'))
row(('wide', 'telefono_celular', 'Teléfono celular *', 1, 2), ('wide', 'correo', 'Correo electrónico', 1, 2))
row(('wide', 'direccion', 'Dirección (calle y número)', 2, 3), ('text', 'ciudad', 'Ciudad'), columns=3)
row(('text', 'ocupacion', 'Ocupación'), ('text', 'idioma', 'Idioma preferido'), ('select', 'interprete', '¿Necesita intérprete?', ['Sí', 'No']))

section('Seguro médico')
row(('wide', 'aseguradora', 'Compañía de seguros', 1, 2), ('wide', 'id_miembro', 'Número de identificación de miembro', 1, 2))

section('Contacto de emergencia')
row(('text', 'emergencia_nombre', 'Nombre completo *'), ('text', 'emergencia_relacion', 'Relación con el paciente'), ('text', 'emergencia_telefono', 'Número de teléfono *'))

c.showPage()

# ---------------------------------------------------------------- page 2
header(False)
section('Historial médico')
radio_row('alergias', '¿Tiene alguna alergia a medicamentos?', [('si', 'Sí'), ('no', 'No'), ('no_seguro', 'No estoy seguro(a)')])
row(('wide', 'alergias_lista', 'Si respondió que sí, escriba los medicamentos a los que es alérgico(a)', 1, 1))
radio_row('tabaco', '¿Fuma actualmente o usa productos de tabaco?', [('nunca', 'Nunca'), ('exfumador', 'Exfumador(a)'), ('actual', 'Fumador(a) actual')])
row(('wide', 'medicamentos', 'Medicamentos actuales (incluya recetas, vitaminas y suplementos)', 1, 1))
row(('area', 'motivo', 'Motivo de la visita de hoy * (describa sus síntomas y desde cuándo los tiene)'))

section('Consentimiento')
c.setFillColor(MUTED)
c.setFont('Helvetica', 8.5)
c.drawString(MARGIN, y + 2, 'Al marcar la casilla de abajo usted autoriza a la Clínica Familiar Lakeside a darle tratamiento y a cobrar a su compañía de seguros.')
y -= 22
form.checkbox(name='consentimiento', tooltip='He leído y estoy de acuerdo con el consentimiento para el tratamiento y el aviso de prácticas de privacidad',
              checked=False, x=MARGIN, y=y - 4, size=12, buttonStyle='check', borderColor=LINE, fillColor=BOX, textColor=INK, forceBorder=True)
c.setFillColor(INK)
c.setFont('Helvetica', 9.5)
c.drawString(MARGIN + 20, y - 1, 'He leído y estoy de acuerdo con el consentimiento para el tratamiento y el aviso de prácticas de privacidad.')

c.save()
print(f'wrote {OUT}')
