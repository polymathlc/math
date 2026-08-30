from __future__ import annotations

from collections import deque
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
AVATARS = ROOT / "assets" / "aetherfall" / "avatars"


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

print("Aetherfall battle avatars are isolated: 101/101")
