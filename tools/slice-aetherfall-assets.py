from __future__ import annotations

from collections import deque
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter, ImageOps


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "assets" / "aetherfall" / "source"
OUT = ROOT / "assets" / "aetherfall"

SHEETS = [
    ("roster-01.png", 1, 4, 4),
    ("roster-02.png", 17, 4, 4),
    ("roster-03.png", 33, 4, 4),
    ("roster-04.png", 49, 4, 4),
    ("roster-05.png", 65, 4, 4),
    ("roster-06.png", 81, 4, 4),
    ("roster-07.png", 97, 5, 1),
]

# The last sheet is a wide hero line rather than a strict equal-width grid.
# These hand-set crops keep each silhouette complete while excluding its
# neighbour's glow, wings, or weapon.
HERO_CROPS = {
    97: (0, 0, 470, 758),
    98: (335, 0, 815, 758),
    99: (705, 0, 1190, 758),
    100: (1040, 0, 1510, 758),
    101: (1600, 0, 2073, 758),
}

ELEMENTS = [
    # The Meridian Exodus (c001-c051)
    "flame", "aqua", "spark", "terra", "flora", "frost", "light", "cosmic", "shadow", "flora", "terra", "cosmic",
    "light", "cosmic", "spark", "psychic", "metal", "cosmic", "flora", "metal", "flame", "psychic", "shadow",
    "metal", "psychic", "flame", "cosmic", "light", "terra", "psychic", "shadow",
    "light", "cosmic", "psychic", "metal", "shadow",
    "flora", "metal", "light", "psychic", "terra", "shadow",
    "light", "metal", "cosmic", "psychic", "metal", "shadow", "shadow",
    "psychic", "shadow",
    # The Mana World (c052-c101)
    "flame", "flora", "metal", "flame",
    "flora", "aqua", "metal", "shadow", "spark", "venom",
    "metal", "aqua", "terra", "cosmic", "frost", "shadow", "flora", "terra", "light", "flora", "spark", "venom",
    "light", "flame", "cosmic", "flame", "frost", "shadow", "flora", "metal", "psychic", "aqua", "terra", "light",
    "flora", "cosmic", "flame", "frost", "shadow", "venom", "metal", "spark",
    "flora", "cosmic", "flame", "shadow", "psychic", "flame",
    "flora", "flame",
]

PALETTES = {
    "flame": ((54, 21, 24), (177, 67, 35), (255, 180, 84)),
    "aqua": ((10, 35, 54), (18, 110, 135), (94, 226, 231)),
    "spark": ((20, 31, 62), (55, 101, 174), (255, 221, 91)),
    "terra": ((40, 31, 29), (116, 77, 49), (209, 159, 87)),
    "flora": ((15, 42, 34), (47, 105, 67), (155, 211, 104)),
    "frost": ((18, 35, 60), (72, 126, 169), (203, 241, 255)),
    "venom": ((36, 22, 49), (93, 48, 112), (155, 222, 91)),
    "psychic": ((38, 24, 68), (98, 58, 151), (219, 151, 255)),
    "light": ((50, 39, 25), (159, 113, 49), (255, 229, 151)),
    "shadow": ((15, 17, 31), (50, 38, 83), (135, 94, 197)),
    "metal": ((26, 33, 45), (75, 91, 112), (192, 215, 224)),
    "cosmic": ((22, 25, 61), (57, 61, 143), (112, 216, 239)),
}

ARTIFACT_IDS = [
    "pin", "flint", "moss", "pebble", "vial", "feather",
    "swift", "oak", "emberdrop", "bud", "bead", "sunchip",
    "keen", "leech", "bramble", "idol", "gale", "ward",
    "banner", "torc", "bulwark", "falcon", "battery", "ember",
    "chalice", "titan", "phoenix", "mirror", "wyrm", "ankh",
]


def _cell(im: Image.Image, col: int, row: int, cols: int, rows: int) -> Image.Image:
    x0 = round(col * im.width / cols)
    x1 = round((col + 1) * im.width / cols)
    y0 = round(row * im.height / rows)
    y1 = round((row + 1) * im.height / rows)
    return im.crop((x0, y0, x1, y1)).convert("RGBA")


def _fit_subject(cell: Image.Image, size: int = 384, margin: int = 18) -> Image.Image:
    alpha = cell.getchannel("A")
    bbox = alpha.getbbox()
    if not bbox:
        return Image.new("RGBA", (size, size), (0, 0, 0, 0))
    subject = cell.crop(bbox)
    limit = size - margin * 2
    scale = min(limit / subject.width, limit / subject.height)
    resized = subject.resize((max(1, round(subject.width * scale)), max(1, round(subject.height * scale))), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    x = (size - resized.width) // 2
    y = size - margin - resized.height
    canvas.alpha_composite(resized, (x, y))
    return canvas


def _keep_largest_component(im: Image.Image, threshold: int = 72) -> Image.Image:
    """Discard neighbouring atlas figures while retaining the main silhouette."""
    alpha = im.getchannel("A")
    solid = alpha.point(lambda v: 255 if v >= threshold else 0)
    w, h = im.size
    pix = solid.load()
    seen = bytearray(w * h)
    best: list[tuple[int, int]] = []
    for y in range(h):
        for x in range(w):
            idx = y * w + x
            if seen[idx] or not pix[x, y]:
                continue
            seen[idx] = 1
            q = deque([(x, y)])
            comp: list[tuple[int, int]] = []
            while q:
                cx, cy = q.popleft()
                comp.append((cx, cy))
                for nx in range(max(0, cx - 1), min(w, cx + 2)):
                    for ny in range(max(0, cy - 1), min(h, cy + 2)):
                        ni = ny * w + nx
                        if not seen[ni] and pix[nx, ny]:
                            seen[ni] = 1
                            q.append((nx, ny))
            if len(comp) > len(best):
                best = comp
    mask = Image.new("L", (w, h), 0)
    mp = mask.load()
    for x, y in best:
        mp[x, y] = 255
    mask = mask.filter(ImageFilter.MaxFilter(9))
    cleaned = im.copy()
    cleaned.putalpha(Image.composite(alpha, Image.new("L", (w, h), 0), mask))
    return cleaned


def _card_backdrop(element: str, size: int = 384) -> Image.Image:
    top, bottom, glow = PALETTES[element]
    im = Image.new("RGB", (size, size), top)
    px = im.load()
    for y in range(size):
        t = y / max(1, size - 1)
        for x in range(size):
            edge = abs(x / max(1, size - 1) - 0.5) * 0.18
            u = min(1.0, max(0.0, t * 0.88 + edge))
            px[x, y] = tuple(round(top[i] * (1 - u) + bottom[i] * u) for i in range(3))
    halo = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(halo)
    draw.ellipse((44, 16, size - 44, size - 32), fill=(*glow, 84))
    halo = halo.filter(ImageFilter.GaussianBlur(52))
    return Image.alpha_composite(im.convert("RGBA"), halo)


def build_roster() -> None:
    avatars = OUT / "avatars"
    cards = OUT / "cards"
    avatars.mkdir(parents=True, exist_ok=True)
    cards.mkdir(parents=True, exist_ok=True)
    made = 0
    for filename, start, cols, rows in SHEETS:
        sheet = Image.open(SOURCE / filename).convert("RGBA")
        for row in range(rows):
            for col in range(cols):
                number = start + row * cols + col
                if number > 101:
                    continue
                source_cell = sheet.crop(HERO_CROPS[number]).convert("RGBA") if number in HERO_CROPS else _cell(sheet, col, row, cols, rows)
                if number in HERO_CROPS:
                    source_cell = _keep_largest_component(source_cell)
                avatar = _fit_subject(source_cell)
                stem = f"c{number:03d}"
                avatar.save(avatars / f"{stem}.webp", "WEBP", lossless=True, method=6)
                card = _card_backdrop(ELEMENTS[number - 1])
                shadow = Image.new("RGBA", card.size, (0, 0, 0, 0))
                a = avatar.getchannel("A").filter(ImageFilter.GaussianBlur(10))
                shadow.putalpha(a.point(lambda v: round(v * 0.38)))
                card.alpha_composite(shadow, (4, 10))
                card.alpha_composite(avatar)
                card.convert("RGB").save(cards / f"{stem}.webp", "WEBP", quality=90, method=6)
                made += 1
    if made != 101:
        raise RuntimeError(f"Expected 101 cards, created {made}")

def build_apex_cards() -> None:
    cards = OUT / "cards"
    apex = {
        "c050": "apex-seraphine.png",
        "c051": "apex-ouroboros.png",
        "c100": "apex-lyssara.png",
        "c101": "apex-rhazakar.png",
    }
    for card_id, filename in apex.items():
        art = Image.open(SOURCE / filename).convert("RGB")
        art = ImageOps.fit(art, (512, 512), method=Image.Resampling.LANCZOS, centering=(0.5, 0.46))
        art.save(cards / f"{card_id}.webp", "WEBP", quality=92, method=6)


def build_modes() -> None:
    names = ["manafront-siege", "paragon-run", "convergence-duel", "rift-arena", "fracture-depths", "pack-ripping"]
    out = OUT / "modes"
    out.mkdir(parents=True, exist_ok=True)
    sheet = Image.open(SOURCE / "modes.png").convert("RGB")
    for i, name in enumerate(names):
        row, col = divmod(i, 3)
        x0 = round(col * sheet.width / 3)
        x1 = round((col + 1) * sheet.width / 3)
        y0 = round(row * sheet.height / 2)
        y1 = round((row + 1) * sheet.height / 2)
        crop = sheet.crop((x0, y0, x1, y1)).resize((720, 540), Image.Resampling.LANCZOS)
        crop.save(out / f"{name}.webp", "WEBP", quality=88, method=6)


def build_packs() -> None:
    names = ["bronze", "silver", "gold"]
    out = OUT / "packs"
    out.mkdir(parents=True, exist_ok=True)
    sheet = Image.open(SOURCE / "packs.png").convert("RGB")
    for i, name in enumerate(names):
        x0 = round(i * sheet.width / 3)
        x1 = round((i + 1) * sheet.width / 3)
        cell = sheet.crop((x0, 0, x1, sheet.height))
        # The generated pack nearly fills its third; a tight crop keeps the
        # soft product backdrop out of the game card and rip overlay.
        crop = cell.crop((34, 15, cell.width - 34, cell.height - 25)).resize((360, 780), Image.Resampling.LANCZOS)
        crop.save(out / f"{name}.webp", "WEBP", quality=90, method=6)
        for set_key in ("gen1", "nd"):
            themed = crop.copy().convert("RGBA")
            mark = Image.new("RGBA", themed.size, (0, 0, 0, 0))
            draw = ImageDraw.Draw(mark)
            cx, cy = themed.width // 2, 205
            draw.ellipse((cx - 58, cy - 58, cx + 58, cy + 58), fill=(5, 10, 24, 178), outline=(245, 218, 142, 235), width=5)
            if set_key == "gen1":
                draw.ellipse((cx - 35, cy - 35, cx + 35, cy + 35), outline=(225, 245, 255, 245), width=8)
                draw.ellipse((cx - 8, cy - 8, cx + 8, cy + 8), fill=(150, 90, 230, 255))
                draw.arc((cx - 45, cy - 45, cx + 45, cy + 45), 205, 505, fill=(42, 28, 65, 255), width=12)
            else:
                draw.ellipse((cx - 30, cy - 43, cx + 15, cy + 18), fill=(83, 152, 76, 255), outline=(194, 229, 133, 255), width=4)
                draw.line((cx - 7, cy + 28, cx + 17, cy - 24), fill=(241, 224, 151, 255), width=6)
                draw.polygon([(cx + 3, cy + 31), (cx + 26, cy + 2), (cx + 39, cy + 37), (cx + 21, cy + 50)], fill=(239, 114, 47, 255), outline=(255, 218, 111, 255))
            themed = Image.alpha_composite(themed, mark).convert("RGB")
            themed.save(out / f"{set_key}-{name}.webp", "WEBP", quality=91, method=6)


def build_artifacts() -> None:
    out = OUT / "artifacts"
    out.mkdir(parents=True, exist_ok=True)
    sheet = Image.open(SOURCE / "artifacts.png").convert("RGB")
    for i, artifact_id in enumerate(ARTIFACT_IDS):
        row, col = divmod(i, 6)
        cell = _cell(sheet.convert("RGBA"), col, row, 6, 5).convert("RGB")
        # Preserve the icon's full silhouette. The atlas is wider than each
        # square slot, so extend its simple product backdrop above and below.
        edge = ImageOps.pad(cell, (256, 256), method=Image.Resampling.LANCZOS, color=cell.getpixel((2, 2)), centering=(0.5, 0.5))
        edge.save(out / f"{artifact_id}.webp", "WEBP", quality=90, method=6)


if __name__ == "__main__":
    build_roster()
    build_apex_cards()
    build_modes()
    build_packs()
    build_artifacts()
    print("Created 101 card artworks, 101 transparent battle avatars, 30 artifact icons, 6 mode paintings, and 6 set-specific pack fronts.")
