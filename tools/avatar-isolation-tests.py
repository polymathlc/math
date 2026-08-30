from __future__ import annotations

from collections import deque
import importlib.util
from pathlib import Path
import sys

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
AVATARS = ROOT / "assets" / "aetherfall" / "avatars"
SLICER_PATH = ROOT / "tools" / "slice-aetherfall-assets.py"

sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location("slice_aetherfall_assets", SLICER_PATH)
assert spec and spec.loader, "Could not load the Aetherfall asset slicer"
slicer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(slicer)


def components(alpha: Image.Image, threshold: int = 72) -> list[tuple[int, tuple[int, int, int, int]]]:
    solid = alpha.point(lambda value: 255 if value >= threshold else 0)
    width, height = solid.size
    pixels = solid.load()
    seen = bytearray(width * height)
    found: list[tuple[int, tuple[int, int, int, int]]] = []
    for y in range(height):
        for x in range(width):
            index = y * width + x
            if seen[index] or not pixels[x, y]:
                continue
            seen[index] = 1
            queue = deque([(x, y)])
            size = 0
            x0 = x1 = x
            y0 = y1 = y
            while queue:
                cx, cy = queue.popleft()
                size += 1
                x0, x1 = min(x0, cx), max(x1, cx)
                y0, y1 = min(y0, cy), max(y1, cy)
                for nx in range(max(0, cx - 1), min(width, cx + 2)):
                    for ny in range(max(0, cy - 1), min(height, cy + 2)):
                        neighbour = ny * width + nx
                        if not seen[neighbour] and pixels[nx, ny]:
                            seen[neighbour] = 1
                            queue.append((nx, ny))
            found.append((size, (x0, y0, x1 + 1, y1 + 1)))
    return sorted(found, reverse=True)


files = sorted(AVATARS.glob("c*.webp"))
assert len(files) == 101, f"Expected 101 avatars, found {len(files)}"
edge_regressions = {"c055.webp": "top", "c075.webp": "bottom"}

for path in files:
    avatar = Image.open(path).convert("RGBA")
    assert avatar.size == (384, 384), f"{path.name}: unexpected size {avatar.size}"
    found = components(avatar.getchannel("A"))
    assert found, f"{path.name}: empty avatar"
    # Detached spell orbs are legitimate. Pin the two reported atlas-edge
    # regressions: Asha had a horizontal strip above her banner and Torren had
    # part of the next character below his feet.
    strays = []
    if path.name in edge_regressions:
        edge = edge_regressions[path.name]
        for size, (x0, y0, x1, y1) in found[1:]:
            width, height = x1 - x0, y1 - y0
            in_row_edge = y1 <= 64 if edge == "top" else y0 >= 320
            is_fragment = size >= 64 and (height <= 36 or width >= height * 3)
            if in_row_edge and is_fragment:
                strays.append((size, (x0, y0, x1, y1)))
        assert not strays, f"{path.name}: probable neighbouring-row fragments {strays}"

# The source atlases deliberately pack figures closer than their nominal grid
# cells. Verify the expanded extractor retains the intended component without
# clipping it against its temporary crop.
known_overhangs = {
    16: "top",
    29: "top",
    36: "left",
    45: "top",
    51: "right",
    63: "right",
    83: "right",
    96: "top",
}
recovered: dict[int, set[str]] = {}
for filename, start, cols, rows in slicer.SHEETS[:-1]:
    sheet = Image.open(slicer.SOURCE / filename).convert("RGBA")
    for row in range(rows):
        for col in range(cols):
            number = start + row * cols + col
            isolated = slicer._expanded_cell(sheet, col, row, cols, rows)
            solid_bbox = isolated.getchannel("A").point(lambda value: 255 if value >= 72 else 0).getbbox()
            assert solid_bbox, f"c{number:03d}: expanded source extraction is empty"
            left, top, right, bottom = solid_bbox
            margins = (left, top, isolated.width - right, isolated.height - bottom)
            assert min(margins) >= 1, f"c{number:03d}: subject still touches expanded crop {margins}"

            x0, y0, x1, y1 = slicer._cell_bounds(sheet, col, row, cols, rows)
            pad_x = round((x1 - x0) * 0.22)
            pad_y = round((y1 - y0) * 0.22)
            core_left = x0 - max(0, x0 - pad_x)
            core_top = y0 - max(0, y0 - pad_y)
            core_right = x1 - max(0, x0 - pad_x)
            core_bottom = y1 - max(0, y0 - pad_y)
            edges = set()
            if left < core_left:
                edges.add("left")
            if top < core_top:
                edges.add("top")
            if right > core_right:
                edges.add("right")
            if bottom > core_bottom:
                edges.add("bottom")
            recovered[number] = edges

for number, edge in known_overhangs.items():
    assert edge in recovered[number], f"c{number:03d}: expected {edge} overhang was cut away"

print("Aetherfall battle avatars are complete and isolated: 101/101")
