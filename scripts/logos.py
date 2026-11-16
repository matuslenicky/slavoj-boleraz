# Erby klubov zo Sportnetu -> src/img/kluby/<appSpace>.webp (96 px, pre 2x obrazovky) a erb nášho klubu vo viacerých veľkostiach.
#   python -I scripts/logos.py            (zoznam klubov berie z data/sportnet.json, stiahne len chýbajúce)
#   FORCE=1 python -I scripts/logos.py    (stiahne znova všetky)
# Erb, ktorý sa nedá stiahnuť, web nahradí iniciálami klubu.
import io, json, os, sys, urllib.request
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
data = json.loads((ROOT / 'data' / 'sportnet.json').read_text(encoding='utf8'))
cfg = json.loads((ROOT / 'config.json').read_text(encoding='utf8'))
out = ROOT / 'src' / 'img' / 'kluby'; out.mkdir(parents=True, exist_ok=True)
force = bool(os.environ.get('FORCE'))
own = cfg['sportnet']['appSpace']

def fetch(space):
    req = urllib.request.Request(f'https://api.sportnet.online/data/ppo/{space}/logo', headers={'User-Agent': 'mfk-web-build'})
    with urllib.request.urlopen(req, timeout=30) as r:
        return Image.open(io.BytesIO(r.read()))

def trim(im):
    """odreže jednofarebný biely okraj okolo erbu (časté pri JPEG), aby erby mali rovnakú vizuálnu veľkosť"""
    rgb = im.convert('RGB')
    bg = Image.new('RGB', rgb.size, (255, 255, 255))
    from PIL import ImageChops
    diff = ImageChops.difference(rgb, bg).convert('L').point(lambda v: 255 if v > 18 else 0)
    box = diff.getbbox()
    return im.crop(box) if box else im

def square(im, size):
    im = trim(im.convert('RGBA'))
    im.thumbnail((size, size), Image.LANCZOS)
    canvas = Image.new('RGBA', (size, size), (255, 255, 255, 0))
    canvas.paste(im, ((size - im.width) // 2, (size - im.height) // 2), im)
    return canvas

ok = miss = 0
missing = []
for space in data['clubs']:
    dst = out / f'{space}.webp'
    if dst.exists() and not force:
        ok += 1; continue
    try:
        im = fetch(space)
        square(im, 96).save(dst, 'WEBP', quality=86, method=6)
        ok += 1
    except Exception as e:
        miss += 1; missing.append(space)
        if dst.exists(): dst.unlink()
print(f'erby: {ok} uložených, {miss} chýba', ', '.join(missing))

# náš erb: hlavička, úvod, favicon (bez orezania, erb má vlastný žltý rám); stiahne sa len raz alebo s FORCE=1
img = ROOT / 'src' / 'img'
if (img / 'erb-480.webp').exists() and not force:
    sys.exit(0)
crest = fetch(own).convert('RGB')
for w in (64, 128, 240, 480):
    c = crest.copy(); c.thumbnail((w, 10_000), Image.LANCZOS)
    c.save(img / f'erb-{w}.webp', 'WEBP', quality=88, method=6)
fav = crest.copy(); fav.thumbnail((180, 180), Image.LANCZOS)
sq = Image.new('RGB', (180, 180), (246, 196, 0)); sq.paste(fav, ((180 - fav.width) // 2, (180 - fav.height) // 2))
sq.save(img / 'apple-touch-icon.png', optimize=True)
f32 = crest.copy(); f32.thumbnail((48, 48), Image.LANCZOS)
sq = Image.new('RGBA', (48, 48), (0, 0, 0, 0)); sq.paste(f32, ((48 - f32.width) // 2, (48 - f32.height) // 2))
sq.save(img / 'favicon.png', optimize=True)
print('náš erb: erb-64/128/240/480.webp, favicon.png, apple-touch-icon.png', crest.size)
