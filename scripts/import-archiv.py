# Archív zo starého webu klubu (slavojboleraz.webnode.sk): história, sezóny mužov a mládeže, štatistiky strelcov,
# Slavoj Cup, spravodaje, štadión -> data/archiv.json (+ obrázky do media/archiv/, spracuje scripts/archiv-img.py)
#   python -I scripts/import-archiv.py
# Texty a tabuľky sa preberajú bez zmeny. Prázdne stránky (len nadpis) sa vynechajú.
import json, re, sys, time, urllib.request, urllib.parse
sys.stdout.reconfigure(encoding="utf-8", line_buffering=True)
from pathlib import Path
from lxml import html as H

ROOT = Path(__file__).resolve().parent.parent
BASE = 'https://slavojboleraz.webnode.sk'
MEDIA = ROOT / 'media' / 'archiv'; MEDIA.mkdir(parents=True, exist_ok=True)
SECTIONS = ['/muzi/', '/dorast-a/', '/kniha-navstev/mladsi-dorast/', '/dorast-b/', '/ziaci2/', '/kniha-navstev/pripravka/', '/statistiky/', '/stadion/', '/spravodaje/']
SKIP_IMG = re.compile(r'baner|flashscore|274092098|logo', re.I)

def get(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (archiv klubu)'})
    for i in range(3):
        try:
            with urllib.request.urlopen(req, timeout=30) as r: return r.read().decode('utf-8', 'replace')
        except urllib.error.HTTPError as e:
            if e.code == 404: return ''                     # neexistuje: neskúšať znova
            time.sleep(2 * (i + 1))
        except Exception:
            time.sleep(2 * (i + 1))
    return ''

# zoznam stránok archívu = položky menu starého webu pod sekciami (nie ľubovoľné odkazy z obsahu)
def menu_paths():
    t = H.fromstring(get(BASE + '/'))
    out = []
    for a in t.xpath('//nav//a/@href|//*[contains(@class,"menu")]//a/@href'):
        p = urllib.parse.urlparse(urllib.parse.urljoin(BASE + '/', a)).path
        if p not in out and (any(p.startswith(s) for s in SECTIONS) or re.match(r'^/sezona-\d{4}-\d{4}\d?/$', p)): out.append(p)
    return out

def clean(s): return re.sub(r'\s+', ' ', s.replace('\xa0', ' ')).strip()

def content(t):
    for b in t.xpath('//script|//style|//nav|//header|//footer'): b.drop_tree()
    cands = t.xpath('//*[contains(concat(" ", normalize-space(@class), " "), " centered ")]')
    return max(cands, key=lambda e: len(e.text_content())) if cands else None

def table(el):
    rows = []
    for tr in el.xpath('.//tr'):
        cells = [clean(c.text_content()) for c in tr.xpath('./th|./td')]
        if any(cells): rows.append(cells)
    if not rows: return None
    width = max(len(r) for r in rows)
    rows = [r + [''] * (width - len(r)) for r in rows]
    # hlavička: prvý riadok bez čísel poradia alebo z <th>
    head_el = el.xpath('.//tr[1]/th')
    first = rows[0]
    is_head = bool(head_el) or (not re.match(r'^\d+\.?$', first[0] or '') and sum(bool(re.search(r'\d', c)) for c in first) <= max(1, width // 3))
    return {'type': 'table', 'head': first if is_head else None, 'rows': rows[1:] if is_head else rows}

def blocks(root, page_url):
    out = []
    def walk(el):
        tag = el.tag if isinstance(el.tag, str) else ''
        if tag == 'table':
            tb = table(el)
            if tb: out.append(tb)
            return
        if tag in ('h1', 'h2', 'h3', 'h4'):
            t = clean(el.text_content())
            if t: out.append({'type': 'h', 'text': t})
            return
        if tag == 'img':
            src = el.get('src') or ''
            if src and not SKIP_IMG.search(src): out.append({'type': 'img', 'src': urllib.parse.urljoin(page_url, src), 'alt': clean(el.get('alt') or '')})
            return
        if tag in ('p', 'li'):
            for img in el.xpath('.//img'): walk(img)
            t = clean(el.text_content())
            if t: out.append({'type': 'p', 'text': t})
            return
        for ch in el: walk(ch)
    walk(root)
    # omrvinky („Úvodná stránka > …“) a nadpis stránky preč, opakované odseky preč
    res, seen = [], set()
    for b in out:
        if b['type'] == 'p' and b['text'].startswith('Úvodná stránka'): continue
        key = json.dumps(b, ensure_ascii=False)
        if key in seen: continue
        seen.add(key); res.append(b)
    return res

pages = []
queue = list(dict.fromkeys(SECTIONS + menu_paths()))
print(f'stránok v archíve: {len(queue)}')
for path in queue:
    url = BASE + path
    raw = get(url)
    if not raw: print('nedostupné', path); continue
    t = H.fromstring(raw)
    title = clean(t.xpath('string(//title)')).replace(' :: TJ Slavoj Boleráz', '').replace('TJ Slavoj Boleráz', '').strip(' -:|') or path
    root = content(t)
    if root is None: continue
    bl = blocks(root, url)
    h = next((b['text'] for b in bl if b['type'] == 'h'), title)
    body = [b for b in bl if not (b['type'] == 'h' and b['text'] == h)]
    has = any(b['type'] in ('table', 'img') for b in body) or sum(len(b.get('text', '')) for b in body) > 40
    pages.append({'path': path, 'title': h, 'empty': not has, 'blocks': body})
    print(f"{'  ' if has else '– '}{path} {h} ({len(body)} blokov)")
    time.sleep(0.3)

# obrázky
for p in pages:
    for b in p['blocks']:
        if b['type'] != 'img': continue
        name = re.sub(r'[^a-z0-9]+', '-', urllib.parse.unquote(b['src'].rsplit('/', 1)[-1]).lower()).strip('-')
        name = re.sub(r'-(jpe?g|png|gif)$', '', name)
        f = MEDIA / f'{name}.jpg'
        if not f.exists():
            req = urllib.request.Request(urllib.parse.quote(b['src'], safe=':/?=&%'), headers={'User-Agent': 'Mozilla/5.0'})
            try:
                with urllib.request.urlopen(req, timeout=30) as r: f.write_bytes(r.read())
            except Exception as e:
                print('obrázok nedostupný', b['src'], e); continue
        b['file'] = f.stem

(ROOT / 'data' / 'archiv.json').write_text(json.dumps({'source': BASE, 'fetched': time.strftime('%Y-%m-%d'), 'pages': pages}, ensure_ascii=False, indent=1), encoding='utf-8')
print(f"stránok {len(pages)}, s obsahom {sum(not p['empty'] for p in pages)}, obrázkov {sum(1 for p in pages for b in p['blocks'] if b.get('file'))}")
