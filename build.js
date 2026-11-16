// Web TJ Slavoj Boleráz: data/ + src/ -> dist/   (node build.js; TODAY=2026-11-16 prepíše dnešný dátum)
// Zápasy, tabuľky a súpisky zo Sportnetu (data/sportnet.json), údaje klubu z data/klub.json, fotky a príspevky
// z Instagramu klubu (data/foto-out.json zo scripts/photos.py). Podpis webu: zápasové karty FULLTIME / MATCH DAY
// v štýle grafík, ktoré klub dáva na Instagram – web ich skladá sám z výsledkov.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(ROOT, 'src');
const OUT = path.join(ROOT, 'dist');
const rd = (f, def) => { const p = path.join(ROOT, 'data', f); return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : def; };
const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8'));
const club = rd('klub.json');
const sn = rd('sportnet.json');
const foto = rd('foto-out.json', { albums: [], named: {}, cards: [], posts: [], reels: [] });
const SPACE = config.sportnet.appSpace;

// ---- pomocné -------------------------------------------------------------------------------------
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const norm = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const local = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Bratislava', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
const TODAY = process.env.TODAY || local.format(new Date()).slice(0, 10);
const DAYS = ['nedeľa', 'pondelok', 'utorok', 'streda', 'štvrtok', 'piatok', 'sobota'];
const MONTHS = ['január', 'február', 'marec', 'apríl', 'máj', 'jún', 'júl', 'august', 'september', 'október', 'november', 'december'];
const MONTHS_G = ['januára', 'februára', 'marca', 'apríla', 'mája', 'júna', 'júla', 'augusta', 'septembra', 'októbra', 'novembra', 'decembra'];
const dObj = (iso) => new Date(iso + 'T12:00:00Z');
const dNum = (iso) => { const d = dObj(iso); return `${d.getUTCDate()}. ${d.getUTCMonth() + 1}.`; };
const DAYS_ACC = ['v nedeľu', 'v pondelok', 'v utorok', 'v stredu', 'vo štvrtok', 'v piatok', 'v sobotu'];
const dWhen = (iso) => { const d = dObj(iso); return `${DAYS_ACC[d.getUTCDay()]} ${d.getUTCDate()}. ${MONTHS_G[d.getUTCMonth()]}`; }; // „jar sa začína v sobotu 6. marca“
const dLong = (iso) => { const d = dObj(iso); return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()}. ${MONTHS_G[d.getUTCMonth()]}`; };
const dCard = (iso) => { const d = dObj(iso); return `${d.getUTCDate()}. ${MONTHS_G[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };
const dFull = (iso) => { const d = dObj(iso); return `${d.getUTCDate()}. ${d.getUTCMonth() + 1}. ${d.getUTCFullYear()}`; };
const localDate = (isoTime) => local.format(new Date(isoTime)).slice(0, 10);
function isoLocal(date, time = '12:00') {
  const [y, mo, d] = date.split('-').map(Number), [h, mi] = time.split(':').map(Number);
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  const [ld, lt] = local.format(new Date(guess)).split(' ');
  const shown = Date.UTC(...ld.split('-').map((x, i) => Number(x) - (i === 1 ? 1 : 0)), ...lt.split(':').map(Number));
  const off = (shown - guess) / 6e4;
  return `${date}T${time}:00+${String(Math.floor(off / 60)).padStart(2, '0')}:${String(off % 60).padStart(2, '0')}`;
}
const tel = (n) => 'tel:' + n.replace(/^0/, '+421').replace(/\s+/g, '');
const SEASON = sn.season.replace(/^(\d{4})\/\d\d(\d\d)$/, '$1/$2');
const surname = (n) => String(n).trim().split(/\s+/).at(-1);
const plural = (n, a, b, c) => `${n} ${n === 1 ? a : n >= 2 && n <= 4 ? b : c}`;

// ---- súťaže, tímy, zápasy ------------------------------------------------------------------------
const compName = (name) => club.sutaze[name] || club.sutaze[name.replace(/\s+/g, ' ')] || name.replace(/\s+/g, ' ');
const ROUND = (r) => (/^\d+$/.test(r) ? `${r}. kolo` : String(r || '').replace(/(\d)\.\s*kolo/i, '$1. kolo').replace(/Kolo/, 'kolo'));
const teams = sn.teams.map((t) => {
  const league = t.competitions.find((c) => !c.cup);
  const table = league ? sn.tables[league.key] : null;
  return {
    ...t, url: `timy/${t.slug}/`, code: t.adult ? t.slug[0] : norm(t.short).replace(/-/g, ''),
    full: t.adult ? t.short : `${t.short} ${t.sub.toLowerCase()}`, leagueName: league ? compName(league.name) : '',
    table, pos: table?.rows.find((r) => r.our)?.pos || null, of: table?.rows.length || 0,
  };
});
const bySlug = Object.fromEntries(teams.map((t) => [t.slug, t]));
const A = teams[0];
const matches = sn.matches.map((m) => {
  const t = bySlug[m.team];
  const past = m.played || m.date < TODAY;
  let gf = null, ga = null, res = null;
  // prípravky (U11 a mladší) výsledok nezapisujú, Sportnet pri nich dáva 0:0 bez gólov
  if (m.score === '0:0' && !(m.goals || []).length && /^U(\d|1[01])\b/.test(t.short)) m = { ...m, score: null };
  if (m.score) { const [h, a] = m.score.split(':').map(Number); [gf, ga] = m.home ? [h, a] : [a, h]; res = gf > ga ? 'w' : gf < ga ? 'l' : 'd'; }
  const goals = (m.goals || []).filter((g) => g.player); // pokutové kopy v rozstrele majú prázdne meno
  return { ...m, goals, past, gf, ga, res, url: `zapasy/${m.date}-${t.code}-${norm(m.opponent)}/`, comp: compName(m.competition), roundName: ROUND(m.round), teamObj: t, cup: /cup|pohár/i.test(m.competition) };
});
const teamMatches = (slug) => matches.filter((m) => m.team === slug);
const upcoming = matches.filter((m) => !m.past);
const results = matches.filter((m) => m.past && m.score).reverse();
const RES = { w: 'Výhra', d: 'Remíza', l: 'Prehra' };
function scorers(slug) {
  const c = new Map();
  for (const m of teamMatches(slug)) for (const g of m.goals) if (g.side === 'our' && g.kind !== 'own') c.set(g.player, (c.get(g.player) || 0) + 1);
  return [...c].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'sk'));
}
function record(slug, comp = null) {
  const r = { w: 0, d: 0, l: 0, gf: 0, ga: 0, n: 0 };
  for (const m of teamMatches(slug)) if (m.res && (!comp || m.comp === comp)) { r[m.res]++; r.gf += m.gf; r.ga += m.ga; r.n++; }
  return r;
}

// príspevky z Instagramu pri zápase (správa = popis so skóre v deň zápasu) a albumy fotiek z toho dňa
const posts = foto.posts.map((p) => ({ ...p, date: p.time ? localDate(p.time) : '' }));
const reportFor = (m) => (m.team === A.slug && m.score ? posts.find((p) => p.date === m.date && /\d\s*[-:]\s*\d/.test(p.text) && /skončil|vyhral|prehral|remíz|výhra|gól/i.test(p.text)) : null);
const albumFor = (m) => (m.team === A.slug ? foto.albums.find((a) => a.date === m.date) : null);

// ---- obrázky -----------------------------------------------------------------------------------
const logoFile = (space) => space && fs.existsSync(path.join(SRC, 'img', 'kluby', `${space}.webp`));
const initials = (name) => String(name).replace(/^(TJ|OŠK|OFK|ŠK|FK|FC|MFK|MŠK|PFK|TFK|AFC|OTJ|Telovýchovná jednota)\s+/i, '').split(/[\s-]+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
function crest(space, name, R, size = 40, eager = false) {
  const lazy = eager ? '' : ' loading="lazy"';
  if (space === SPACE) return `<img class="crest" src="${R}img/erb-t-192.webp" alt="" width="${size}" height="${Math.round(size * 0.954)}"${lazy} decoding="async">`;
  if (logoFile(space)) return `<img class="crest" src="${R}img/kluby/${space}.webp" alt="" width="${size}" height="${size}"${lazy} decoding="async">`;
  return `<span class="crest crest--txt" aria-hidden="true">${esc(initials(name))}</span>`;
}
const srcset = (R, name, ws) => ws.map((w) => `${R}img/foto/${name}-${w}.webp ${w}w`).join(', ');
function photo(key, R, { sizes = '100vw', cls = '', eager = false, portrait = false } = {}) {
  const f = foto.named[key]; if (!f) return '';
  const ws = portrait ? f.pwidths : f.widths, name = portrait ? `${key}-p` : key, w = ws.at(-1);
  // úvodná fotka: na telefóne portrétny výrez (hero je vysoký), na počítači široký
  if (key === 'hero' && !portrait) return `<picture><source media="(max-width: 999.98px)" srcset="${srcset(R, `${key}-p`, f.pwidths)}" sizes="100vw" width="${f.pwidths.at(-1)}" height="${Math.round(f.pwidths.at(-1) * 1.25)}"><img class="${cls}" src="${R}img/foto/${name}-${w}.webp" srcset="${srcset(R, name, ws)}" sizes="${sizes}" alt="${esc(f.alt)}" width="${w}" height="${Math.round(w * 9 / 16)}"${eager ? ' fetchpriority="high"' : ' loading="lazy"'} decoding="async"></picture>`;
  return `<img class="${cls}" src="${R}img/foto/${name}-${w}.webp" srcset="${srcset(R, name, ws)}" sizes="${sizes}" alt="${esc(f.alt)}" width="${w}" height="${Math.round(portrait ? w * 1.25 : w * 9 / 16)}"${eager ? ' fetchpriority="high"' : ' loading="lazy"'} decoding="async">`;
}

// ---- ikony (Lucide, ISC) -------------------------------------------------------------------------
const ico = (p) => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
const I = {
  home: ico('<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M10 21v-6h4v6"/>'),
  ball: ico('<circle cx="12" cy="12" r="10"/><path d="m12 7 4.2 3-1.6 5H9.4L7.8 10z"/><path d="M12 2v5M21.5 9.5 16.2 10M18 20l-3.4-5M6 20l3.4-5M2.5 9.5l5.3.5"/>'),
  table: ico('<path d="M3 5h18M3 10h18M3 15h18M3 20h18"/><path d="M8 5v15"/>'),
  shirt: ico('<path d="M8 3 3 6l2 5 3-1v11h8V10l3 1 2-5-5-3a4 4 0 0 1-8 0z"/>'),
  shield: ico('<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/>'),
  ig: ico('<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor"/>'),
  phone: ico('<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/>'),
  mail: ico('<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/>'),
  route: ico('<circle cx="6" cy="19" r="3"/><path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15"/><circle cx="18" cy="5" r="3"/>'),
  cal: ico('<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>'),
  play: ico('<path d="m8 5 11 7-11 7z" fill="currentColor"/>'),
  heart: ico('<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 0 0 0-7.8z"/>'),
  x: ico('<path d="M6 6l12 12M18 6 6 18"/>'),
  left: ico('<path d="m15 6-6 6 6 6"/>'), right: ico('<path d="m9 6 6 6-6 6"/>'),
  ext: ico('<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>'),
};

// ---- CSP a rozloženie ----------------------------------------------------------------------------
const HEAD_JS = `document.documentElement.classList.add('js')`;
const sha256 = (s) => `'sha256-${crypto.createHash('sha256').update(s, 'utf8').digest('base64')}'`;
const CONNECT = ["'self'", ...(config.supabase?.url ? [new URL(config.supabase.url).origin] : [])];
const CSP = ["default-src 'none'", `script-src 'self' ${sha256(HEAD_JS)}`, "style-src 'self'", "img-src 'self' data:", "font-src 'self'", `connect-src ${CONNECT.join(' ')}`, "base-uri 'none'", "form-action 'none'", "object-src 'none'"].join('; ');

// navigácia: na telefóne spodná lišta ako v aplikácii (päť položiek), na počítači horná lišta
const NAV = [['', 'Úvod', 'home'], ['zapasy/', 'Zápasy', 'ball'], ['tabulka/', 'Tabuľka', 'table'], ['timy/', 'Tímy', 'shirt'], ['galeria/', 'Galéria', null], ['klub/', 'Klub', 'shield'], ['kontakt/', 'Kontakt', null]];
const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${club.ihrisko.geo.join(',')}`;

function layout({ route, title, desc, body, active }) {
  const depth = route.split('/').filter(Boolean).length;
  const R = depth ? '../'.repeat(depth) : './';
  const cur = (u) => (active === u ? ' aria-current="page"' : '');
  const fullTitle = (config.ukazka ? 'Návrh webu – ' : '') + (route ? `${title} | ${club.kratky}` : `${club.nazov} – ${title}`);
  const ld = route ? '' : `<script type="application/ld+json">${JSON.stringify({
    '@context': 'https://schema.org', '@type': 'SportsClub', name: club.nazov, sport: 'Futbal', foundingDate: String(club.zalozenie),
    email: club.kontakty.find((k) => k.email)?.email, telephone: tel(club.kontakty[0].telefon).slice(4),
    address: { '@type': 'PostalAddress', streetAddress: club.adresa[0], postalCode: '919 08', addressLocality: club.obec, addressCountry: 'SK' },
    sameAs: [club.instagram, club.sportnetUrl],
  }).replace(/</g, '\\u003c')}</script>`;
  return `<!doctype html>
<html lang="sk" data-root="${R}"${config.ukazka ? ' class="has-demo"' : ''}>
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${CSP}">
<meta name="referrer" content="strict-origin-when-cross-origin">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(fullTitle)}</title>
<meta name="description" content="${esc(desc || `${club.nazov} – futbal v Boleráze od roku ${club.zalozenie}. Zápasy, výsledky, tabuľka, tímy a fotky.`)}">
${config.noindex ? '<meta name="robots" content="noindex">\n' : ''}<meta property="og:title" content="${esc(fullTitle)}">
<meta property="og:type" content="website">
<meta property="og:locale" content="sk_SK">
<meta name="theme-color" content="#0b2b4f">
<link rel="icon" type="image/png" href="${R}img/favicon.png">
<link rel="apple-touch-icon" href="${R}img/apple-touch-icon.png">
<link rel="preload" href="${R}fonts/sofia-sans-extra-condensed-900i.woff" as="font" type="font/woff" crossorigin>
<link rel="preload" href="${R}fonts/sofia-sans-400.woff" as="font" type="font/woff" crossorigin>
<link rel="stylesheet" href="${R}css/site.css">
<script>${HEAD_JS}</script>
<script type="module" src="${R}js/site.mjs"></script>
${ld}</head>
<body>
<a class="skip" href="#obsah">Preskočiť na obsah</a>
${config.ukazka ? '<p class="demo">Návrh webu · nie je to oficiálna stránka klubu</p>\n' : ''}<header class="top">
  <div class="wrap top-in">
    <a class="brand" href="${R}"${route ? '' : ' aria-current="page"'}><img src="${R}img/erb-t-96.webp" alt="" width="40" height="38"><span>Slavoj <b>Boleráz</b></span></a>
    <nav class="topnav" aria-label="Hlavné menu"><ul>${NAV.map(([u, t]) => `<li><a href="${R}${u}"${cur(u)}>${t}</a></li>`).join('')}</ul></nav>
    <a class="igbtn" href="${club.instagram}" rel="noopener">${I.ig}<span>@${club.instagramHandle}</span></a>
  </div>
</header>
<main id="obsah">
${body}
</main>
<footer class="foot">
  <div class="wrap foot-in">
    <div class="foot-club"><img src="${R}img/erb-t-192.webp" alt="" width="72" height="69" loading="lazy"><div><p class="foot-name">${esc(club.nazov)}</p><p>Futbal v Boleráze od roku ${club.zalozenie}</p></div></div>
    <div><h2 class="foot-h">Kontakt</h2><p>${club.kontakty.map((k) => `${esc(k.funkcia)}: ${esc(k.meno)}<br><a href="${tel(k.telefon)}">${esc(k.telefon)}</a>${k.email ? `<br><a href="mailto:${k.email}">${esc(k.email)}</a>` : ''}`).join('</p><p>')}</p></div>
    <div><h2 class="foot-h">Ihrisko</h2><p>${esc(club.ihrisko.adresa)}<br><a href="${mapsUrl}" rel="noopener">Navigovať</a></p><h2 class="foot-h">Viac</h2><p><a href="${R}galeria/">Galéria</a><br><a href="${R}kontakt/">Kontakt a fakturačné údaje</a></p></div>
    <div><h2 class="foot-h">Sleduj nás</h2><p><a class="foot-ig" href="${club.instagram}" rel="noopener">${I.ig}@${club.instagramHandle}</a></p><p class="foot-small">Výsledky, tabuľky a súpisky sa dopĺňajú zo Sportnetu, naposledy ${dFull(sn.updated.slice(0, 10))}.</p></div>
  </div>
  <div class="foot-bar"><div class="wrap"><span>© ${new Date().getFullYear()} ${esc(club.nazov)}</span><a href="${R}ochrana-sukromia/">Ochrana súkromia</a>${config.adminDemo ? `<a href="${R}admin/">Administrácia (ukážka)</a>` : ''}</div></div>
</footer>
<nav class="tabbar" aria-label="Rýchla navigácia">${NAV.filter(([, , i]) => i).map(([u, t, i]) => `<a href="${R}${u}"${cur(u)}>${I[i]}<span>${t}</span></a>`).join('')}</nav>
</body>
</html>
`;
}

// ---- zápasová karta (FULLTIME / MATCH DAY) -------------------------------------------------------
let cardPhoto = 0;
const nextCardPhoto = () => foto.cards.length ? foto.cards[cardPhoto++ % foto.cards.length] : null;
function card(m, R, { size = 'm', photo: usePhoto = m.team === A.slug, eager = false, link = true } = {}) {
  const us = { name: club.kratky, space: SPACE }, them = { name: m.opponent, space: m.oppSpace };
  const [h, a] = m.home ? [us, them] : [them, us];
  const ph = usePhoto ? nextCardPhoto() : null;
  const sizes = size === 'l' ? '(min-width: 1000px) 440px, (min-width: 600px) 60vw, 92vw' : '(min-width: 1000px) 320px, (min-width: 600px) 45vw, 80vw';
  const bg = ph ? `<img class="card-bg" src="${R}img/foto/${ph.name}-${ph.widths.at(-1)}.webp" srcset="${srcset(R, ph.name, ph.widths)}" sizes="${sizes}" alt=""${eager ? ' fetchpriority="high"' : ' loading="lazy"'} decoding="async" width="${ph.widths.at(-1)}" height="${Math.round(ph.widths.at(-1) * 1.25)}">` : '';
  const word = m.score ? 'Fulltime' : m.past ? 'Odohrané' : 'Match day';
  const ours = m.goals.filter((g) => g.side === 'our'), theirs = m.goals.filter((g) => g.side === 'opp');
  // strelec raz na riadok (pri mládeži padne aj 18 gólov, karta má pevný pomer 4:5); pri viac ako 6 góloch
  // jednej strany sa viacgólový strelec skráti na „Peko 6×“ – minúty sú v priebehu na stránke zápasu
  const gl = (list) => {
    const by = new Map();
    for (const g of list) { const k = `${g.player}|${g.kind === 'own'}`; if (!by.has(k)) by.set(k, { name: surname(g.player), own: g.kind === 'own', goals: [] }); by.get(k).goals.push(g); }
    const many = list.length > 6;
    return [...by.values()].map((p) => `${esc(p.name)} ${many && p.goals.length > 1 ? `${p.goals.length}×` : p.goals.map((g) => `${esc(g.min)}′${g.kind === 'penalty' ? ' (p)' : ''}`).join(', ')}${p.own ? ' (vl.)' : ''}`);
  };
  const [lh, la] = m.home ? [gl(ours), gl(theirs)] : [gl(theirs), gl(ours)];
  const [gh, ga] = [lh.join('<br>'), la.join('<br>')];
  const goalLines = Math.max(lh.length, la.length);
  // popis pre čítačky začína viditeľným slovom na karte (WCAG 2.5.3)
  const label = `${word}: ${m.home ? `${club.kratky} – ${m.opponent}` : `${m.opponent} – ${club.kratky}`}${m.score ? ` ${m.score}` : ''}${m.teamObj.adult ? '' : `, ${m.teamObj.full}`}`;
  const inner = `${bg}<span class="card-shade" aria-hidden="true"></span>
  <span class="card-league">${esc(m.cup ? m.comp : m.teamObj.adult ? m.comp : `${m.teamObj.full} · ${m.comp}`)}</span>
  <span class="card-word" aria-hidden="true">${word}</span>
  ${m.score ? `<span class="card-score">${crest(h.space, h.name, R, 56)}<span class="card-num">${m.score.replace(':', '<span class="card-dash">–</span>')}</span>${crest(a.space, a.name, R, 56)}</span>
  ${gh || ga ? `<span class="card-goals${goalLines > 5 ? ' card-goals--many' : ''}"><span>${gh}</span><span>${ga}</span></span>` : ''}`
    : `<span class="card-vs">${crest(h.space, h.name, R, 52)}${crest(a.space, a.name, R, 52)}</span>
  <span class="card-when">${esc(dCard(m.date).toUpperCase())}${m.time ? ` | ${esc(m.time)}` : ''}</span>
  <span class="card-teams">${esc(h.name)}<br><i>vs</i> ${esc(a.name)}</span>`}
  ${m.score ? `<span class="card-when card-when--b">${esc(dCard(m.date).toUpperCase())} | ${m.home ? 'doma' : 'vonku'}</span>` : ''}`;
  const tag = link ? 'a' : 'div';
  return `<${tag} class="card card--${size}${m.score ? ' card--ft' : ' card--md'}${!m.score && m.past ? ' card--done' : ''}${ph ? ' card--photo' : ''}"${link ? ` href="${R}${m.url}"` : ''} aria-label="${esc(label)}">${inner}</${tag}>`;
}

// riadok zápasu
function row(m, R, { team = true } = {}) {
  const right = m.score ? `<span class="r-score r-score--${m.res}"><span class="sr">${RES[m.res]} </span>${esc(m.score)}</span>`
    : m.past ? '<span class="r-score r-score--none">–</span>' : `<span class="r-time">${esc(m.time)}</span>`;
  const link = m.detail || !m.past;
  return `<li class="row" data-team="${m.team}" data-where="${m.home ? 'doma' : 'vonku'}"><${link ? `a href="${R}${m.url}"` : 'div'} class="row-in">
  <span class="r-date"><b>${dNum(m.date)}</b>${DAYS[dObj(m.date).getUTCDay()].slice(0, 2)}</span>
  ${crest(m.oppSpace, m.opponent, R, 30)}
  <span class="r-main"><span class="r-opp">${esc(m.opponent)}</span><span class="r-sub">${team ? `<b>${esc(m.teamObj.short)}</b> · ` : ''}${m.home ? 'doma' : 'vonku'} · ${esc(m.cup ? m.comp : m.roundName)}</span></span>
  ${right}
</${link ? 'a' : 'div'}></li>`;
}
const rows = (list, R, o) => `<ol class="rows">${list.map((m) => row(m, R, o)).join('')}</ol>`;

function table(tb, R, { compact = false } = {}) {
  let list = tb.rows;
  if (compact) { const i = list.findIndex((r) => r.our); const from = Math.max(0, Math.min(i - 2, list.length - 5)); list = list.slice(from, from + 5); }
  return `<div class="tbl-wrap"><table class="tbl">
  <thead><tr><th scope="col"><span class="sr">Poradie</span></th><th scope="col" class="tl">Tím</th><th scope="col"><abbr title="Zápasy">Z</abbr></th><th scope="col" class="hm"><abbr title="Výhry">V</abbr></th><th scope="col" class="hm"><abbr title="Remízy">R</abbr></th><th scope="col" class="hm"><abbr title="Prehry">P</abbr></th><th scope="col">Skóre</th><th scope="col"><abbr title="Body">B</abbr></th></tr></thead>
  <tbody>${list.map((r) => `<tr${r.our ? ' class="our"' : ''}><td class="pos">${r.pos}</td><th scope="row" class="tl"><span class="tteam">${crest(r.space, r.name, R, 24)}<span>${esc(r.name)}</span></span></th><td>${r.played}</td><td class="hm">${r.won}</td><td class="hm">${r.draw}</td><td class="hm">${r.lost}</td><td class="nw">${r.gf}:${r.ga}</td><td class="pts">${r.pts}</td></tr>`).join('')}</tbody>
</table></div>`;
}

const head = (title, sub, R, crumbs = []) => `<section class="phead"><div class="wrap">
  ${crumbs.length ? `<nav class="crumbs" aria-label="Omrvinky"><a href="${R}">Úvod</a>${crumbs.map(([u, t]) => u ? `<a href="${R}${u}">${esc(t)}</a>` : `<span aria-current="page">${esc(t)}</span>`).join('')}</nav>` : ''}
  <h1 class="ph-title">${esc(title)}</h1>${sub ? `<p class="ph-sub">${sub}</p>` : ''}
</div></section>`;
const sec = (h, id, more = '') => `<div class="sec-h"><h2 class="title" id="${id}">${h}</h2>${more}</div>`;
const more = (href, t) => `<a class="more" href="${href}">${t}</a>`;
const calBox = (file, R, id) => `<details class="cal" data-cal id="${id}">
  <summary class="btn btn--ghost">${I.cal}<span>Zápasy do kalendára</span></summary>
  <div class="cal-pop">
    <a class="cal-o" data-webcal href="${R}kalendar/${file}" hidden><b>Odoberať v telefóne</b><span>rozpis sa v kalendári sám aktualizuje</span></a>
    <a class="cal-o" data-gcal href="${R}kalendar/${file}" rel="noopener" hidden><b>Google Kalendár</b><span>aj pre Android</span></a>
    <a class="cal-o" data-ics href="${R}kalendar/${file}" download><b>Stiahnuť .ics</b><span>jednorazovo</span></a>
  </div>
</details>`;
const igText = (t) => esc(t).replace(/\n{2,}/g, '</p><p>').replace(/\n/g, '<br>');

// ---- stránky -----------------------------------------------------------------------------------
const pages = [];
const add = (route, o) => pages.push({ route, ...o });
const crewRole = { coach: 'Tréner', assist_coach: 'Asistent trénera', manager: 'Vedúci mužstva', doctor: 'Lekár', physiotherapist: 'Fyzioterapeut', masseur: 'Masérka', other: 'Realizačný tím' };
const POS = [['goalkeeper', 'Brankári'], ['defender', 'Obrancovia'], ['midfielder', 'Stredopoliari'], ['forward', 'Útočníci'], ['', 'Hráči']];
const aRec = record(A.slug, A.leagueName);
const aLast = results.find((m) => m.team === A.slug);
const aNext = upcoming.find((m) => m.team === A.slug);
const winter = aNext && (dObj(aNext.date) - dObj(TODAY)) / 864e5 > 21;

add('', {
  title: `futbal v Boleráze od roku ${club.zalozenie}`, active: '',
  body: (R) => {
    cardPhoto = 1; // hero je fotka č. 1, karta vedľa nej začne druhou
    const feed = results.filter((m) => m.team === A.slug).slice(0, 4);
    const youth = teams.filter((t) => !t.adult).map((t) => results.find((m) => m.team === t.slug)).filter(Boolean);
    const top = scorers(A.slug).slice(0, 5);
    return `<section class="hero">
  ${photo('hero', R, { cls: 'hero-img', eager: true, sizes: '100vw' })}
  <span class="hero-shade" aria-hidden="true"></span>
  <div class="wrap hero-in">
    <div class="hero-copy">
      <p class="hero-kick">${esc(A.leagueName)} · sezóna ${SEASON}</p>
      <h1 class="hero-h">${winter ? `Jeseň na ${A.pos}. mieste` : `${A.pos}. miesto v tabuľke`}</h1>
      <p class="hero-p">${plural(aRec.w, 'výhra', 'výhry', 'výhier')}, ${plural(aRec.d, 'remíza', 'remízy', 'remíz')} a ${plural(aRec.l, 'prehra', 'prehry', 'prehier')} v lige, skóre ${aRec.gf}:${aRec.ga}. ${winter ? `Jar sa začína ${dWhen(aNext.date)} zápasom ${aNext.home ? 'doma proti' : 'na ihrisku'} ${esc(aNext.opponent)}.` : ''}</p>
      <p class="hero-cta"><a class="btn btn--white" href="${R}zapasy/">Zápasy a výsledky</a><a class="btn btn--line" href="${R}tabulka/">Tabuľka</a></p>
    </div>
    ${aLast ? `<div class="hero-card">${card(aLast, R, { size: 'l', eager: false })}</div>` : ''}
  </div>
</section>
<section class="band" aria-labelledby="feed-h"><div class="wrap">
  ${sec('Posledné zápasy', 'feed-h', more(`${R}zapasy/`, 'Všetky výsledky'))}
  <div class="feed" data-rail>${feed.map((m) => card(m, R)).join('')}${upcoming.filter((m) => m.team === A.slug).slice(0, 1).map((m) => card(m, R)).join('')}</div>
</div></section>
<section class="sec" aria-labelledby="tab-h"><div class="wrap two">
  <div>${sec(esc(A.leagueName), 'tab-h', more(`${R}tabulka/`, 'Celá tabuľka'))}${A.table ? table(A.table, R, { compact: true }) : ''}</div>
  <div>${sec('Strelci', 'str-h')}<ol class="scorers">${top.map(([n, g], i) => `<li><span class="sc-n">${i + 1}</span><span class="sc-name">${esc(n)}</span><b>${g}</b></li>`).join('')}</ol><p class="note">Ligové aj pohárové zápasy A-mužstva v sezóne ${SEASON} podľa zápisov na Sportnete.</p></div>
</div></section>
<section class="sec sec--ice" aria-labelledby="next-h"><div class="wrap two">
  <div>${sec('Program', 'next-h', more(`${R}zapasy/`, 'Celý rozpis'))}${upcoming.length ? rows(upcoming.slice(0, 6), R) : '<p>Ďalšie zápasy ešte nie sú vyžrebované.</p>'}</div>
  <div>${sec('Mládež', 'ml-h', more(`${R}timy/`, 'Všetky tímy'))}${youth.length ? rows(youth, R) : ''}</div>
</div></section>
${foto.posts.length ? `<section class="sec sec--navy" aria-labelledby="ig-h"><div class="wrap">
  ${sec('Z Instagramu', 'ig-h', `<a class="more more--light" href="${club.instagram}" rel="noopener">@${club.instagramHandle}</a>`)}
  <ul class="iggrid">${foto.posts.slice(0, 6).map((p) => `<li><a href="${p.url}" rel="noopener"><img src="${R}img/foto/ig-${p.code}-${p.widths[0]}.webp" alt="" width="${p.widths[0]}" height="${Math.round(p.widths[0] * 1.25)}" loading="lazy" decoding="async"><span class="ig-cap">${esc(p.text.split('\n').find((l) => l.trim() && !/^SEZÓNA/.test(l)) || p.text.split('\n')[0])}</span><span class="ig-meta">${I.heart}${esc(p.likes)} · ${dNum(p.date)}</span></a></li>`).join('')}</ul>
  ${foto.reels.length ? `<h3 class="sub">Videá</h3><ul class="reels" data-rail>${foto.reels.map((v) => `<li><a href="${v.url}" rel="noopener"><img src="${R}img/foto/${v.name}" alt="" width="${v.w}" height="${v.h}" loading="lazy" decoding="async"><span class="reel-play" aria-hidden="true">${I.play}</span><span class="reel-cap">${esc(v.text.split('\n')[0])}</span><span class="ig-meta">${I.heart}${esc(v.likes)}</span></a></li>`).join('')}</ul>` : ''}
</div></section>` : ''}
<section class="sec" aria-labelledby="hist-h"><div class="wrap story">
  <div class="story-photo">${photo('kruh', R, { cls: 'story-img', sizes: '(min-width: 900px) 50vw, 100vw' })}</div>
  <div class="story-copy">
    <h2 class="title" id="hist-h">Od roku ${club.zalozenie}</h2>
    <p>${esc(club.historiaOdseky[0].split('. ').slice(2, 5).join('. '))}.</p>
    <ol class="miles">${club.historiaMilniky.slice(0, 4).map((h) => `<li><b>${esc(h.rok)}</b><span>${esc(h.text)}</span></li>`).join('')}</ol>
    <p><a class="btn btn--navy" href="${R}klub/">História klubu</a></p>
  </div>
</div></section>`;
  },
});

// zápasy
add('zapasy/', {
  title: 'Zápasy', active: 'zapasy/', desc: `Program a výsledky všetkých tímov TJ Slavoj Boleráz v sezóne ${SEASON}.`,
  body: (R) => {
    const grp = (list) => { const g = new Map(); for (const m of list) { const k = m.date.slice(0, 7); if (!g.has(k)) g.set(k, []); g.get(k).push(m); } return [...g].map(([k, l]) => `<section class="month" data-month><h3 class="month-h">${MONTHS[Number(k.slice(5)) - 1]} ${k.slice(0, 4)}</h3>${rows(l, R)}</section>`).join(''); };
    return `${head('Zápasy', `Sezóna ${SEASON}, všetky tímy. Výsledky, strelci a zostavy sa dopĺňajú zo Sportnetu.`, R, [[null, 'Zápasy']])}
<section class="sec sec--first"><div class="wrap">
  <div class="chips" data-filters hidden role="group" aria-label="Tím"><button type="button" class="chip" data-f-team="" aria-pressed="true">Všetky</button>${teams.map((t) => `<button type="button" class="chip" data-f-team="${t.slug}" aria-pressed="false">${esc(t.short)}</button>`).join('')}</div>
  <div class="two two--list">
    <section aria-labelledby="z-p"><h2 class="title" id="z-p">Program</h2>${upcoming.length ? grp(upcoming) : '<p>Ďalšie zápasy ešte nie sú vyžrebované.</p>'}<p class="empty" data-empty hidden>Tento tím zatiaľ nemá naplánovaný zápas.</p></section>
    <section aria-labelledby="z-v"><h2 class="title" id="z-v">Výsledky</h2>${grp(matches.filter((m) => m.past).reverse())}<p class="empty" data-empty hidden>Tento tím zatiaľ nemá výsledok.</p></section>
  </div>
  <div class="mt">${calBox('vsetky.ics', R, 'cal-all')}</div>
</div></section>`;
  },
});

// detail zápasu
const POS_O = { goalkeeper: 0, defender: 1, midfielder: 2, forward: 3 };
function lineup(l, name) {
  if (!l || !l.start.length) return '';
  const li = (p) => `<li><span class="ln-nr">${esc(p.nr)}</span>${esc(p.name)}${p.c ? ' <abbr class="cap" title="kapitán">C</abbr>' : ''}</li>`;
  return `<div class="lineup"><h3 class="lineup-h">${esc(name)}</h3><ol class="ln">${[...l.start].sort((a, b) => (POS_O[a.pos] ?? 9) - (POS_O[b.pos] ?? 9)).map(li).join('')}</ol>${l.subs.length ? `<p class="ln-subh">Náhradníci</p><ol class="ln ln--subs">${l.subs.map(li).join('')}</ol>` : ''}${l.coach ? `<p class="ln-coach">Tréner: ${esc(l.coach)}</p>` : ''}</div>`;
}
function gallery(al, R, max = 99) {
  return `<ul class="gal" data-gallery>${al.files.slice(0, max).map((f, i) => `<li><a href="${R}img/foto/${f.name}-${f.widths.at(-1)}.webp" data-lb data-w="${f.w}" data-h="${f.h}"><img src="${R}img/foto/${f.name}-${f.widths[0]}.webp" alt="${esc(al.title)}, fotka ${i + 1}" width="${f.widths[0]}" height="${Math.round(f.widths[0] * f.h / f.w)}" loading="lazy" decoding="async"></a></li>`).join('')}</ul>`;
}
for (const m of matches) {
  if (m.past && !m.detail) continue;
  const titleTxt = m.home ? `${club.kratky} – ${m.opponent}` : `${m.opponent} – ${club.kratky}`;
  add(m.url, {
    title: `${titleTxt}${m.score ? ` ${m.score}` : ''}`, active: 'zapasy/', desc: `${m.teamObj.full}, ${m.comp}, ${dLong(m.date)} ${dObj(m.date).getUTCFullYear()}.`,
    body: (R) => {
      cardPhoto = Math.abs([...m.id].reduce((s, c) => s + c.charCodeAt(0), 0)) % Math.max(foto.cards.length, 1);
      const rep = reportFor(m), al = albumFor(m);
      const ev = [...m.goals.map((g) => ({ ...g, t: 'g' })), ...(m.cards || []).map((c) => ({ ...c, t: 'c' }))].sort((a, b) => (parseInt(a.min, 10) || 0) - (parseInt(b.min, 10) || 0));
      const side = (e) => ((e.side === 'our') === m.home ? 'h' : 'a');
      const evTxt = (e) => e.t === 'g' ? `<span class="ev-ball" aria-hidden="true">${I.ball}</span><span><span class="sr">Gól: </span>${esc(e.player)}${e.kind === 'penalty' ? ' (z penalty)' : e.kind === 'own' ? ' (vlastný)' : ''}</span>` : `<span class="ev-card ev-card--${e.kind}" aria-hidden="true"></span><span><span class="sr">${e.kind === 'yellow' ? 'Žltá karta' : 'Červená karta'}: </span>${esc(e.player)}</span>`;
      const snUrl = sn.matches.find((x) => x.id === m.id)?.url;
      return `${head(titleTxt, `${esc(m.teamObj.full)} · ${esc(m.comp)}${m.roundName ? ` · ${esc(m.roundName)}` : ''}`, R, [['zapasy/', 'Zápasy'], [null, dNum(m.date)]])}
<section class="sec sec--first"><div class="wrap match">
  <div class="match-card">${card(m, R, { size: 'l', link: false, eager: true })}</div>
  <div class="match-info">
    ${rep ? `<div class="report"><p class="report-src">${I.ig}Správa z Instagramu klubu, ${dNum(rep.date)}</p><p>${igText(rep.text.replace(/^SEZÓNA[^\n]*\n+/, ''))}</p><p><a class="more" href="${rep.url}" rel="noopener">Príspevok na Instagrame</a></p></div>` : ''}
    ${ev.length ? `<h2 class="title title--s">Priebeh</h2><ol class="evs">${ev.map((e) => `<li class="ev ev--${side(e)}"><span class="ev-min">${esc(e.min)}′</span>${evTxt(e)}</li>`).join('')}</ol>` : ''}
    <dl class="facts"><div><dt>Výkop</dt><dd>${dLong(m.date)} ${dObj(m.date).getUTCFullYear()}${m.time ? `, ${esc(m.time)}` : ''}</dd></div>${m.venue ? `<div><dt>Ihrisko</dt><dd>${esc(m.venue.replace(/\s+/g, ' '))}</dd></div>` : ''}${m.half ? `<div><dt>Polčas</dt><dd>${esc(m.half)}</dd></div>` : ''}${m.referee ? `<div><dt>Rozhodca</dt><dd>${esc(m.referee)}</dd></div>` : ''}</dl>
    <p class="btns">${snUrl ? `<a class="btn btn--ghost" href="${snUrl}" rel="noopener">${I.ext}Zápis na Sportnete</a>` : ''}${!m.past ? `<a class="btn btn--navy" href="${R}kalendar/zapas-${m.id}.ics" download>${I.cal}Do kalendára</a>${m.home ? `<a class="btn btn--ghost" href="${mapsUrl}" rel="noopener">${I.route}Navigovať</a>` : ''}` : ''}</p>
  </div>
  ${al ? `<div class="match-wide"><h2 class="title title--s">Fotky zo zápasu</h2>${gallery(al, R, 8)}<p class="note">${al.credit ? `Foto: ${esc(al.credit)} · ` : ''}<a href="${R}galeria/${al.slug}/">Celý album (${al.files.length})</a></p></div>` : ''}
  ${m.lineups && m.teamObj.adult ? `<div class="match-wide lineups"><h2 class="title title--s">Zostavy</h2>${lineup(m.home ? m.lineups.our : m.lineups.opp, m.home ? club.kratky : m.opponent)}${lineup(m.home ? m.lineups.opp : m.lineups.our, m.home ? m.opponent : club.kratky)}</div>` : ''}
</div></section>`;
    },
  });
}

// tabuľky
add('tabulka/', {
  title: 'Tabuľka', active: 'tabulka/', desc: `Tabuľky súťaží tímov TJ Slavoj Boleráz v sezóne ${SEASON}.`,
  body: (R) => `${head('Tabuľka', `Sezóna ${SEASON}. Poradie podľa Sportnetu.`, R, [[null, 'Tabuľka']])}
<section class="sec sec--first"><div class="wrap">
  <nav class="chips chips--links" aria-label="Tabuľky tímov">${teams.filter((t) => t.table).map((t) => `<a class="chip" href="#${t.slug}">${esc(t.short)}</a>`).join('')}</nav>
  ${teams.filter((t) => t.table).map((t) => `<section class="tsec" id="${t.slug}" aria-labelledby="t-${t.slug}">${sec(esc(t.full), `t-${t.slug}`, more(`${R}${t.url}`, 'Tím'))}<p class="tsec-l">${esc(t.leagueName)}${t.pos ? `, ${t.pos}. miesto` : ''}</p>${table(t.table, R)}</section>`).join('')}
</div></section>`,
});

// tímy
const teamTiles = (R) => `<ul class="tiles">${teams.map((t, i) => `<li><a class="tile${i === 0 ? ' tile--a' : ''}" href="${R}${t.url}">${i === 0 ? photo('kruh', R, { cls: 'tile-img', portrait: true, sizes: '(min-width: 900px) 33vw, 100vw' }) : ''}<span class="tile-n">${esc(t.short)}</span><span class="tile-s">${esc(t.adult ? 'muži' : t.sub)}</span><span class="tile-l">${esc(t.leagueName)}${t.pos ? ` · ${t.pos}. miesto` : ''}</span></a></li>`).join('')}</ul>`;
add('timy/', {
  title: 'Tímy', active: 'timy/', desc: `Tímy TJ Slavoj Boleráz v sezóne ${SEASON}: muži a mládež.`,
  body: (R) => `${head('Tímy', `${teams.length} tímov v sezóne ${SEASON}, od prípravky po A-mužstvo.`, R, [[null, 'Tímy']])}
<section class="sec sec--first"><div class="wrap">${teamTiles(R)}</div></section>`,
});
for (const t of teams) {
  add(t.url, {
    title: t.full, active: 'timy/', desc: `${club.kratky} – ${t.full}: ${t.leagueName}, zápasy, tabuľka a súpiska.`,
    body: (R) => {
      cardPhoto = 0;
      const list = teamMatches(t.slug), nx = list.filter((m) => !m.past), rs = list.filter((m) => m.past).reverse();
      const last = rs.find((m) => m.score), sc = scorers(t.slug), rec = record(t.slug);
      const nrCount = new Map(); for (const a of t.squad.athletes) nrCount.set(a.nr, (nrCount.get(a.nr) || 0) + 1);
      const nr = (a) => (a.nr !== '' && nrCount.get(a.nr) === 1 ? String(a.nr) : '');
      const groups = POS.map(([k, h]) => [h, t.squad.athletes.filter((a) => (k ? a.pos === k : !POS.some(([x]) => x && x === a.pos)))]).filter(([, l]) => l.length);
      return `${head(t.full, `${esc(t.leagueName)}${t.pos ? ` · <b>${t.pos}. miesto</b> z ${t.of}` : ''}`, R, [['timy/', 'Tímy'], [null, t.short]])}
<section class="sec sec--first"><div class="wrap team">
  ${last ? `<div class="team-card">${card(last, R, { size: 'l' })}</div>` : ''}
  <div class="team-side">
    ${rec.n ? `<ul class="nums"><li><b>${rec.w}</b>výhier</li><li><b>${rec.d}</b>remíz</li><li><b>${rec.l}</b>prehier</li><li><b>${rec.gf}:${rec.ga}</b>skóre</li></ul>` : '<p>Výsledky prípraviek sa nezapisujú, rozpis zápasov je nižšie.</p>'}
    ${t.adult && sc.length ? `<h2 class="title title--s">Strelci</h2><ol class="scorers">${sc.slice(0, 6).map(([n, g], i) => `<li><span class="sc-n">${i + 1}</span><span class="sc-name">${esc(n)}</span><b>${g}</b></li>`).join('')}</ol>` : ''}
    ${calBox(`${t.slug}.ics`, R, `cal-${t.slug}`)}
  </div>
</div></section>
<section class="sec sec--ice"><div class="wrap two">
  <div><h2 class="title">Program</h2>${nx.length ? rows(nx, R, { team: false }) : '<p>Ďalšie zápasy ešte nie sú vyžrebované.</p>'}</div>
  <div><h2 class="title">Výsledky</h2>${rs.length ? rows(rs, R, { team: false }) : '<p>Tím v tejto sezóne ešte nehral.</p>'}</div>
</div></section>
${t.table ? `<section class="sec"><div class="wrap"><h2 class="title">Tabuľka</h2><p class="tsec-l">${esc(t.leagueName)}</p>${table(t.table, R)}</div></section>` : ''}
<section class="sec sec--navy" aria-labelledby="sq-h"><div class="wrap">
  <h2 class="title" id="sq-h">Súpiska</h2>
  <p class="note note--light">Hráči, ktorí v roku ${sn.updated.slice(0, 4)} nastúpili alebo boli v nominácii (Sportnet).${t.adult ? '' : ' Pri mládeži uvádzame len mená.'}</p>
  ${groups.map(([h, l]) => `<h3 class="sub">${h}</h3><ul class="squad">${l.sort((a, b) => surname(a.name).localeCompare(surname(b.name), 'sk')).map((a) => `<li><span class="sq-nr" aria-hidden="true">${esc(nr(a))}</span><span class="sq-name">${esc(a.name)}${a.captain && t.adult ? ' <abbr class="cap" title="kapitán">C</abbr>' : ''}</span>${nr(a) ? `<span class="sr">, číslo ${nr(a)}</span>` : ''}</li>`).join('')}</ul>`).join('')}
  ${t.squad.crew.length ? `<h3 class="sub">Realizačný tím</h3><ul class="crew">${t.squad.crew.map((c) => `<li><span>${esc(crewRole[c.role] || crewRole.other)}</span><b>${esc(c.name)}</b></li>`).join('')}</ul>` : ''}
</div></section>`;
    },
  });
}

// galéria
add('galeria/', {
  title: 'Galéria', active: 'galeria/', desc: 'Fotky zo zápasov TJ Slavoj Boleráz.',
  body: (R) => `${head('Galéria', 'Fotky z Instagramu klubu.', R, [[null, 'Galéria']])}
<section class="sec sec--first"><div class="wrap"><ul class="albums">${foto.albums.map((a) => `<li><a href="${R}galeria/${a.slug}/"><img src="${R}img/foto/${a.files[0].name}-${a.files[0].widths.at(-1)}.webp" srcset="${srcset(R, a.files[0].name, a.files[0].widths)}" sizes="(min-width: 900px) 45vw, 100vw" alt="" width="${a.files[0].widths.at(-1)}" height="${Math.round(a.files[0].widths.at(-1) * a.files[0].h / a.files[0].w)}" loading="lazy" decoding="async"><span class="alb-t">${esc(a.title)}</span><span class="alb-m">${dFull(a.date)} · ${plural(a.files.length, 'fotka', 'fotky', 'fotiek')}</span></a></li>`).join('')}</ul></div></section>`,
});
for (const a of foto.albums) {
  const m = matches.find((x) => x.team === A.slug && x.date === a.date);
  add(`galeria/${a.slug}/`, {
    title: a.title, active: 'galeria/', desc: `${a.title} – fotky TJ Slavoj Boleráz.`,
    body: (R) => `${head(a.title, `${dFull(a.date)}${m ? ` · <a href="${R}${m.url}">${esc(m.home ? `${club.kratky} – ${m.opponent}` : `${m.opponent} – ${club.kratky}`)} ${esc(m.score || '')}</a>` : ''}`, R, [['galeria/', 'Galéria'], [null, a.title]])}
<section class="sec sec--first"><div class="wrap">${gallery(a, R)}<p class="note">${a.credit ? `Foto: ${esc(a.credit)}. ` : ''}Zdroj: <a href="${a.ig}" rel="noopener">príspevok na Instagrame klubu</a>.</p></div></section>`,
  });
}

// klub
add('klub/', {
  title: 'Klub', active: 'klub/', desc: `${club.nazov}: história od roku ${club.zalozenie}, vedenie klubu a ihrisko.`,
  body: (R) => `${head('Klub', `${esc(club.historiaUvod)}`, R, [[null, 'Klub']])}
<section class="sec sec--first"><div class="wrap klub">
  <article class="prose">
    <h2 class="title">História</h2>
    ${club.historiaOdseky.map((p) => `<p>${esc(p)}</p>`).join('')}
    <p class="note">${esc(club.historiaZdroj)}</p>
  </article>
  <aside class="klub-side">
    <img class="klub-crest" src="${R}img/erb-t-400.webp" alt="Erb TJ Slavoj Boleráz" width="200" height="191" loading="lazy">
    <ol class="miles miles--v">${club.historiaMilniky.map((h) => `<li><b>${esc(h.rok)}</b><span>${esc(h.text)}</span></li>`).join('')}</ol>
  </aside>
</div></section>
<section class="sec sec--navy" aria-labelledby="ved-h"><div class="wrap">
  <h2 class="title" id="ved-h">Vedenie klubu</h2>
  <dl class="board">${club.vedenie.map(([f, n]) => `<div><dt>${esc(f)}</dt><dd>${esc(n)}</dd></div>`).join('')}</dl>
  <p class="note note--light">Zdroj: web obce Boleráz. Tréneri a vedúci tímov sú na stránkach <a href="${R}timy/">tímov</a>.</p>
</div></section>
<section class="sec" aria-labelledby="ih-h"><div class="wrap two">
  <div><h2 class="title" id="ih-h">Ihrisko</h2><p><b>${esc(club.ihrisko.nazov)}</b><br>${esc(club.ihrisko.adresa)}</p><p>V osemdesiatych rokoch pribudol bariérový múr, zábradlie okolo hracej plochy, lavičky a garáž pre autobus, areál dopĺňa detské a basketbalové ihrisko.</p><p class="btns"><a class="btn btn--navy" href="${mapsUrl}" rel="noopener">${I.route}Navigovať</a></p></div>
  <div>${photo('tribuna', R, { cls: 'round-img', sizes: '(min-width: 900px) 45vw, 100vw' })}</div>
</div></section>`,
});

add('kontakt/', {
  title: 'Kontakt', active: 'kontakt/', desc: `Kontakt na ${club.nazov}: predseda, tajomník, adresa a fakturačné údaje.`,
  body: (R) => `${head('Kontakt', 'Zápisy detí, zápasy, spolupráca.', R, [[null, 'Kontakt']])}
<section class="sec sec--first"><div class="wrap contact">
  ${club.kontakty.map((k) => `<div class="ccard"><p class="cc-f">${esc(k.funkcia)}</p><p class="cc-n">${esc(k.meno)}</p><p class="btns"><a class="btn btn--navy" href="${tel(k.telefon)}">${I.phone}${esc(k.telefon)}</a>${k.email ? `<a class="btn btn--ghost cc-mail" href="mailto:${k.email}">${I.mail}<span>${esc(k.email).replace('@', '<wbr>@')}</span></a>` : ''}</p></div>`).join('')}
  <div class="ccard ccard--ig"><p class="cc-f">Instagram</p><p class="cc-n">@${esc(club.instagramHandle)}</p><p class="btns"><a class="btn btn--white" href="${club.instagram}" rel="noopener">${I.ig}Sledovať</a></p></div>
</div>
<div class="wrap"><dl class="facts facts--wide"><div><dt>Adresa klubu</dt><dd>${club.adresa.map(esc).join(', ')}</dd></div><div><dt>IČO</dt><dd>${esc(club.ico)}</dd></div><div><dt>Bankový účet</dt><dd class="nw">${esc(club.ucet)}</dd></div></dl>
<p class="note">Kontakty zo starého webu klubu, IČO a účet zo Sportnetu.</p></div></section>`,
});

add('ochrana-sukromia/', {
  title: 'Ochrana súkromia', desc: 'Ako web pracuje s údajmi.',
  body: (R) => `${head('Ochrana súkromia', '', R, [[null, 'Ochrana súkromia']])}
<section class="sec sec--first"><div class="wrap prose">
  <p>Web nepoužíva cookies ani analytiku a nenačítava nič z cudzích serverov. Písmo, erby aj fotky sú uložené priamo na webe.</p>
  <p>Výsledky, strelcov, karty, zostavy a súpisky preberáme zo Sportnetu, kam ich zapisujú kluby a zväzy. Vek hráčov nezverejňujeme, pri mládeži uvádzame len mená a zostavy len pri dospelých. Fotky a texty príspevkov pochádzajú z Instagramu klubu.</p>
  <p>Opravu alebo odstránenie údajov vybavíte na <a href="mailto:${club.kontakty.find((k) => k.email).email}">${esc(club.kontakty.find((k) => k.email).email)}</a>.</p>
</div></section>`,
});
add('404/', {
  title: 'Stránka sa nenašla',
  body: (R) => `${head('Offside', 'Táto stránka neexistuje alebo sa presunula.', R)}<section class="sec sec--first"><div class="wrap"><p class="btns"><a class="btn btn--navy" href="${R}">Na úvod</a><a class="btn btn--ghost" href="${R}zapasy/">Zápasy</a></p></div></section>`,
});

// ---- kalendár (.ics) -----------------------------------------------------------------------------
const icsEsc = (s) => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const icsFold = (line) => { const out = []; let cur = ''; for (const ch of line) { if (Buffer.byteLength(cur + ch) > 74) { out.push(cur); cur = ' ' + ch; } else cur += ch; } out.push(cur); return out.join('\r\n'); };
const VTZ = ['BEGIN:VTIMEZONE', 'TZID:Europe/Bratislava', 'BEGIN:DAYLIGHT', 'TZOFFSETFROM:+0100', 'TZOFFSETTO:+0200', 'TZNAME:CEST', 'DTSTART:19700329T020000', 'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU', 'END:DAYLIGHT', 'BEGIN:STANDARD', 'TZOFFSETFROM:+0200', 'TZOFFSETTO:+0100', 'TZNAME:CET', 'DTSTART:19701025T030000', 'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU', 'END:STANDARD', 'END:VTIMEZONE'];
function ics(list, calName) {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const ev = list.map((m) => {
    const us = m.teamObj.adult ? club.kratky : `${club.kratky} ${m.teamObj.short}`;
    const [h, a] = m.home ? [us, m.opponent] : [m.opponent, us];
    const d = m.date.replace(/-/g, ''), t = (m.time || '').slice(0, 5);
    const when = t ? [`DTSTART;TZID=Europe/Bratislava:${d}T${t.replace(':', '')}00`, 'DURATION:PT2H'] : [`DTSTART;VALUE=DATE:${d}`];
    return ['BEGIN:VEVENT', `UID:zapas-${m.id}@${config.sportnet.club}.sportnet`, `DTSTAMP:${stamp}`, ...when, `SUMMARY:${icsEsc(`${m.teamObj.short}: ${h} – ${a}${m.score ? ` ${m.score}` : ''}`)}`,
      `DESCRIPTION:${icsEsc(`${m.comp}${m.roundName ? `, ${m.roundName}` : ''}`)}`, m.venue && `LOCATION:${icsEsc(m.venue.replace(/\s+/g, ' '))}`, 'END:VEVENT'].filter(Boolean);
  });
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Slavoj Boleraz//Zapasy//SK', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', `X-WR-CALNAME:${icsEsc(calName)}`, 'X-WR-TIMEZONE:Europe/Bratislava', ...VTZ, ...ev.flat(), 'END:VCALENDAR'].map(icsFold).join('\r\n') + '\r\n';
}

// ---- ukážka administrácie (spoločný základ src/admin/admin.js, rovnaký tvar dát ako ok-castkovce / mfk-vrbove) ----
function writeAdminDemo() {
  const R = '../';
  const snById = Object.fromEntries(sn.matches.map((m) => [m.id, m]));
  const people = (t) => t.squad.athletes.map((a) => ({ name: a.name, number: a.nr === '' ? '' : String(a.nr), role: '', photo: null }));
  const al = (a) => ({ slug: a.slug, title: a.title, date: a.date, team: A.slug, count: a.files.length, url: `galeria/${a.slug}/`, cover: `${R}img/foto/${a.files[0].name}-${a.files[0].widths[0]}.webp`, thumbs: a.files.map((f) => `${R}img/foto/${f.name}-${f.widths[0]}.webp`) });
  const demo = {
    club: { nazov: club.kratky, crest: `${R}img/erb-t-192.webp` }, updated: sn.updated, season: sn.season,
    teams: teams.map((t) => ({ slug: t.slug, short: t.short, sub: t.adult ? 'Muži' : t.sub })),
    matches: matches.map((m) => {
      const a = albumFor(m);
      return { id: m.id, team: m.team, date: m.date, time: m.time, home: m.home, opponent: m.opponent, competition: m.comp, part: '', round: (/\d+/.exec(m.round) || [''])[0], played: m.past, score: m.score, goals: m.goals, cards: m.cards || [], venue: (m.venue || '').replace(/\s+/g, ' '), url: snById[m.id]?.url || null, gallery: a ? { url: `galeria/${a.slug}/`, count: a.files.length, thumbs: a.files.slice(0, 5).map((f) => `${R}img/foto/${f.name}-${f.widths[0]}.webp`) } : null, video: null };
    }),
    rosters: Object.fromEntries(teams.map((t) => [t.slug, people(t).map(({ name, number, photo }) => ({ name, number, photo }))])),
    news: posts.filter((p) => p.text).map((p) => ({ id: p.code, title: p.text.split('\n').find((l) => l.trim() && !/^SEZÓNA/.test(l))?.replace(/[^\p{L}\p{N}\s.,!?–-]/gu, '').trim() || 'Príspevok', date: p.date, img: `${R}img/foto/ig-${p.code}-${p.widths[0]}.webp`, excerpt: '', body: `<p>${igText(p.text)}</p>` })),
    info: { nazov: club.nazov, pravnyNazov: club.nazov, adresa: club.adresa, osoba: club.kontakty[0].meno, telefon: club.kontakty[0].telefon, email: club.kontakty.find((k) => k.email).email, facebook: club.instagram, ico: club.ico, ucet: club.ucet, stadion: { nazov: club.ihrisko.nazov, kapacita: '', rozmery: '', vip: '' } },
    allTeams: teams.map((t) => ({ slug: t.slug, short: t.short, sub: t.adult ? 'Muži' : t.sub, league: t.leagueName, url: t.url, photo: null, groups: [{ title: 'Hráči', people: people(t) }, { title: 'Realizačný tím', people: t.squad.crew.map((c) => ({ name: c.name, number: '', role: crewRole[c.role] || crewRole.other, photo: null })) }] })),
    coaches: [],
    pages: {
      historia: { title: 'História', url: 'klub/', html: club.historiaOdseky.map((p) => `<p>${esc(p)}</p>`).join('') },
      vedenie: { title: 'Vedenie klubu', url: 'klub/', html: `<ul>${club.vedenie.map(([f, n]) => `<li><b>${esc(f)}:</b> ${esc(n)}</li>`).join('')}</ul>` },
      'ochrana-sukromia': { title: 'Ochrana súkromia', url: 'ochrana-sukromia/', html: '<p>Web nepoužíva cookies ani analytiku.</p>' },
    },
    home: { heroTitle: winter ? `Jeseň na ${A.pos}. mieste` : `${A.pos}. miesto v tabuľke`, heroText: `${plural(aRec.w, 'výhra', 'výhry', 'výhier')}, ${plural(aRec.d, 'remíza', 'remízy', 'remíz')} a ${plural(aRec.l, 'prehra', 'prehry', 'prehier')} v lige.`, hero: `${R}img/foto/hero-${foto.named.hero?.widths[0]}.webp`, stadion: { title: `Od roku ${club.zalozenie}`, text: club.historiaUvod } },
    galleries: foto.albums.map(al), videos: [], fanshop: { pozn: '', email: '', produkty: [] }, partners: [],
  };
  fs.writeFileSync(path.join(OUT, 'admin', 'demo.json'), JSON.stringify(demo));
}

// ---- zápis -------------------------------------------------------------------------------------
fs.mkdirSync(OUT, { recursive: true });
for (const f of fs.readdirSync(OUT)) fs.rmSync(path.join(OUT, f), { recursive: true, force: true });
const copy = (from, to) => { if (fs.existsSync(from)) fs.cpSync(from, to, { recursive: true }); };
copy(path.join(SRC, 'img'), path.join(OUT, 'img'));
copy(path.join(SRC, 'fonts'), path.join(OUT, 'fonts'));
copy(path.join(SRC, 'js'), path.join(OUT, 'js'));
if (config.adminDemo !== false && fs.existsSync(path.join(SRC, 'admin', 'index.html'))) { copy(path.join(SRC, 'admin'), path.join(OUT, 'admin')); writeAdminDemo(); }
fs.rmSync(path.join(OUT, 'fonts', 'fonts.css'), { force: true });
fs.mkdirSync(path.join(OUT, 'css'), { recursive: true });
fs.writeFileSync(path.join(OUT, 'css', 'site.css'), fs.readFileSync(path.join(SRC, 'fonts', 'fonts.css'), 'utf8').replace(/url\(([^)]+)\)/g, 'url(../fonts/$1)') + fs.readFileSync(path.join(SRC, 'css', 'site.css'), 'utf8'));
for (const p of pages) {
  const depth = p.route.split('/').filter(Boolean).length;
  const R = depth ? '../'.repeat(depth) : './';
  const file = path.join(OUT, p.route, 'index.html');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, layout({ ...p, body: p.body(R) }));
}
const BASE = process.env.BASE_PATH || config.basePath || '/';
fs.writeFileSync(path.join(OUT, '404.html'), fs.readFileSync(path.join(OUT, '404', 'index.html'), 'utf8').replace(/(href|src|data-root)="(\.\.\/)+/g, `$1="${BASE}`));
fs.writeFileSync(path.join(OUT, '.nojekyll'), '');
fs.writeFileSync(path.join(OUT, '.gitattributes'), '*.ics -text\n');
fs.mkdirSync(path.join(OUT, 'kalendar'), { recursive: true });
for (const t of teams) fs.writeFileSync(path.join(OUT, 'kalendar', `${t.slug}.ics`), ics(teamMatches(t.slug), `${club.kratky} – ${t.full}`));
fs.writeFileSync(path.join(OUT, 'kalendar', 'vsetky.ics'), ics(matches, `${club.kratky} – všetky zápasy`));
for (const m of upcoming) fs.writeFileSync(path.join(OUT, 'kalendar', `zapas-${m.id}.ics`), ics([m], `${club.kratky} – ${m.teamObj.full}`));
console.log(`Hotovo: ${pages.length} stránok -> dist/ (dnes = ${TODAY})`);
