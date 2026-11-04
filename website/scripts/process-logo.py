"""Process the Unique Care UK 3D logo: strip black background, export all brand assets."""
from pathlib import Path
from PIL import Image

src = Path(
    r"C:\Users\KayodeDaniel\.cursor\projects\c-development-hr-recruit\assets"
    r"\Unique_Care_UK_3D_Logo-4__1___3_-d756f668-1f40-4a2d-8825-a8d9b60454dd.png"
)

website_dir = Path(r"C:\development\hr-recruit\app\website\public")
portal_dir = Path(r"C:\development\hr-recruit\app\public")

dst_horizontal = website_dir / "images" / "logo-horizontal.png"
dst_mark = website_dir / "images" / "logo-mark.png"
dst_apple = website_dir / "apple-touch-icon.png"
dst_fav32 = website_dir / "images" / "favicon-32.png"
dst_portal = portal_dir / "logo.png"
dst_portal_white = portal_dir / "logo-white.png"
dst_portal_fav = portal_dir / "favicon.png"


def strip_black(img: Image.Image) -> Image.Image:
    img = img.convert("RGBA")
    pixels = img.load()
    w, h = img.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = pixels[x, y]
            # Near-black background → transparent (keep blue logo tones)
            if r < 28 and g < 28 and b < 28:
                pixels[x, y] = (r, g, b, 0)
            elif r < 48 and g < 48 and b < 48 and max(r, g, b) <= 52:
                # Soften edge of black field without eating navy bevels in the glyph
                if b <= max(r, g) + 12 and r < 40 and g < 40:
                    pixels[x, y] = (r, g, b, 0)
    bbox = img.getbbox()
    if bbox:
        img = img.crop(bbox)
    pad = 16
    canvas = Image.new("RGBA", (img.width + pad * 2, img.height + pad * 2), (0, 0, 0, 0))
    canvas.paste(img, (pad, pad), img)
    return canvas


raw = Image.open(src)
canvas = strip_black(raw)
canvas.save(dst_horizontal, "PNG", optimize=True)
print(f"horizontal {canvas.size} -> {dst_horizontal} ({dst_horizontal.stat().st_size} bytes)")

# Emblem is the left circular mark (~28% of width for this asset)
mark_w = max(1, int(canvas.width * 0.28))
mark = canvas.crop((0, 0, mark_w, canvas.height))
mb = mark.getbbox()
if mb:
    mark = mark.crop(mb)
side = max(mark.width, mark.height) + 24
sq = Image.new("RGBA", (side, side), (0, 0, 0, 0))
sq.paste(mark, ((side - mark.width) // 2, (side - mark.height) // 2), mark)
sq.save(dst_mark, "PNG", optimize=True)
print(f"mark {sq.size} -> {dst_mark}")

apple = sq.resize((180, 180), Image.Resampling.LANCZOS)
apple_bg = Image.new("RGBA", (180, 180), (255, 255, 255, 255))
apple_bg.paste(apple, (0, 0), apple)
apple_bg.convert("RGB").save(dst_apple, "PNG", optimize=True)

fav = sq.resize((32, 32), Image.Resampling.LANCZOS)
fav.save(dst_fav32, "PNG", optimize=True)

# Portal: same transparent horizontal for light UI and dark email/sidebar
canvas.save(dst_portal, "PNG", optimize=True)
canvas.save(dst_portal_white, "PNG", optimize=True)
sq.resize((64, 64), Image.Resampling.LANCZOS).save(dst_portal_fav, "PNG", optimize=True)
print(f"portal logo.png + logo-white.png + favicon.png")
print("done")
