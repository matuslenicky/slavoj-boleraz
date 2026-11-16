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
  const finals = new Map();
  for (const p of men) for (const b of p.blocks) {
    const c = captionOf(b); if (!/KONEČNÁ TABUĽKA/i.test(c)) continue;
    const k = captionSeason(c); if (!k) continue;
    const prev = finals.get(c);
    if (!prev || numbered(b) > numbered(prev.b)) finals.set(c, { k, b });
  }
  const count = new Map();
  for (const p of men) for (const h of new Set(p.blocks.map(hash))) count.set(h, (count.get(h) || 0) + 1);
  const seasons = new Map();
  const get = (k) => { if (!seasons.has(k)) seasons.set(k, { key: k, label: seasonLabel(k), finals: [], blocks: [] }); return seasons.get(k); };
  for (const [c, { k, b }] of finals) get(k).finals.push({ caption: c, ...b });
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
export function renderBlocks(blocks, { esc, R, img }) {
  const out = [];
  let match = null;
  const close = () => { if (match) { out.push(`<article class="arch-match">${match.join('')}</article>`); match = null; } };
  for (const b of blocks) {
    if (b.type === 'p' && /^\d+\.\s*kolo\b/i.test(b.text)) { close(); match = [`<h4 class="am-h">${esc(b.text.replace(/:$/, ''))}</h4>`]; continue; }
    if (b.type === 'p' && match) {
      const m = /^(góly?|žk|čk|zostava|zostavy)\s*:\s*(.*)$/i.exec(b.text);
      if (m) { match.push(`<p class="am-l"><b>${esc(m[1].toLowerCase())}</b> ${esc(m[2])}</p>`); continue; }
      if (/\d+\s*:\s*\d+/.test(b.text) && match.length === 1) { match.push(`<p class="am-score">${esc(b.text)}</p>`); continue; }
    }
    close();
    if (b.type === 'p' && LABELS.test(b.text)) { out.push(`<h3 class="arch-sub">${esc(b.text)}</h3>`); continue; }
    if (b.type === 'p') { out.push(`<p>${esc(b.text)}</p>`); continue; }
    if (b.type === 'h') { out.push(`<h3 class="arch-sub">${esc(b.text)}</h3>`); continue; }
    if (b.type === 'table') { out.push(renderTable(b, { esc })); continue; }
    if (b.type === 'img' && b.file) { out.push(img(b.file, b.alt)); continue; }
  }
  close();
  return out.join('\n');
}

export function renderTable(b, { esc, caption = null }) {
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
  const isFinal = /tabuľka/i.test(cap) || (w >= 7 && rows.filter((r) => /\d+:\d+/.test(r.join(' '))).length > rows.length / 2);
  if (!head && isFinal) {
    if (w === 9) head = ['', 'Tím', 'Z', 'V', 'R', 'P', 'Skóre', 'B', '+/−'];
    else if (w === 8 && /^\d+\.\s+\D/.test(rows[0][0])) head = ['Tím', 'Z', 'V', 'R', 'P', 'Skóre', 'B', '+/−'];
    else if (w === 8) head = ['', 'Tím', 'Z', 'V', 'R', 'P', 'Skóre', 'B'];
  }
  const our = (r) => /boleráz/i.test(r.join(' '));
  return `<div class="tbl-wrap arch-tbl"><table class="tbl${isFinal ? '' : ' tbl--list'}">${cap ? `<caption>${esc(cap)}</caption>` : ''}
${head && head.some(Boolean) ? `<thead><tr>${head.map((h) => `<th scope="col">${esc(h)}</th>`).join('')}</tr></thead>` : ''}
<tbody>${rows.map((r) => `<tr${isFinal && our(r) ? ' class="our"' : ''}>${r.map((c, i) => `<td${i === (head?.[0] === '' ? 1 : 0) && isFinal ? ' class="tl"' : ''}>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}
