"""Gera as ilustrações SVG do site Bella Brows & Lashes.

Todas as imagens são ilustrações vetoriais originais (macro de olho, sobrancelha
e cílios desenhados fio a fio), feitas para serem substituídas por fotografias
reais da profissional. Uso: python3 gen_images.py <pasta-destino>
"""
import math, random, sys, os
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen

OUT = sys.argv[1] if len(sys.argv) > 1 else "."
os.makedirs(OUT, exist_ok=True)

def f(x):  # número compacto
    return f"{x:.1f}".rstrip("0").rstrip(".")

def bez(p0, p1, p2, p3, t):
    u = 1 - t
    return tuple(u**3*a + 3*u*u*t*b + 3*u*t*t*c + t**3*d for a, b, c, d in zip(p0, p1, p2, p3))

def bez_d(p0, p1, p2, p3, t):
    u = 1 - t
    return tuple(3*u*u*(b-a) + 6*u*t*(c-b) + 3*t*t*(d-c) for a, b, c, d in zip(p0, p1, p2, p3))

# ---------------------------------------------------------------- tons de pele
SKINS = {
    "light":  ("#f6e1d3", "#e9c3ad", "#c99a82"),
    "medium": ("#ecc9ad", "#d6a684", "#a9775a"),
    "tan":    ("#ddb08c", "#c18e69", "#8d5f43"),
    "deep":   ("#b98463", "#9a6849", "#6b4330"),
}
BROW_COLORS = {"light": "#5a3d2e", "medium": "#45291c", "tan": "#3a2318", "deep": "#24150e"}

# --------------------------------------------------------------- componentes
UPPER = ((-150, 0), (-80, -78), (62, -86), (152, -6))
LOWER = ((152, -6), (72, 42), (-70, 46), (-150, 0))
BROW_BOTTOM = ((-178, -118), (-90, -150), (40, -178), (196, -138))
BROW_TOP = ((-182, -158), (-96, -188), (34, -214), (194, -150))

def eye_svg(rnd, skin, lash_len=1.0, lash_count=70, lower=True, iris="#5b3a26", uid="e"):
    s0, s1, s2 = skin
    eye_path = (f"M{f(UPPER[0][0])} {f(UPPER[0][1])} C{f(UPPER[1][0])} {f(UPPER[1][1])} {f(UPPER[2][0])} {f(UPPER[2][1])} {f(UPPER[3][0])} {f(UPPER[3][1])} "
                f"C{f(LOWER[1][0])} {f(LOWER[1][1])} {f(LOWER[2][0])} {f(LOWER[2][1])} {f(LOWER[3][0])} {f(LOWER[3][1])}Z")
    out = [f'<defs><clipPath id="{uid}c"><path d="{eye_path}"/></clipPath>'
           f'<radialGradient id="{uid}i" cx=".45" cy=".4" r=".6"><stop offset="0" stop-color="#a27a55"/><stop offset=".55" stop-color="{iris}"/><stop offset="1" stop-color="#22140c"/></radialGradient>'
           f'<radialGradient id="{uid}w" cx=".5" cy=".35" r=".7"><stop offset="0" stop-color="#fbf6f2"/><stop offset=".8" stop-color="#e8ddd6"/><stop offset="1" stop-color="#c9b2a6"/></radialGradient>'
           f'</defs>']
    # sombra da cavidade e prega da pálpebra
    out.append(f'<ellipse cx="0" cy="-30" rx="210" ry="95" fill="{s2}" opacity=".18" filter="url(#soft)"/>')
    out.append(f'<path d="M-158 -6 C-90 -112 70 -122 166 -16" fill="none" stroke="{s2}" stroke-width="7" opacity=".45" filter="url(#soft)"/>')
    out.append(f'<path d="M-150 -2 C-84 -98 66 -108 158 -12" fill="none" stroke="{s2}" stroke-width="2" opacity=".55"/>')
    # globo, íris, pupila, brilho
    out.append(f'<path d="{eye_path}" fill="url(#{uid}w)"/>')
    out.append(f'<g clip-path="url(#{uid}c)"><circle cx="4" cy="-16" r="54" fill="url(#{uid}i)"/>'
               f'<circle cx="4" cy="-16" r="54" fill="none" stroke="#1d110a" stroke-width="4" opacity=".7"/>'
               f'<circle cx="4" cy="-16" r="22" fill="#120a06"/>'
               f'<path d="{eye_path}" fill="none" stroke="#3b2418" stroke-width="16" opacity=".22"/></g>')
    out.append('<circle cx="22" cy="-34" r="9" fill="#fff" opacity=".9"/><circle cx="-14" cy="-2" r="3.5" fill="#fff" opacity=".6"/>')
    # linha d'água / pálpebra
    out.append(f'<path d="M{f(UPPER[0][0])} {f(UPPER[0][1])} C{f(UPPER[1][0])} {f(UPPER[1][1])} {f(UPPER[2][0])} {f(UPPER[2][1])} {f(UPPER[3][0])} {f(UPPER[3][1])}" fill="none" stroke="#2a1a12" stroke-width="5" stroke-linecap="round"/>')
    out.append(f'<path d="M152 -6 C72 42 -70 46 -150 0" fill="none" stroke="{s2}" stroke-width="3" opacity=".8"/>')
    # cílios superiores
    lashes = []
    for i in range(lash_count):
        t = 0.04 + 0.95 * i / max(lash_count - 1, 1) + rnd.uniform(-0.006, 0.006)
        t = min(max(t, 0.02), 0.995)
        x, y = bez(*UPPER, t)
        ang = math.radians(-128 + 108 * t + rnd.uniform(-6, 6))    # interno → externo
        ln = (15 + 30 * math.sin(math.pi * min(t * 1.1, 1)) ** 0.8 + 12 * t) * lash_len * rnd.uniform(0.85, 1.12)
        ex, ey = x + math.cos(ang) * ln, y + math.sin(ang) * ln
        # curvatura para cima
        cx_, cy_ = x + math.cos(ang) * ln * 0.55, y + math.sin(ang) * ln * 0.55 + ln * 0.22
        w = rnd.uniform(1.6, 2.6)
        lashes.append(f'<path d="M{f(x)} {f(y)}Q{f(cx_)} {f(cy_)} {f(ex)} {f(ey - ln*0.12)}" stroke-width="{f(w)}"/>')
    out.append('<g fill="none" stroke="#1a100b" stroke-linecap="round">' + "".join(lashes) + "</g>")
    if lower:
        low = []
        for i in range(22):
            t = 0.08 + 0.8 * i / 21
            x, y = bez(*LOWER, t)
            ang = math.radians(70 + 50 * t + rnd.uniform(-8, 8))
            ln = rnd.uniform(8, 16) * (0.6 + 0.4 * lash_len)
            low.append(f'<path d="M{f(x)} {f(y)}l{f(math.cos(ang)*ln)} {f(math.sin(ang)*ln)}"/>')
        out.append('<g stroke="#2a1a12" stroke-width="1.2" stroke-linecap="round" opacity=".6">' + "".join(low) + "</g>")
    return "".join(out)


def brow_svg(rnd, color, style="design", uid="b"):
    """style: sparse | design | henna | laminated"""
    cfg = {
        "sparse":    dict(n=170, stray=26, op=(0.35, 0.7), lift=0, len=(14, 24), gap=True),
        "design":    dict(n=430, stray=0,  op=(0.55, 0.95), lift=0, len=(16, 26), gap=False),
        "henna":     dict(n=400, stray=0,  op=(0.55, 0.95), lift=0, len=(16, 26), gap=False),
        "laminated": dict(n=560, stray=0,  op=(0.5, 0.9),  lift=1, len=(22, 34), gap=False),
    }[style]
    out = []
    top = BROW_TOP
    if style == "laminated":
        top = ((-184, -170), (-98, -204), (34, -228), (194, -156))
    if style == "henna":
        def edge(c, rev=False):
            pts = [bez(*c, i / 24) for i in range(25)]
            return pts[::-1] if rev else pts
        pts = edge(BROW_BOTTOM) + edge(BROW_TOP, True)
        d = "M" + " L".join(f"{f(x)} {f(y)}" for x, y in pts) + "Z"
        out.append(f'<path d="{d}" fill="{color}" opacity=".42" filter="url(#soft)"/>')
    hairs = []
    for _ in range(cfg["n"]):
        u = rnd.random() ** 0.92
        if cfg["gap"] and 0.38 < u < 0.52 and rnd.random() < 0.65:
            continue
        v = rnd.random()
        b = bez(*BROW_BOTTOM, u); tp = bez(*top, u)
        # pontas mais finas: estreita a altura perto da cauda
        taper = 1 - 0.55 * max(0, u - 0.65) / 0.35
        x = b[0] + (tp[0] - b[0]) * v * taper
        y = b[1] + (tp[1] - b[1]) * v * taper
        if cfg["lift"]:
            ang = -85 + 40 * u + rnd.uniform(-8, 8)
        elif u < 0.18:
            ang = -78 + rnd.uniform(-10, 10)
        elif u < 0.62:
            ang = -78 + (u - 0.18) / 0.44 * 58 + rnd.uniform(-9, 9)
        else:
            ang = -20 + (u - 0.62) / 0.38 * 32 + rnd.uniform(-7, 7)
        a = math.radians(ang)
        ln = rnd.uniform(*cfg["len"]) * (0.75 if u > 0.8 else 1)
        ex, ey = x + math.cos(a) * ln, y + math.sin(a) * ln
        mx, my = x + math.cos(a) * ln * 0.5 + 3, y + math.sin(a) * ln * 0.5 + 2
        op = rnd.uniform(*cfg["op"])
        hairs.append(f'<path d="M{f(x)} {f(y)}Q{f(mx)} {f(my)} {f(ex)} {f(ey)}" opacity="{op:.2f}" stroke-width="{rnd.uniform(1.3, 2.3):.1f}"/>')
    for _ in range(cfg["stray"]):   # fios fora do desenho (antes)
        u = rnd.random()
        b = bez(*BROW_BOTTOM, u)
        y = b[1] + rnd.choice([rnd.uniform(8, 30), rnd.uniform(-75, -48)])
        x = b[0] + rnd.uniform(-10, 10)
        a = math.radians(-60 + 50 * u + rnd.uniform(-20, 20))
        ln = rnd.uniform(9, 16)
        hairs.append(f'<path d="M{f(x)} {f(y)}l{f(math.cos(a)*ln)} {f(math.sin(a)*ln)}" opacity="{rnd.uniform(.3,.6):.2f}" stroke-width="1.3"/>')
    out.append(f'<g fill="none" stroke="{color}" stroke-linecap="round">' + "".join(hairs) + "</g>")
    return "".join(out)


def skin_bg(w, h, skin, uid, light=(0.35, 0.3)):
    s0, s1, s2 = skin
    return (f'<defs><radialGradient id="{uid}sk" cx="{light[0]}" cy="{light[1]}" r="1">'
            f'<stop offset="0" stop-color="{s0}"/><stop offset=".55" stop-color="{s1}"/><stop offset="1" stop-color="{s2}"/></radialGradient>'
            f'<filter id="soft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="6"/></filter>'
            f'<filter id="{uid}tx"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="4"/>'
            f'<feColorMatrix values="0 0 0 0 .45  0 0 0 0 .3  0 0 0 0 .22  0 0 0 .09 0"/></filter></defs>'
            f'<rect width="{w}" height="{h}" fill="url(#{uid}sk)"/>'
            f'<rect width="{w}" height="{h}" filter="url(#{uid}tx)"/>')


def macro(w, h, skin_key, brow_style, lash_len, lash_count, seed, uid, scale=1.0, cx=None, cy=None, light=(.35, .3), vignette=True):
    rnd = random.Random(seed)
    skin = SKINS[skin_key]
    cx = w / 2 if cx is None else cx
    cy = h * 0.62 if cy is None else cy
    body = [skin_bg(w, h, skin, uid, light)]
    body.append(f'<g transform="translate({f(cx)} {f(cy)}) scale({scale})">')
    body.append(brow_svg(rnd, BROW_COLORS[skin_key], brow_style, uid))
    body.append(eye_svg(rnd, skin, lash_len, lash_count, uid=uid))
    body.append('</g>')
    if vignette:
        body.append(f'<defs><radialGradient id="{uid}v" cx=".5" cy=".5" r=".75"><stop offset=".6" stop-color="#3b2418" stop-opacity="0"/><stop offset="1" stop-color="#3b2418" stop-opacity=".22"/></radialGradient></defs>'
                    f'<rect width="{w}" height="{h}" fill="url(#{uid}v)"/>')
    # luz suave de estúdio
    body.append(f'<defs><linearGradient id="{uid}l" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".28"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/></linearGradient></defs>'
                f'<rect width="{w}" height="{h}" fill="url(#{uid}l)"/>')
    return body


def svg(w, h, parts, title):
    title = title.replace("&", "&amp;")
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}" role="img" aria-label="{title}">'
            f'<title>{title}</title>' + "".join(parts) + "</svg>")


def save(name, content):
    with open(os.path.join(OUT, name), "w", encoding="utf-8") as fh:
        fh.write(content)
    print(name, len(content.encode()) // 1024, "KB")


# ------------------------------------------------------------------ pampas
def pampas(rnd, x0, y0, length, angle, color="#efe2d3", n=70):
    out = []
    a = math.radians(angle)
    ex, ey = x0 + math.cos(a) * length, y0 + math.sin(a) * length
    cxp, cyp = (x0 + ex) / 2 + 25, (y0 + ey) / 2
    out.append(f'<path d="M{f(x0)} {f(y0)}Q{f(cxp)} {f(cyp)} {f(ex)} {f(ey)}" stroke="#b89565" stroke-width="2" fill="none" opacity=".7"/>')
    for i in range(n):
        t = 0.35 + 0.65 * i / n
        px = (1-t)**2*x0 + 2*(1-t)*t*cxp + t*t*ex
        py = (1-t)**2*y0 + 2*(1-t)*t*cyp + t*t*ey
        side = rnd.choice([-1, 1])
        ang = angle + side * rnd.uniform(25, 60)
        ln = rnd.uniform(14, 34) * (1 - 0.5 * abs(t - 0.7))
        rx = ln / 2
        out.append(f'<ellipse cx="{f(px + math.cos(math.radians(ang))*rx)}" cy="{f(py + math.sin(math.radians(ang))*rx)}" rx="{f(rx)}" ry="{f(rnd.uniform(2.5,5))}" '
                   f'transform="rotate({f(ang)} {f(px + math.cos(math.radians(ang))*rx)} {f(py + math.sin(math.radians(ang))*rx)})" fill="{color}" opacity="{rnd.uniform(.55,.95):.2f}"/>')
    return "".join(out)


# =================================================================== IMAGENS
def hero():
    w, h = 440, 860
    rnd = random.Random(7)
    parts = [f'<defs><linearGradient id="hb" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f4e9e1"/><stop offset="1" stop-color="#e8d6ca"/></linearGradient>'
             f'<clipPath id="arch"><path d="M30 860 V250 A190 190 0 0 1 410 250 V860Z"/></clipPath></defs>'
             f'<rect width="{w}" height="{h}" fill="url(#hb)"/>']
    # janela em arco com o macro
    inner = macro(440, 860, "light", "design", 1.5, 86, 11, "h", scale=0.98, cx=222, cy=520, light=(.3, .25), vignette=False)
    parts.append('<g clip-path="url(#arch)">' + "".join(inner) + '</g>')
    parts.append('<path d="M30 860 V250 A190 190 0 0 1 410 250 V860" fill="none" stroke="#b89565" stroke-width="2.5" opacity=".9"/>')
    parts.append('<path d="M16 860 V250 A204 204 0 0 1 424 250 V860" fill="none" stroke="#b89565" stroke-width="1" opacity=".5"/>')
    parts.append(pampas(rnd, 430, 860, 250, -98))
    parts.append(pampas(rnd, 440, 860, 200, -106, "#e6d3c2"))
    parts.append(pampas(rnd, 10, 860, 220, -76, "#efe2d3", 50))
    return svg(w, h, parts, "Ilustração de olho com sobrancelha desenhada e cílios alongados")


def service(name, skin, brow, lash_len, lash_count, seed, title, cy=None, scale=1.0, cx=400):
    w, h = 800, 600
    return name, svg(w, h, macro(w, h, skin, brow, lash_len, lash_count, seed, name[:2], scale=scale, cx=cx, cy=cy), title)


def map_demo():
    w, h = 800, 480
    p = [f'<rect width="{w}" height="{h}" fill="#efe4db"/>']
    rnd = random.Random(3)
    blocks = []
    for gx in range(0, w, 120):
        for gy in range(0, h, 100):
            if rnd.random() < 0.9:
                blocks.append(f'<rect x="{gx+14}" y="{gy+14}" width="92" height="72" rx="8" fill="#f8f1eb"/>')
    p.append("".join(blocks))
    p.append('<path d="M0 330 C200 300 380 380 800 290" stroke="#fff" stroke-width="26" fill="none"/>')
    p.append('<path d="M520 0 C500 160 560 300 520 480" stroke="#fff" stroke-width="20" fill="none"/>')
    p.append('<rect x="254" y="114" width="212" height="172" rx="14" fill="#dfe6d8"/>')
    p.append('<circle cx="300" cy="170" r="16" fill="#cfd9c5"/><circle cx="410" cy="230" r="22" fill="#cfd9c5"/><circle cx="350" cy="250" r="12" fill="#cfd9c5"/>')
    p.append('<g transform="translate(520 236)"><ellipse cx="0" cy="52" rx="26" ry="8" fill="#6e5246" opacity=".25"/>'
             '<path d="M0 50 C-8 30 -34 10 -34 -14 A34 34 0 0 1 34 -14 C34 10 8 30 0 50Z" fill="#b5786a"/>'
             '<circle cx="0" cy="-14" r="13" fill="#fff"/></g>')
    return svg(w, h, p, "Mapa ilustrativo de localização")


def font_path(font, text, size, x, y, anchor="middle", tracking=0):
    gs = font.getGlyphSet(); cmap = font.getBestCmap(); upm = font["head"].unitsPerEm
    sc = size / upm
    names = [cmap.get(ord(c), ".notdef") for c in text]
    adv = [gs[n].width * sc + tracking for n in names]
    total = sum(adv) - tracking
    cx = x - total / 2 if anchor == "middle" else x
    out = []
    for n, a in zip(names, adv):
        pen = SVGPathPen(gs)
        gs[n].draw(TransformPen(pen, (sc, 0, 0, -sc, cx, y)))
        d = pen.getCommands()
        if d:
            out.append(d)
        cx += a
    return "".join(out)


def logo(variant="full"):
    """Logo própria: arco (como uma sobrancelha) sobre monograma BB, com três cílios."""
    cardo = TTFont("/usr/share/fonts/truetype/google-fonts/ofl/cardo/Cardo-Regular.ttf")
    cardo_i = TTFont("/usr/share/fonts/truetype/google-fonts/ofl/cardo/Cardo-Italic.ttf")
    from fontTools.varLib import instancer
    mont = instancer.instantiateVariableFont(TTFont("/usr/share/fonts/truetype/google-fonts/ofl/montserrat/Montserrat[wght].ttf"), {"wght": 500})
    gold = "#a8845a"; brown = "#6e5246"
    mark = [
        '<defs><linearGradient id="lg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#c9a36f"/><stop offset=".5" stop-color="#a8845a"/><stop offset="1" stop-color="#8c6a45"/></linearGradient></defs>',
        # moldura em arco (formato de janela)
        '<path d="M60 250 V110 A70 70 0 0 1 200 110 V250Z" fill="none" stroke="url(#lg)" stroke-width="2.4"/>',
        '<path d="M70 240 V112 A60 60 0 0 1 190 112 V240Z" fill="none" stroke="url(#lg)" stroke-width=".8" opacity=".7"/>',
        # arco da sobrancelha
        '<path d="M88 112 C108 92 150 86 176 104" fill="none" stroke="url(#lg)" stroke-width="3" stroke-linecap="round"/>',
        # monograma
        f'<path fill="url(#lg)" d="{font_path(cardo, "B", 96, 116, 200)}"/>',
        f'<path fill="url(#lg)" opacity=".85" d="{font_path(cardo_i, "B", 96, 146, 214)}"/>',
        # cílios
        '<g stroke="url(#lg)" stroke-width="2.4" stroke-linecap="round" fill="none"><path d="M112 226 q-4 8 -10 11"/><path d="M130 229 q0 9 -3 13"/><path d="M148 226 q4 8 10 11"/></g>',
    ]
    if variant == "mark":
        return svg(260, 270, ['<g transform="translate(0 -4)">'] + mark + ['</g>'], "Bella Brows & Lashes")
    words = [
        f'<path fill="{brown}" d="{font_path(cardo, "Bella", 64, 130, 340)}"/>',
        f'<path fill="{gold}" d="{font_path(mont, "BROWS & LASHES", 15, 130, 374, tracking=4.2)}"/>',
    ]
    return svg(260, 392, mark + words, "Bella Brows & Lashes")


if __name__ == "__main__":
    save("hero.svg", hero())
    for n, c in [
        service("servico-design.svg", "medium", "design", 0.9, 60, 21, "Ilustração: design de sobrancelha", cy=420, scale=1.25, cx=390),
        service("servico-henna.svg", "light", "henna", 0.9, 60, 22, "Ilustração: sobrancelha com henna", cy=430, scale=1.25, cx=410),
        service("servico-lamination.svg", "tan", "laminated", 0.95, 62, 23, "Ilustração: brow lamination", cy=440, scale=1.2, cx=400),
        service("servico-cilios.svg", "deep", "design", 1.55, 95, 24, "Ilustração: extensão de cílios", cy=430, scale=1.35, cx=400),
    ]:
        save(n, c)
    # Resultados (antes / depois) — tons e enquadramentos diferentes dos serviços
    pairs = [
        ("design", "tan", ("sparse", 0.85, 55), ("design", 0.85, 55), 31),
        ("henna", "medium", ("sparse", 0.85, 55), ("henna", 0.85, 55), 32),
        ("lamination", "light", ("sparse", 0.85, 55), ("laminated", 0.9, 55), 33),
        ("cilios", "medium", ("design", 0.75, 40), ("design", 1.6, 96), 34),
    ]
    for key, skin, before, after, seed in pairs:
        for tag, (brow, ll, lc) in (("antes", before), ("depois", after)):
            cy = 400 if key == "cilios" else 400
            sc = 1.25 if key == "cilios" else 1.05
            body = macro(600, 600, skin, brow, ll, lc, seed, f"r{key[:2]}{tag[0]}", scale=sc, cx=300, cy=cy, light=(.55, .25))
            save(f"resultado-{key}-{tag}.svg", svg(600, 600, body, f"Ilustração {tag}: {key}"))
    save("mapa-demo.svg", map_demo())
    save("logo.svg", logo())
    save("logo-marca.svg", logo("mark"))
