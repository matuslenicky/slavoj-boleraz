# Obrázky archívu (media/archiv/*.jpg zo scripts/import-archiv.py) -> src/img/archiv/<názov>-<šírka>.webp + data/archiv-img.json
#   python -I scripts/archiv-img.py
import json
from pathlib import Path
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'media' / 'archiv'
OUT = ROOT / 'src' / 'img' / 'archiv'; OUT.mkdir(parents=True, exist_ok=True)
res = {}
for f in sorted(SRC.glob('*.jpg')):
    try:
        im = ImageOps.exif_transpose(Image.open(f)).convert('RGB')
    except Exception as e:
        print('nečitateľný', f.name, e); continue
    ws = []
    for w in (480, 1200):
        if ws and w > im.width: break
        c = im.copy(); c.thumbnail((w, 100000), Image.LANCZOS)
        c.save(OUT / f'{f.stem}-{c.width}.webp', 'WEBP', quality=80, method=6); ws.append(c.width)
    res[f.stem] = {'widths': ws, 'w': im.width, 'h': im.height}
(ROOT / 'data' / 'archiv-img.json').write_text(json.dumps(res, indent=1), encoding='utf-8')
print(f'obrázky archívu: {len(res)}')
