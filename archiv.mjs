// Archív zo starého webu (data/archiv.json zo scripts/import-archiv.py): zoradenie podľa sezón a vykreslenie.
// Stránky sezón na starom webe sú pomiešané (konečné tabuľky iných rokov skopírované na viac stránok), preto:
//  - konečné tabuľky mužov sa priraďujú podľa sezóny v nadpise tabuľky (nie podľa stránky),
//  - ostatný obsah (strelci, karty, výsledky, zápisy kôl) sa ukáže pri sezóne, len ak je na jedinej stránke;
//    obsah skopírovaný na viac stránok sa vynechá, aby sa nepriradil k zlej sezóne.

const seasonKey = (y1, y2) => `${y1}-${String(y2).length === 4 ? y2 : String(y1).slice(0, 2) + y2}`;
const pageSeason = (path) => {
  if (/sezona-1957/.test(path)) return '1957-1958';
  if (/sezona-2008-2009\d?\//.test(path)) return '2008-2009';
  if (/sezona-2011-1012/.test(path)) return '2011-2012';
  const m = /sezona-(\d{4})-(\d{4})/.exec(path);
  return m ? seasonKey(m[1], m[2]) : null;
};
const SECTION_OF = (path) => {
  if (path === '/sezona-2008-2009/' || path.startsWith('/dorast-a/')) return 'dorast-a';
  if (path === '/sezona-2008-20093/' || path.startsWith('/dorast-b/')) return 'dorast-b';
  if (path === '/sezona-2008-20094/' || path.startsWith('/ziaci2/')) return 'ziaci';
  if (path.startsWith('/kniha-navstev/mladsi-dorast/')) return 'mladsi-dorast';
  if (path.startsWith('/kniha-navstev/pripravka/slavoj-cup')) return 'cup';
  if (path.startsWith('/kniha-navstev/pripravka/')) return 'pripravka';
  if (path.startsWith('/muzi/') || /^\/sezona-(19|2008-20092)/.test(path)) return 'muzi';
  return path.replace(/\//g, '');
};
export const YOUTH = { 'dorast-a': 'Dorast A', 'dorast-b': 'Dorast B', 'mladsi-dorast': 'Mladší dorast', ziaci: 'Žiaci', pripravka: 'Prípravka' };
const hash = (b) => JSON.stringify(b);
const seasonLabel = (k) => k.replace('-', '/');
const captionOf = (b) => (b.type === 'table' && b.head && b.head.filter(Boolean).length === 1 && b.head[0] ? b.head[0] : '');
const captionSeason = (c) => { const m = /(\d{4})\s*[-/]\s*(\d{2,4})/.exec(c); return m ? seasonKey(m[1], m[2]) : null; };
const numbered = (b) => b.rows.filter((r) => /^\d+\.?(\s|$)/.test(r[0] || '')).length;

export function organize(archiv) {
  const pages = archiv.pages.map((p) => ({ ...p, section: SECTION_OF(p.path), season: pageSeason(p.path) }));
  const by = (path) => pages.find((p) => p.path === path);

  // umiestnenia mužov
  const pl = by('/muzi/')?.blocks.find((b) => b.type === 'table');
  const placements = (pl?.rows || []).map(([s, league, place]) => {
    const m = /(\d{4})\/(\d{4})/.exec(s);
    return { key: m ? `${m[1]}-${m[2]}` : s, label: s, league, place: place.replace(/(\d+)\.\s*miesto/, '$1. miesto'), first: /^1\.\s*miesto/.test(place) };
  });

  // muži: konečné tabuľky podľa sezóny v nadpise, z rovnakých verzií tá s najviac riadkami poradia
  const men = pages.filter((p) => p.section === 'muzi' && p.season);
  const count = new Map();
  for (const p of men) for (const h of new Set(p.blocks.map(hash))) count.set(h, (count.get(h) || 0) + 1);

  // tabuľka so zlým rokom v nadpise (na starom webe je tabuľka 2017/18 nadpísaná „2016-2017“): patrí k sezóne svojej stránky,
  // ak je len na tej stránke, sezóna stránky nemá inú konečnú tabuľku a Boleráz je v nej na mieste z prehľadu umiestnení
  // (a nie na mieste zo sezóny v nadpise)
  const placeOf = Object.fromEntries(placements.map((p) => [p.key, parseInt(p.place, 10)]));
  const ourPos = (b) => parseInt(b.rows.find((r) => /boler[aá]z/i.test(r.join(' ')))?.[0] ?? '', 10);
  const captioned = new Set(men.flatMap((p) => p.blocks.map(captionOf).filter((c) => /KONEČNÁ TABUĽKA/i.test(c)).map(captionSeason)));
  const misdated = new Map(); // hash -> { season, b, caption }
  for (const p of men) {
    if (captioned.has(p.season)) continue;
    for (const b of p.blocks) {
      const c = captionOf(b), k = captionSeason(c);
      if (!/KONEČNÁ TABUĽKA/i.test(c) || !k || k === p.season || count.get(hash(b)) !== 1) continue;
      const pos = ourPos(b);
      if (pos && pos === placeOf[p.season] && pos !== placeOf[k]) misdated.set(hash(b), { season: p.season, b, caption: c });
    }
  }

  const finals = new Map();
  for (const p of men) for (const b of p.blocks) {
    const c = captionOf(b); if (!/KONEČNÁ TABUĽKA/i.test(c) || misdated.has(hash(b))) continue;
    const k = captionSeason(c); if (!k) continue;
    const prev = finals.get(c), own = !!prev?.own || p.season === k; // own = tabuľka je aj na stránke svojej sezóny
    if (!prev || numbered(b) > numbered(prev.b)) finals.set(c, { k, b, own }); else prev.own = own;
  }
  const seasons = new Map();
  const get = (k) => { if (!seasons.has(k)) seasons.set(k, { key: k, label: seasonLabel(k), finals: [], blocks: [] }); return seasons.get(k); };
  // rovnaká tabuľka pod dvoma nadpismi (1977/78: „skupina B“ aj „Západ“) len raz, s nadpisom zo stránky svojej sezóny
  for (const [c, { k, b, own }] of finals) {
    const s = get(k), same = s.finals.find((f) => hash(f.rows) === hash(b.rows));
    if (!same) s.finals.push({ caption: c, own, ...b });
    else if (own && !same.own) Object.assign(same, { caption: c, own, ...b });
  }
  for (const { season, b, caption } of misdated.values()) {
    const fixed = caption.replace(/(\d{4})\s*[-/]\s*(\d{2,4})/, season);
    get(season).finals.push({ ...b, caption: fixed, own: true, head: b.head.map((x, i) => (i === 0 ? fixed : x)),
      note: `Na starom webe je táto tabuľka nadpísaná „${caption.trim()}“. Boleráz je v nej ${ourPos(b)}., čo zodpovedá umiestneniu v sezóne ${seasonLabel(season)}.` });
  }
  for (const p of men) {
    // odseky (zápisy kôl) sa medzi stránkami neopakujú; kopírované sú len tabuľky → jedinečnosť sa vyžaduje len pri tabuľkách
    let own = p.blocks.filter((b) => !(b.type === 'h' && /^sezóna/i.test(b.text)) && !/KONEČNÁ TABUĽKA/i.test(captionOf(b)) && (b.type !== 'table' || count.get(hash(b)) === 1));
    // nadpis zoznamu („Listina strelcov“) bez tabuľky za ním preč
    own = own.filter((b, i) => !(b.type === 'p' && LABELS.test(b.text) && own[i + 1]?.type !== 'table'));
    if (own.some((b) => b.type !== 'p' || b.text.length > 3)) get(p.season).blocks.push(...own);
  }
  for (const s of seasons.values()) s.finals.sort((a, b) => a.caption.localeCompare(b.caption));
  const place = Object.fromEntries(placements.map((p) => [p.key, p]));
  const menSeasons = [...seasons.values()].filter((s) => s.finals.length || s.blocks.length).map((s) => ({ ...s, place: place[s.key] })).sort((a, b) => b.key.localeCompare(a.key));

  // mládež: stránky sezón ukážu svoj obsah (tieto stránky nie sú pomiešané)
  const youth = Object.keys(YOUTH).map((sec) => {
    const main = pages.find((p) => p.section === sec && !p.season);
    const list = pages.filter((p) => p.section === sec && p.season && !p.empty).map((p) => ({ key: p.season, label: seasonLabel(p.season), title: p.title, blocks: p.blocks.filter((b) => !(b.type === 'h' && /^sezóna/i.test(b.text))) })).sort((a, b) => b.key.localeCompare(a.key));
    return { slug: sec, name: YOUTH[sec], intro: main && !main.empty ? main.blocks : [], seasons: list };
  }).filter((y) => y.intro.length || y.seasons.length);

  const cups = pages.filter((p) => p.section === 'cup' && !p.empty).map((p) => {
    const year = (/(20\d\d)/.exec(p.title) || [])[1];
    return { year, title: `Slavoj Cup ${year}`, blocks: p.blocks.filter((b) => !(b.type === 'h' && /slavoj cup/i.test(b.text))) };
  }).sort((a, b) => b.year.localeCompare(a.year));

  // večná štatistika strelcov
  const st = by('/statistiky/')?.blocks.find((b) => b.type === 'table');
  const stats = st ? st.rows.filter((r) => /^\d+$/.test(r[0])).map((r) => ({ n: Number(r[0]), name: r[1], goals: Number(r[2]) || 0, goalsA: Number(r[3]) || 0, goalsB: Number(r[4]) || 0, apps: Number(r[5]) || 0, appsA: Number(r[6]) || 0, appsB: Number(r[7]) || 0, firstApp: r[9] || '', firstGoal: r[10] || '' })) : [];

  const bulletins = (by('/spravodaje/')?.blocks || []).filter((b) => b.type === 'img' && b.file).map((b) => ({ file: b.file, title: decodeURIComponent(b.src.split('/').pop()).replace(/\.(jpe?g|png)$/i, '') }));
  return { placements, menSeasons, youth, cups, stats, bulletins, source: archiv.source, fetched: archiv.fetched };
}

// ---- vykreslenie blokov -------------------------------------------------------------------------------
const LABELS = /^(listina strelcov|strelecká listina|žlté karty|červené karty|výsledky|tabuľka)$/i;
const KOLO = /^\d+\.\s*kolo\b/i;
const KEY = /^(góly?|žk|čk|zostav[ay]|poznámk[ay])\s*:*$/i; // popisky riadkov zápisu kola
const amLine = (esc, k, v) => `<p class="am-l"><b>${esc(k.toLowerCase())}</b><span>${esc(v)}</span></p>`;
// h = úroveň nadpisov sekcií (2 na stránke sezóny, 3 pod nadpisom h2); zápisy kôl o úroveň nižšie, ak nad nimi je nadpis sekcie
let seq = 0; // id nadpisov, na ktoré sa odkazuje tabuľka bez popisu (aria-labelledby)
export function renderBlocks(blocks, { esc, R, img, h = 2 }) {
  const out = [];
  let match = null, sub = false, last = null;
  const close = () => { if (match) { out.push(`<article class="arch-match">${match.join('')}</article>`); match = null; } };
  const heading = (t) => { sub = true; last = `ah${++seq}`; return `<h${h} class="arch-sub" id="${last}">${esc(t)}</h${h}>`; };
  for (const b of blocks) {
    const label = last; last = null; // nadpis tesne pred tabuľkou
    if (b.type === 'table') { close(); const t = renderTable(b, { esc, h, sub, label }); if (t.startsWith('<h')) sub = true; out.push(t); if (b.note) out.push(`<p class="note">${esc(b.note)}</p>`); continue; }
    if (b.type === 'p' && KOLO.test(b.text)) { close(); const l = h + (sub ? 1 : 0); match = [`<h${l} class="am-h">${esc(b.text.replace(/:$/, ''))}</h${l}>`]; continue; }
    if (b.type === 'p' && match) {
      const m = /^(\S+)\s*:+\s*(.*)$/.exec(b.text);
      if (m && KEY.test(m[1])) { match.push(amLine(esc, m[1], m[2])); continue; }
      if (/\d+\s*:\s*\d+/.test(b.text) && match.length === 1) { match.push(`<p class="am-score">${esc(b.text)}</p>`); continue; }
    }
    close();
    if (b.type === 'p' && LABELS.test(b.text)) { out.push(heading(b.text)); continue; }
    if (b.type === 'p') { out.push(`<p>${esc(b.text)}</p>`); continue; }
    if (b.type === 'h') { out.push(heading(b.text)); continue; }
    if (b.type === 'img' && b.file) { out.push(img(b.file, b.alt)); continue; }
  }
  close();
  return out.join('\n');
}

// tabuľka „VÝSLEDKY“ (kolo | výsledok, góly: | …, zostava: | …) -> karty zápasov ako pri zápisoch v odsekoch
function roundCards(cap, rows, { esc, h, sub }) {
  const out = [];
  let m = null, l = h + (sub ? 1 : 0);
  if (cap) { out.push(`<h${h} class="arch-sub">${esc(cap)}</h${h}>`); l = h + 1; }
  const close = () => { if (m) { out.push(`<article class="arch-match">${m.join('')}</article>`); m = null; } };
  for (const [k = '', v = ''] of rows) {
    if (KOLO.test(k)) { close(); m = [`<h${l} class="am-h">${esc(k.replace(/[\s:]+$/, ''))}</h${l}>`]; if (v) m.push(`<p class="am-score">${esc(v)}</p>`); continue; }
    const key = k.trim().replace(/\s+/g, ' ');
    const text = [k, v].filter(Boolean).join(' ');
    if (!m) { out.push(`<p>${esc(text)}</p>`); continue; }
    m.push(KEY.test(key) ? amLine(esc, key.replace(/:+$/, ''), v) : `<p class="am-l am-l--t">${esc(text)}</p>`);
  }
  close();
  return out.join('\n');
}

// konečné tabuľky: stĺpce ako v aktuálnej tabuľke súťaže (V, R, P a +/− sa na telefóne skryjú)
const COL = {
  '': ['<span class="sr">Poradie</span>', '', 'pos'], Tím: ['Tím', 'tl', 'tl'], Z: ['<abbr title="Zápasy">Z</abbr>', '', ''],
  V: ['<abbr title="Výhry">V</abbr>', 'hm', 'hm'], R: ['<abbr title="Remízy">R</abbr>', 'hm', 'hm'], P: ['<abbr title="Prehry">P</abbr>', 'hm', 'hm'],
  Skóre: ['Skóre', '', 'nw'], B: ['<abbr title="Body">B</abbr>', '', 'pts'], '+/−': ['<abbr title="Tabuľka pravdy">+/−</abbr>', 'hm', 'hm'],
};
const cls = (c) => (c ? ` class="${c}"` : '');

export function renderTable(b, { esc, caption = null, h = 2, sub = false, label = null }) {
  let head = b.head, rows = b.rows.map((r) => [...r]);
  const cap = caption ?? (head && head.filter(Boolean).length === 1 && head[0] && !/^\d/.test(head[0]) ? head[0] : '');
  // „25. gólov | Daniš Marek“ = prvý riadok zoznamu, nie hlavička
  if (head && (cap || /^\d+\.?\s*(gól|žk|čk|ck)/i.test(head[0] || '') || /^\d+\.?$/.test(head[0] || ''))) { if (!cap) rows.unshift(head); head = null; }
  rows = rows.filter((r) => r.some(Boolean));
  if (!rows.length) return '';
  const width = Math.max(...rows.map((r) => r.length));
  const empty = [...Array(width).keys()].filter((i) => rows.every((r) => !r[i]) && !(head && head[i]));
  const keep = (r) => r.filter((_, i) => !empty.includes(i));
  rows = rows.map(keep); if (head) head = keep(head);
  const w = rows[0].length;
  if (w === 2 && !head && rows.some((r) => KOLO.test(r[0] || ''))) return roundCards(cap, rows, { esc, h, sub });
  const isFinal = /tabuľka/i.test(cap) || (w >= 7 && rows.filter((r) => /\d+:\d+/.test(r.join(' '))).length > rows.length / 2);
  let auto = false;
  if (!head && isFinal) {
    auto = true;
    if (w === 9) head = ['', 'Tím', 'Z', 'V', 'R', 'P', 'Skóre', 'B', '+/−'];
    else if (w === 8 && /^\d+\.\s+\D/.test(rows[0][0])) head = ['Tím', 'Z', 'V', 'R', 'P', 'Skóre', 'B', '+/−'];
    else if (w === 8) head = ['', 'Tím', 'Z', 'V', 'R', 'P', 'Skóre', 'B'];
    else if (w === 7 && /^\d+\.\s+\D/.test(rows[0][0])) head = ['Tím', 'Z', 'V', 'R', 'P', 'Skóre', 'B'];
    else auto = false;
  }
  const our = (r) => /boler[aá]z/i.test(r.join(' '));
  const thead = !head || !head.some(Boolean) ? ''
    : `<thead><tr>${head.map((x) => (auto ? `<th scope="col"${cls(COL[x][1])}>${COL[x][0]}</th>` : `<th scope="col">${esc(x)}</th>`)).join('')}</tr></thead>`;
  // zoznamy (strelci, karty): krátky prvý stĺpec („25. gólov“) v jednom riadku, dlhý text sa zalomí
  const key = !isFinal && w > 1 && rows.every((r) => (r[0] || '').length <= 16);
  const cell = (c, i) => {
    if (auto) { const k = COL[head[i]]?.[2] || ''; return k === 'tl' ? `<th scope="row" class="tl">${esc(c)}</th>` : `<td${cls(k)}>${esc(c)}</td>`; }
    return `<td${cls(isFinal && i === (head?.[0] === '' ? 1 : 0) ? 'tl' : key && i === 0 ? 'k' : '')}>${esc(c)}</td>`;
  };
  return `<div class="tbl-wrap arch-tbl"><table class="tbl${isFinal ? '' : ' tbl--list'}"${!cap && label ? ` aria-labelledby="${label}"` : ''}>${cap ? `<caption>${esc(cap)}</caption>` : isFinal && !label ? '<caption class="sr">Tabuľka súťaže</caption>' : ''}
${thead}
<tbody>${rows.map((r) => `<tr${isFinal && our(r) ? ' class="our"' : ''}>${r.map(cell).join('')}</tr>`).join('')}</tbody></table></div>`;
}
