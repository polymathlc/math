from __future__ import annotations

import argparse
from collections import deque
from collections.abc import Callable
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter, ImageOps


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "assets" / "aetherfall" / "source"
OUT = ROOT / "assets" / "aetherfall"
SCENE_SOURCE = SOURCE / "card-scenes"
CARD_SIZE = (480, 384)

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

# Recurring places make the roster feel like one world rather than 101
# unrelated portraits. Two choices per element keep repeats from becoming a
# wallpaper while preserving a very small, readable visual vocabulary.
AETHARI_SCENES = {
    "flame": ("aethari-ashen-colony.png", "aethari-wormgate-concourse.png"),
    "aqua": ("aethari-living-laboratory.png", "aethari-crown-observatory.png"),
    "spark": ("aethari-crown-observatory.png", "aethari-astral-archive.png"),
    "terra": ("aethari-ashen-colony.png", "aethari-living-laboratory.png"),
    "flora": ("aethari-living-laboratory.png", "aethari-ashen-colony.png"),
    "frost": ("aethari-astral-archive.png", "aethari-crown-observatory.png"),
    "venom": ("aethari-devourer-rift.png", "aethari-ashen-colony.png"),
    "psychic": ("aethari-astral-archive.png", "aethari-wormgate-concourse.png"),
    "light": ("aethari-crown-observatory.png", "aethari-astral-archive.png"),
    "shadow": ("aethari-devourer-rift.png", "aethari-ashen-colony.png"),
    "metal": ("aethari-living-laboratory.png", "aethari-crown-observatory.png"),
    "cosmic": ("aethari-wormgate-concourse.png", "aethari-astral-archive.png"),
}

MANA_SCENES = {
    "flame": ("mana-emberpeak-forge.png", "mana-sunspire-highhold.png"),
    "aqua": ("mana-tideglass-shrine.png", "mana-viridian-rootway.png"),
    "spark": ("mana-sunspire-highhold.png", "mana-emberpeak-forge.png"),
    "terra": ("mana-viridian-rootway.png", "mana-sunspire-highhold.png"),
    "flora": ("mana-viridian-rootway.png", "mana-tideglass-shrine.png"),
    "frost": ("mana-frostglass-pass.png", "mana-tideglass-shrine.png"),
    "venom": ("mana-umbral-fen-ruins.png", "mana-viridian-rootway.png"),
    "psychic": ("mana-umbral-fen-ruins.png", "mana-sunspire-highhold.png"),
    "light": ("mana-sunspire-highhold.png", "mana-tideglass-shrine.png"),
    "shadow": ("mana-umbral-fen-ruins.png", "mana-frostglass-pass.png"),
    "metal": ("mana-emberpeak-forge.png", "mana-sunspire-highhold.png"),
    "cosmic": ("mana-frostglass-pass.png", "mana-umbral-fen-ruins.png"),
}

ARTIFACT_IDS = [
    "pin", "flint", "moss", "pebble", "vial", "feather",
    "swift", "oak", "emberdrop", "bud", "bead", "sunchip",
    "keen", "leech", "bramble", "idol", "gale", "ward",
    "banner", "torc", "bulwark", "falcon", "battery", "ember",
    "chalice", "titan", "phoenix", "mirror", "wyrm", "ankh",
]


def _cell(im: Image.Image, col: int, row: int, cols: int, rows: int) -> Image.Image:
    x0, y0, x1, y1 = _cell_bounds(im, col, row, cols, rows)
    return im.crop((x0, y0, x1, y1)).convert("RGBA")


def _cell_bounds(im: Image.Image, col: int, row: int, cols: int, rows: int) -> tuple[int, int, int, int]:
    return (
        round(col * im.width / cols),
        round(row * im.height / rows),
        round((col + 1) * im.width / cols),
        round((row + 1) * im.height / rows),
    )


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
    return _keep_scored_component(im, threshold, lambda component: (len(component),))


def _keep_core_component(
    im: Image.Image,
    core: tuple[int, int, int, int],
    threshold: int = 72,
) -> Image.Image:
    """Keep the component occupying the intended grid cell, including overhang."""
    x0, y0, x1, y1 = core

    def score(component: list[tuple[int, int]]) -> tuple[int, int]:
        in_core = sum(x0 <= x < x1 and y0 <= y < y1 for x, y in component)
        return in_core, len(component)

    return _keep_scored_component(im, threshold, score)


def _keep_scored_component(
    im: Image.Image,
    threshold: int,
    score: Callable[[list[tuple[int, int]]], tuple[int, ...]],
) -> Image.Image:
    alpha = im.getchannel("A")
    solid = alpha.point(lambda v: 255 if v >= threshold else 0)
    w, h = im.size
    pix = solid.load()
    seen = bytearray(w * h)
    best: list[tuple[int, int]] = []
    best_score: tuple[int, ...] = (-1,)
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
            component_score = score(comp)
            if component_score > best_score:
                best = comp
                best_score = component_score
    mask = Image.new("L", (w, h), 0)
    mp = mask.load()
    for x, y in best:
        mp[x, y] = 255
    mask = mask.filter(ImageFilter.MaxFilter(9))
    cleaned = im.copy()
    cleaned.putalpha(Image.composite(alpha, Image.new("L", (w, h), 0), mask))
    return cleaned


def _expanded_cell(
    sheet: Image.Image,
    col: int,
    row: int,
    cols: int,
    rows: int,
    overlap: float = 0.22,
) -> Image.Image:
    """Recover hair, capes, weapons, and effects that overhang a tight atlas cell."""
    x0, y0, x1, y1 = _cell_bounds(sheet, col, row, cols, rows)
    pad_x = round((x1 - x0) * overlap)
    pad_y = round((y1 - y0) * overlap)
    ex0, ey0 = max(0, x0 - pad_x), max(0, y0 - pad_y)
    ex1, ey1 = min(sheet.width, x1 + pad_x), min(sheet.height, y1 + pad_y)
    expanded = sheet.crop((ex0, ey0, ex1, ey1)).convert("RGBA")
    core = (x0 - ex0, y0 - ey0, x1 - ex0, y1 - ey0)
    return _keep_core_component(expanded, core, threshold=40)


def _story_backdrop(number: int, element: str, size: tuple[int, int] = CARD_SIZE) -> Image.Image:
    """Select a quiet lore location and keep it subordinate to the unit."""
    width, height = size
    library = AETHARI_SCENES if number <= 51 else MANA_SCENES
    choices = library[element]
    filename = choices[(number - 1) % len(choices)]
    scene = Image.open(SCENE_SOURCE / filename).convert("RGB")
    scene = ImageOps.fit(scene, size, method=Image.Resampling.LANCZOS)
    scene = scene.filter(ImageFilter.GaussianBlur(0.45)).convert("RGBA")

    # A restrained vignette and a low-opacity elemental halo keep pale and dark
    # silhouettes legible without turning the location into an effects plate.
    shade = Image.new("RGBA", size, (0, 0, 0, 0))
    shade_px = shade.load()
    for y in range(height):
        for x in range(width):
            nx = abs((x / max(1, width - 1)) - 0.5) * 2
            ny = abs((y / max(1, height - 1)) - 0.48) * 1.6
            alpha = round(min(46, max(0, (max(nx, ny) - 0.46) * 62)))
            shade_px[x, y] = (4, 7, 13, alpha)
    scene = Image.alpha_composite(scene, shade)

    glow = PALETTES[element][2]
    halo = Image.new("RGBA", size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(halo)
    draw.ellipse((round(width * 0.18), 34, round(width * 0.82), height - 18), fill=(*glow, 35))
    halo = halo.filter(ImageFilter.GaussianBlur(48))
    return Image.alpha_composite(scene, halo)


def build_roster(write_avatars: bool = True) -> None:
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
                source_cell = sheet.crop(HERO_CROPS[number]).convert("RGBA") if number in HERO_CROPS else _expanded_cell(sheet, col, row, cols, rows)
                if number in HERO_CROPS:
                    source_cell = _keep_largest_component(source_cell)
                stem = f"c{number:03d}"
                # Each equal-grid cell can contain a narrow disconnected sliver
                # from the neighbouring row. Isolate the intended central
                # silhouette before either export so atlas bleed cannot appear
                # in collection cards, previews, or battles.
                isolated_source = _keep_largest_component(source_cell, threshold=40) if number in HERO_CROPS else source_cell
                if write_avatars:
                    avatar = _fit_subject(isolated_source)
                    avatar.save(avatars / f"{stem}.webp", "WEBP", lossless=True, method=6)
                elif not (avatars / f"{stem}.webp").exists():
                    raise FileNotFoundError(f"Missing preserved battle avatar: {stem}.webp")

                card_avatar = avatar if write_avatars else _fit_subject(isolated_source)
                card = _story_backdrop(number, ELEMENTS[number - 1])
                subject_x = (card.width - card_avatar.width) // 2
                shadow = Image.new("RGBA", card_avatar.size, (0, 0, 0, 0))
                a = card_avatar.getchannel("A").filter(ImageFilter.GaussianBlur(10))
                shadow.putalpha(a.point(lambda v: round(v * 0.38)))
                card.alpha_composite(shadow, (subject_x + 4, 10))
                card.alpha_composite(card_avatar, (subject_x, 0))
                card.convert("RGB").save(cards / f"{stem}.webp", "WEBP", quality=90, method=6)
                made += 1
    if made != 101:
        raise RuntimeError(f"Expected 101 cards, created {made}")

def build_apex_cards() -> None:
    cards = OUT / "cards"
    apex = {
        "c050": "apex-seraphine-scene.png",
        "c051": "apex-ouroboros.png",
        "c100": "apex-lyssara.png",
        "c101": "apex-rhazakar.png",
    }
    for card_id, filename in apex.items():
        art = Image.open(SOURCE / filename).convert("RGB")
        # Apex paintings can be portrait or square. Fill the card window with a
        # quiet blurred extension, then contain the original painting so no
        # head, feet, wing, or weapon is sacrificed to the 5:4 card ratio.
        framed = ImageOps.fit(art, CARD_SIZE, method=Image.Resampling.LANCZOS, centering=(0.5, 0.46))
        framed = framed.filter(ImageFilter.GaussianBlur(18)).convert("RGBA")
        framed = Image.alpha_composite(framed, Image.new("RGBA", CARD_SIZE, (7, 10, 18, 72)))
        foreground = ImageOps.contain(art, CARD_SIZE, method=Image.Resampling.LANCZOS).convert("RGBA")
        position = ((CARD_SIZE[0] - foreground.width) // 2, (CARD_SIZE[1] - foreground.height) // 2)
        framed.alpha_composite(foreground, position)
        framed.convert("RGB").save(cards / f"{card_id}.webp", "WEBP", quality=92, method=6)


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
    parser = argparse.ArgumentParser(description="Build Aetherfall image assets from the source atlases.")
    build_scope = parser.add_mutually_exclusive_group()
    build_scope.add_argument(
        "--cards-only",
        action="store_true",
        help="Rebuild card art and apex cards without rewriting transparent battle avatars or unrelated assets.",
    )
    build_scope.add_argument(
        "--roster-only",
        action="store_true",
        help="Rebuild card art and isolated battle avatars without rewriting modes, packs, or artifacts.",
    )
    args = parser.parse_args()

    build_roster(write_avatars=not args.cards_only)
    build_apex_cards()
    if args.cards_only:
        print("Created 101 story-backed card artworks; transparent battle avatars were left untouched.")
    elif args.roster_only:
        print("Created 101 story-backed card artworks and 101 isolated transparent battle avatars.")
    else:
        build_modes()
        build_packs()
        build_artifacts()
        print("Created 101 card artworks, 101 transparent battle avatars, 30 artifact icons, 6 mode paintings, and 6 set-specific pack fronts.")
