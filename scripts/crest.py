# Priehľadné erby na tmavé zápasové karty: biele pozadie okolo erbu (zaliate od rohov) sa zmení na priehľadné,
# vnútro erbu ostane. Náš erb -> src/img/erb-t-<w>.webp, erby súperov -> prepíše src/img/kluby/*.webp (len keď majú biele rohy).
#   python -I scripts/crest.py
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
IMG = ROOT / 'src' / 'img'

def transparent(im, thresh=48):
    im = im.convert('RGBA')
    w, h = im.size
    rgb = im.convert('RGB')
    corners = [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)]
    if not any(min(rgb.getpixel(c)) > 225 for c in corners):
        return im, False                                   # rohy nie sú biele: erb už je na vlastnom pozadí
    work = rgb.copy()
    for c in corners:
        if min(work.getpixel(c)) > 225:
            ImageDraw.floodfill(work, c, (255, 0, 255), thresh=thresh)
    mask = Image.new('L', (w, h), 255)
    mp, wp = mask.load(), work.load()
    for y in range(h):
        for x in range(w):
            if wp[x, y] == (255, 0, 255): mp[x, y] = 0
    mask = mask.filter(ImageFilter.GaussianBlur(0.6))      # mäkší okraj bez bielej obruby
    alpha = Image.composite(im.getchannel('A'), Image.new('L', (w, h), 0), mask)
    im.putalpha(alpha)
    return im, True

# náš erb (zo zdroja vo väčšom rozlíšení)
src = Image.open(IMG / 'erb-480.webp')
big = src.resize((src.width * 2, src.height * 2), Image.LANCZOS)
crest, _ = transparent(big)
for w in (96, 192, 400):
    c = crest.copy(); c.thumbnail((w, w * 2), Image.LANCZOS)
    c.save(IMG / f'erb-t-{w}.webp', 'WEBP', quality=90, method=6)

done = 0
for f in sorted((IMG / 'kluby').glob('*.webp')):
    im, changed = transparent(Image.open(f))
    if changed:
        im.save(f, 'WEBP', quality=88, method=6); done += 1
print(f'náš erb priehľadný, erby súperov upravené: {done}')
