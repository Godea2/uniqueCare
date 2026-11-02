from pathlib import Path
from PIL import Image

src = Path(
    r"C:\Users\KayodeDaniel\.cursor\projects\c-development-hr-recruit\assets"
    r"\Unique_care_horinzontal_logo-01__1_-ddd3b70b-733f-4e85-8d21-6440e1593074.png"
)
dst = Path(r"C:\development\hr-recruit\app\website\public\images\logo-horizontal.png")
icon_dst = Path(r"C:\development\hr-recruit\app\website\public\images\logo-mark.png")
apple = Path(r"C:\development\hr-recruit\app\website\public\apple-touch-icon.png")
favicon_png = Path(r"C:\development\hr-recruit\app\website\public\images\favicon-32.png")

img = Image.open(src).convert("RGBA")
pixels = img.load()
w, h = img.size

for y in range(h):
    for x in range(w):
        r, g, b, a = pixels[x, y]
        if r < 28 and g < 28 and b < 28:
            pixels[x, y] = (r, g, b, 0)
        elif r < 45 and g < 45 and b < 45 and b <= max(r, g) + 8:
            pixels[x, y] = (r, g, b, 0)

bbox = img.getbbox()
if bbox:
    img = img.crop(bbox)

pad = 12
canvas = Image.new("RGBA", (img.width + pad * 2, img.height + pad * 2), (0, 0, 0, 0))
canvas.paste(img, (pad, pad), img)
canvas.save(dst, "PNG", optimize=True)
print(f"saved horizontal {canvas.size} -> {dst} ({dst.stat().st_size} bytes)")

mark_w = max(1, int(canvas.width * 0.30))
mark = canvas.crop((0, 0, mark_w, canvas.height))
side = max(mark.width, mark.height)
sq = Image.new("RGBA", (side, side), (0, 0, 0, 0))
sq.paste(mark, ((side - mark.width) // 2, (side - mark.height) // 2), mark)
sq.save(icon_dst, "PNG", optimize=True)

apple_img = sq.resize((180, 180), Image.Resampling.LANCZOS)
bg = Image.new("RGBA", (180, 180), (255, 255, 255, 255))
bg.paste(apple_img, (0, 0), apple_img)
bg.convert("RGB").save(apple, "PNG", optimize=True)

fav = sq.resize((32, 32), Image.Resampling.LANCZOS)
fav.save(favicon_png, "PNG", optimize=True)
print(f"saved mark {sq.size}, apple-touch, favicon-32")
