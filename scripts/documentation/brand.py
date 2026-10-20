"""Drawing kit for the Lianum security self-assessment.

Mirrors the visual language of lianum-architecture.svg: ivory paper with a
dot grid, extruded boxes, mono labels, pill captions and a five-colour
semantic palette.
"""

INK = "#222321"
MUTED = "#666A60"
LINE = "#A6A99C"
HAIR = "#D9DACE"
PAPER = "#FFFCF0"
SIDE = "#EFEEE3"
SIDE_DARK = "#E4E2D6"
SLATE = "#253746"

PALETTE = {
    "blue": ("#245E9D", "#E5EDED", "#CDDEE4"),
    "orange": ("#B85D2E", "#FBE8D7", "#F1CEB1"),
    "purple": ("#7260B4", "#EDE8F6", "#D9CFEB"),
    "green": ("#658348", "#F1F4E8", "#DDE6CE"),
    "red": ("#A23F2E", "#F7E1DA", "#EBC3B7"),
    "amber": ("#8C6D1F", "#F5EED7", "#E7DEC1"),
    "ink": (INK, PAPER, SIDE_DARK),
    "grey": (LINE, PAPER, SIDE),
}

SANS = "DejaVu Sans, Arial, sans-serif"
MONO = "DejaVu Sans Mono, monospace"


def esc(s):
    return (str(s).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;"))


def svg(w, h, body, cls="fig"):
    return (
        f'<svg class="{cls}" xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" '
        f'viewBox="0 0 {w} {h}" font-family="{SANS}">{markers()}{body}</svg>'
    )


def markers():
    out = ["<defs>"]
    for name, (stroke, _, _) in PALETTE.items():
        out.append(
            f'<marker id="a-{name}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" '
            f'markerHeight="6" markerUnits="userSpaceOnUse" orient="auto-start-reverse">'
            f'<path d="M0,0 L10,5 L0,10 Z" fill="{stroke}"/></marker>'
        )
    out.append("</defs>")
    return "".join(out)


def box(x, y, w, h, color="grey", d=5, fill=None, sw=1.2, tinted=False):
    """Extruded box: front face plus right and bottom faces."""
    stroke, light, side = PALETTE[color]
    if color == "grey":
        side = SIDE
    face = fill or (light if tinted else PAPER)
    return (
        f'<path d="M{x+w},{y} l{d},{d} v{h} l{-d},{-d} Z" stroke="{stroke}" stroke-width="{sw}" '
        f'fill="{side}" stroke-linejoin="round"/>'
        f'<path d="M{x},{y+h} h{w} l{d},{d} h{-w} Z" stroke="{stroke}" stroke-width="{sw}" '
        f'fill="{side}" stroke-linejoin="round"/>'
        f'<rect x="{x}" y="{y}" width="{w}" height="{h}" fill="{face}" stroke="{stroke}" stroke-width="{sw}"/>'
    )


def text(x, y, s, size=11, color=INK, weight=400, anchor="start", mono=False, spacing=None, italic=False):
    fam = MONO if mono else SANS
    ls = f' letter-spacing="{spacing}"' if spacing else ""
    st = ' font-style="italic"' if italic else ""
    return (
        f'<text x="{x}" y="{y}" font-family="{fam}" font-size="{size}" font-weight="{weight}" '
        f'fill="{color}" text-anchor="{anchor}"{ls}{st}>{esc(s)}</text>'
    )


def label(x, y, s, color=MUTED, anchor="start", size=8.5):
    """Uppercase mono eyebrow label."""
    return text(x, y, s.upper(), size=size, color=color, anchor=anchor, mono=True, spacing=0.8)


def pill(cx, cy, s, color="blue", size=9, fill=PAPER, mono=True, pad=9):
    stroke = PALETTE[color][0]
    w = len(s) * size * (0.61 if mono else 0.58) + pad * 2
    h = size + 9
    return (
        f'<rect x="{cx - w/2:.1f}" y="{cy - h/2:.1f}" width="{w:.1f}" height="{h}" rx="{h/2}" '
        f'fill="{fill}" stroke="{stroke}" stroke-width="0.9"/>'
        + text(cx, cy + size * 0.36, s, size=size, color=stroke, anchor="middle", mono=mono)
    )


def path(d, color="blue", sw=1.4, dashed=False, start=False, end=True, fill="none"):
    stroke = PALETTE[color][0]
    dash = ' stroke-dasharray="6 5"' if dashed else ""
    ms = f' marker-start="url(#a-{color})"' if start else ""
    me = f' marker-end="url(#a-{color})"' if end else ""
    return (
        f'<path d="{d}" stroke="{stroke}" stroke-width="{sw}" fill="{fill}" stroke-linecap="round" '
        f'stroke-linejoin="round"{dash}{ms}{me}/>'
    )


def frame(x, y, w, h, title, color="ink", gap=None, right=None, sw=1.1, dashed=False, title_size=13, icon=""):
    """Open frame with a title sitting in a gap of the top edge."""
    stroke = PALETTE[color][0]
    gap = gap or (len(title) * title_size * 0.62 + (34 if icon else 18))
    dash = ' stroke-dasharray="5 5"' if dashed else ""
    out = [
        f'<path d="M{x+14},{y} H{x} V{y+h} H{x+w} V{y} H{x+14+gap}" stroke="{stroke}" '
        f'stroke-width="{sw}" fill="none" stroke-linejoin="round"{dash}/>'
    ]
    tx = x + 22
    if icon:
        out.append(icon)
        tx += 22
    out.append(text(tx, y + title_size * 0.38, title, size=title_size, color=stroke, weight=500))
    if right:
        out.append(label(x + w - 12, y + 18, right, color=stroke, anchor="end", size=7.5))
    return "".join(out)


def google_cloud(x, y, s=18):
    return (
        f'<svg x="{x}" y="{y}" width="{s}" height="{s}" viewBox="0 -25 256 256">'
        '<path fill="#EA4335" d="m170.252 56.819 22.253-22.253 1.483-9.37C153.437-11.677 88.976-7.496 52.42 33.92 42.267 45.423 34.734 59.764 30.717 74.573l7.97-1.123 44.505-7.34 3.436-3.513c19.797-21.742 53.27-24.667 76.128-6.168l7.496.39Z"/>'
        '<path fill="#4285F4" d="M224.205 73.918a100.249 100.249 0 0 0-30.217-48.722l-31.232 31.232a55.515 55.515 0 0 1 20.379 44.037v5.544c15.35 0 27.797 12.445 27.797 27.796 0 15.352-12.446 27.485-27.797 27.485h-55.671l-5.466 5.934v33.34l5.466 5.231h55.67c39.93.311 72.553-31.494 72.864-71.424a72.303 72.303 0 0 0-31.793-60.453"/>'
        '<path fill="#34A853" d="M71.87 205.796h55.593V161.29H71.87a27.275 27.275 0 0 1-11.399-2.498l-7.887 2.42-22.409 22.253-1.952 7.574c12.567 9.489 27.9 14.825 43.647 14.757"/>'
        '<path fill="#FBBC05" d="M71.87 61.425C31.94 61.664-.237 94.228.001 134.159a72.301 72.301 0 0 0 28.222 56.88l32.248-32.246c-13.99-6.322-20.208-22.786-13.887-36.776 6.32-13.99 22.786-20.208 36.775-13.888a27.796 27.796 0 0 1 13.887 13.888l32.248-32.248A72.224 72.224 0 0 0 71.87 61.425"/>'
        "</svg>"
    )


def phone(x, y, s=1.0, color="blue"):
    """Isometric phone with padlock, from the architecture drawing."""
    c, light, mid = PALETTE[color]
    return (
        f'<g transform="translate({x},{y}) scale({s}) translate(-150,-433)" stroke="{c}" '
        'stroke-linecap="round" stroke-linejoin="round">'
        f'<path d="M150,446 L172,433 302,507 280,520 Z" stroke-width="2.6" fill="{light}"/>'
        f'<path d="M280,520 L302,507 V729 L280,742 Z" stroke-width="2.6" fill="{mid}"/>'
        f'<path d="M150,446 L280,520 V742 L150,668 Z" stroke-width="2.6" fill="{light}"/>'
        f'<path d="M164,475 L266,533 V713 L164,655 Z" stroke-width="2.2" fill="{PAPER}"/>'
        '<path d="M198,484 L235,505" stroke-width="2.3" fill="none"/>'
        '<path d="M199,695 L231,713" stroke-width="2.3" fill="none"/>'
        '<path d="M192,563 V546 Q214,531 236,569 V588" stroke-width="2.4" fill="none"/>'
        f'<path d="M184,557 L245,592 V647 L184,612 Z" stroke-width="2.2" fill="{light}"/>'
        '<path d="M213,597 v17" stroke-width="2.5" fill="none"/>'
        "</g>"
    )


def eth(cx, cy, s=1.0):
    return (
        f'<g transform="translate({cx},{cy}) scale({s}) translate(-676,-1554)">'
        '<path d="M676,1529 L661,1554 676,1563 691,1554 Z" fill="#69727B"/>'
        '<path d="M676,1567 L661,1558 676,1581 691,1558 Z" fill="#AAB0B6"/>'
        '<path d="M676,1529 V1563 L691,1554 Z" fill="#9098A1"/></g>'
    )


def sol(cx, cy, s=1.0):
    return (
        f'<g transform="translate({cx},{cy}) scale({s}) translate(-1728,-1554)">'
        '<path d="M1715,1533 h35 l-9,10 h-35 Z" fill="#A14CFF"/>'
        '<path d="M1706,1549 h35 l9,10 h-35 Z" fill="#38CBCC"/>'
        '<path d="M1715,1565 h35 l-9,10 h-35 Z" fill="#16E6A0"/></g>'
    )


def btc(cx, cy, s=1.0):
    return (
        f'<g transform="translate({cx},{cy}) scale({s})">'
        '<circle r="23" fill="#F7931A"/><g transform="rotate(12)">'
        '<path d="M-8,-13 V13 M-10,-13 H2 C13,-13 13,0 2,0 H-8 M-8,0 H3 C15,0 15,13 3,13 H-10" '
        'stroke="#FFFFFF" stroke-width="3.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>'
        '<path d="M-4,-18 V-14 M3,-18 V-14 M-4,14 V18 M3,14 V18" stroke="#FFFFFF" stroke-width="2.8" '
        'fill="none" stroke-linecap="round"/></g></g>'
    )


LOGO_PATHS = (
    '<g transform="translate(0.0000 12.8000) scale(0.90000000)"><path d="M32 88Q32 48 72 48H160L136 96H100Q80 96 80 116V144L32 168Z"/>'
    '<path d="M32 88Q32 48 72 48H160L136 96H100Q80 96 80 116V144L32 168Z" transform="rotate(180 128 128)"/></g>'
    '<g transform="translate(240.0000 70.5000) scale(1.15000000)"><g transform="scale(0.13297872) translate(-80.0000 729.0000)">'
    '<path d="M80 -729H230V-180Q230 -150 260 -150H605L530 0H160Q80 0 80 -80Z"/>'
    '<path d="M792 -540H652V0H792ZM792 -729H652V-604H792Z"/>'
    '<path d="M1361 -17C1337 -40 1329 -56 1329 -83V-383C1329 -493 1254 -549 1108 -549C962 -549 886 -487 877 -362H1012C1019 -418 1042 -436 1111 -436C1165 -436 1192 -418 1192 -382C1192 -364 1183 -349 1168 -340C1149 -330 1149 -330 1080 -319L1024 -309C917 -291 865 -236 865 -139C865 -42 930 23 1029 23C1089 23 1143 -2 1193 -54C1193 -26 1196 -16 1209 0H1361ZM1192 -217C1192 -136 1152 -90 1081 -90C1034 -90 1005 -115 1005 -155C1005 -197 1027 -217 1085 -229L1133 -238C1170 -245 1176 -247 1192 -255Z"/>'
    '<path d="M1430 -540V0H1570V-324C1570 -388 1614 -430 1683 -430C1743 -430 1773 -397 1773 -333V0H1913V-362C1913 -482 1848 -549 1732 -549C1659 -549 1610 -523 1570 -462V-540Z"/>'
    '<path d="M2493 0V-540H2353V-202C2353 -138 2309 -96 2240 -96C2180 -96 2150 -128 2150 -193V-540H2010V-164C2010 -44 2075 23 2191 23C2264 23 2313 -3 2353 -64V0Z"/>'
    '<path d="M2597 -540V0H2737V-324C2737 -391 2773 -430 2833 -430C2880 -430 2909 -403 2909 -360V0H3049V-324C3049 -390 3085 -430 3145 -430C3192 -430 3221 -403 3221 -360V0H3361V-382C3361 -487 3297 -549 3189 -549C3120 -549 3073 -525 3031 -469C3005 -520 2951 -549 2884 -549C2822 -549 2782 -529 2736 -473V-540Z"/>'
    "</g></g>"
)

MARK_PATHS = (
    '<path d="M32 88Q32 48 72 48H160L136 96H100Q80 96 80 116V144L32 168Z"/>'
    '<path d="M32 88Q32 48 72 48H160L136 96H100Q80 96 80 116V144L32 168Z" transform="rotate(180 128 128)"/>'
)


def logo(height=22, color=SLATE):
    w = height * 773.7487 / 256
    return (
        f'<svg class="logo" width="{w:.1f}" height="{height}" viewBox="0 0 773.7487 256" '
        f'xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Lianum"><g fill="{color}">{LOGO_PATHS}</g></svg>'
    )


def mark(size=18, color=SLATE, x=None, y=None):
    pos = f' x="{x}" y="{y}"' if x is not None else ""
    return (
        f'<svg{pos} width="{size}" height="{size}" viewBox="0 0 256 256" '
        f'xmlns="http://www.w3.org/2000/svg"><g fill="{color}">{MARK_PATHS}</g></svg>'
    )


# Small line icons in the drawing's stroke style, centred on (0,0), ~40px box.
ICONS = {
    "key": '<circle cx="-8" cy="-7" r="13"/><path d="M2,2 l18,18 M11,11 l6,-6 M16,16 l6,-6"/>',
    "shield": '<path d="M0,-22 L19,-13 V1 Q19,16 0,23 Q-19,16 -19,1 V-13 Z M-9,0 l6,7 13,-16"/>',
    "db": '<ellipse cx="0" cy="-12" rx="19" ry="7"/><path d="M-19,-12 v24 c0,9 38,9 38,0 v-24 M-19,0 c0,9 38,9 38,0"/>',
    "code": '<path d="M-9,-12 L-21,0 -9,12 M9,-12 L21,0 9,12 M4,-18 L-4,18"/>',
    "graph": '<path d="M-17,-13 L17,-13 M-17,-13 L0,14 M17,-13 L0,14"/><circle cx="-17" cy="-13" r="5"/><circle cx="17" cy="-13" r="5"/><circle cx="0" cy="14" r="5"/>',
    "link": '<path d="M-3,-9 l6,-6 a10,10 0 0 1 14,14 l-6,6 M3,9 l-6,6 a10,10 0 0 1 -14,-14 l6,-6 M-8,8 L8,-8"/>',
    "pulse": '<path d="M-22,2 h8 l6,-17 10,30 7,-19 h13 M-22,-22 v44 h44"/>',
    "swap": '<path d="M-21,-9 H18 M10,-17 l9,8 -9,8 M21,10 H-18 M-10,2 l-9,8 9,8"/>',
    "hex": '<path d="M0,-24 L21,-12 V12 L0,24 -21,12 V-12 Z"/><path d="M-5,-10 L10,0 -5,10 Z"/>',
    "lock": '<rect x="-15" y="-4" width="30" height="24" rx="2"/><path d="M-9,-4 v-8 a9,9 0 0 1 18,0 v8 M0,5 v6"/>',
    "eye": '<path d="M-22,0 Q0,-20 22,0 Q0,20 -22,0 Z"/><circle r="6"/>',
    "bolt": '<path d="M4,-22 L-12,3 H1 L-4,22 L12,-3 H-1 Z"/>',
    "chat": '<path d="M-20,-16 H20 V8 H-2 L-12,17 V8 H-20 Z M-11,-5 h22 M-11,1 h14"/>',
    "cloud": '<path d="M-14,12 H14 A10,10 0 0 0 13,-8 A14,14 0 0 0 -12,-6 A9,9 0 0 0 -14,12 Z"/>',
    "clock": '<circle r="20"/><path d="M0,-11 V0 L8,6"/>',
    "check": '<circle r="20"/><path d="M-9,0 l6,7 13,-14"/>',
    "x": '<circle r="20"/><path d="M-7,-7 L7,7 M7,-7 L-7,7"/>',
    "user": '<circle cy="-9" r="9"/><path d="M-18,20 Q-18,3 0,3 Q18,3 18,20"/>',
    "cpu": '<rect x="-14" y="-14" width="28" height="28"/><rect x="-6" y="-6" width="12" height="12"/><path d="M-8,-14 v-6 M0,-14 v-6 M8,-14 v-6 M-8,14 v6 M0,14 v6 M8,14 v6 M-14,-8 h-6 M-14,0 h-6 M-14,8 h-6 M14,-8 h6 M14,0 h6 M14,8 h6"/>',
}


def icon(name, cx, cy, color="blue", s=0.5, sw=1.8, fill="none"):
    stroke = PALETTE[color][0] if color in PALETTE else color
    return (
        f'<g transform="translate({cx},{cy}) scale({s})" fill="{fill}" stroke="{stroke}" '
        f'stroke-width="{sw / s:.2f}" stroke-linejoin="round" stroke-linecap="round">{ICONS[name]}</g>'
    )
