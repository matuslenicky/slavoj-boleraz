# Fotky z Instagramu klubu -> src/img/foto (webp) + data/foto-out.json (rozmery, popisy pre build.js)
#   python -I scripts/photos.py          (spracuje len chýbajúce súbory; FORCE=1 všetko znova)
# Vstup: data/foto.json (výber), media/ig-posts.json (popisy príspevkov), media/ig/<kód>/<n>.jpg (scripts/ig-download.mjs)
import json, os, re
from pathlib import Path
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parent.parent
cfg = json.loads((ROOT / 'data' / 'foto.json').read_text(encoding='utf8'))
posts = json.loads((ROOT / 'media' / 'ig-posts.json').read_text(encoding='utf8'))
if isinstance(posts, str): posts = json.loads(posts)
byCode = {p['code']: p for p in posts}
IG = ROOT / 'media' / 'ig'
OUT = ROOT / 'src' / 'img' / 'foto'; OUT.mkdir(parents=True, exist_ok=True)
FORCE = bool(os.environ.get('FORCE'))

def load(src):
    code, n = src.rsplit('/', 1)
    return ImageOps.exif_transpose(Image.open(IG / code.replace('reel/', 'reel-') / f'{n}.jpg')).convert('RGB')

def save(im, name, q=80):
    f = OUT / f'{name}.webp'
    if FORCE or not f.exists(): im.save(f, 'WEBP', quality=q, method=6)
    return f.name

def widths(im, name, ws, q=80):
    out = []
    for w in ws:
        if w > im.width and out: break
        c = im.copy(); c.thumbnail((w, 100000), Image.LANCZOS)
        save(c, f'{name}-{c.width}', q); out.append(c.width)
    return out

def crop(im, ratio, fx=0.5, fy=0.5):
    """výrez s pomerom strán ratio (šírka/výška) okolo ťažiska fx, fy"""
    W, H = im.size
    if W / H > ratio: w, h = round(H * ratio), H
    else: w, h = W, round(W / ratio)
    x = min(max(round(fx * W - w / 2), 0), W - w); y = min(max(round(fy * H - h / 2), 0), H - h)
    return im.crop((x, y, x + w, y + h))

def caption(code):
    p = byCode.get(code, {})
    m = re.search(r':\s*"(.*)"\.\s*$', p.get('og', ''), re.S)
    text = m.group(1) if m else ''
    lines = [l for l in text.strip().split('\n') if not (l.strip() and all(t.startswith('#') for t in l.split()))]  # riadky len s hashtagmi preč
    text = re.sub(r'\n{3,}', '\n\n', '\n'.join(lines)).strip()
    likes = (re.match(r'([\d,.K]+) likes', p.get('og', '')) or [None, ''])[1]
    return text, p.get('time', ''), likes

res = {'albums': [], 'named': {}, 'cards': [], 'posts': [], 'reels': []}
for a in cfg['albums']:
    files = []
    for n in a['files']:
        im = load(f"{a['src']}/{n}")
        name = f"{a['slug']}-{n}"
        ws = widths(im, name, [480, 1280])
        files.append({'name': name, 'widths': ws, 'w': im.width, 'h': im.height})
    res['albums'].append({**{k: v for k, v in a.items() if k != 'files'}, 'files': files})

for key, n in cfg['named'].items():
    im = load(n['src'])
    wide = crop(im, 16 / 9, n.get('fx', .5), n.get('fy', .5))
    ws = widths(wide, key, [640, 1280, 1920], 78)
    tall = crop(im, 4 / 5, n.get('fx', .5), n.get('fy', .5))
    wt = widths(tall, f'{key}-p', [480, 960], 78)
    res['named'][key] = {'alt': n['alt'], 'widths': ws, 'pwidths': wt}

for i, c in enumerate(cfg['cards']):
    im = crop(load(c['src']), 4 / 5, c.get('fx', .5), c.get('fy', .5))
    res['cards'].append({'name': f'karta-{i + 1}', 'widths': widths(im, f'karta-{i + 1}', [480, 640, 960], 76)})

for code in cfg['posts']:
    im = crop(load(f'{code}/1'), 4 / 5, .5, .5)
    text, time, likes = caption(code)
    res['posts'].append({'code': code, 'url': f'https://www.instagram.com/slavojboleraz/p/{code}/', 'text': text, 'time': time, 'likes': likes, 'widths': widths(im, f'ig-{code}', [480], 78)})

for code in cfg['reels']:
    im = load(f'{code}/1')
    text, time, likes = caption(code)
    slug = code.replace('reel/', '')
    res['reels'].append({'code': slug, 'url': f'https://www.instagram.com/slavojboleraz/reel/{slug}/', 'text': text, 'time': time, 'likes': likes, 'w': im.width, 'h': im.height, 'name': save(im, f'reel-{slug}', 78)})

(ROOT / 'data' / 'foto-out.json').write_text(json.dumps(res, ensure_ascii=False, indent=1), encoding='utf8')
total = sum(f.stat().st_size for f in OUT.glob('*.webp'))
print(f"fotky: {len(list(OUT.glob('*.webp')))} súborov, {total // 1024} KB")
