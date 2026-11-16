# TJ Slavoj Boleráz – návrh webu

Návrh webu futbalového klubu TJ Slavoj Boleráz. **Nie je to oficiálna stránka klubu.** Ukážka má hore pás s týmto upozornením a vyhľadávače ju neindexujú (`noindex`).

Ukážka: https://matuslenicky.github.io/slavoj-boleraz/ · administrácia (ukážka bez ukladania): https://matuslenicky.github.io/slavoj-boleraz/admin/

Vzhľad vychádza z Instagramu klubu [@slavojboleraz](https://www.instagram.com/slavojboleraz/): web sám skladá zápasové karty FULLTIME / MATCH DAY z výsledkov na Sportnete.

## Obsah a zdroje

- Zápasy, výsledky, strelci, karty, zostavy dospelých, tabuľky a súpisky zo Sportnetu (`scripts/sportnet.mjs` → `data/sportnet.json`). Vek hráčov sa neukladá, zostavy len pri dospelých.
- `data/klub.json`: kontakty zo starého webu slavojboleraz.webnode.sk, IČO a účet zo Sportnetu, vedenie klubu a história z webu obce Boleráz a starého webu.
- Fotky a texty príspevkov z Instagramu klubu (`media/ig-posts.json` zbiera prehliadač bez prihlásenia, `scripts/ig-download.mjs` stiahne fotky do `media/`, `scripts/photos.py` ich spracuje do `src/img/foto` a `data/foto-out.json`; výber v `data/foto.json`). Album z osemfinále Slovnaft Cupu: foto @world._.through._.lenses.
- Erby klubov zo Sportnetu (`scripts/logos.py`, priehľadné pozadie `scripts/crest.py`).
- Písmo Sofia Sans a Sofia Sans Extra Condensed, licencia SIL Open Font License 1.1.

## Zostavenie

```
node scripts/sportnet.mjs              # zápasy, tabuľky, súpisky
python -I scripts/logos.py && python -I scripts/crest.py
python -I scripts/photos.py            # fotky z Instagramu (media/ig) -> src/img/foto
node build.js                          # -> dist/ (TODAY=2026-11-16 prepíše dnešný dátum)
node scripts/serve.mjs dist 5280       # náhľad
node scripts/deploy.mjs                # nasadenie na gh-pages
```

Výsledky sa po zápasoch aktualizujú samé cez GitHub Actions (`.github/workflows/sportnet.yml`).
