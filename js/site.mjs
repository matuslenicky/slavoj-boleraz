// Slavoj Boleráz: filtre zápasov, kalendár, prehliadač fotiek (bez knižníc).
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];

// ---- filtre zápasov podľa tímu (?tim=…) ----
const filters = $('[data-filters]');
if (filters) {
  filters.hidden = false;
  let team = new URLSearchParams(location.search).get('tim') || '';
  if (!$(`[data-f-team="${CSS.escape(team)}"]`)) team = '';
  const apply = () => {
    $$('[data-f-team]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.fTeam === team)));
    for (const li of $$('.row[data-team]')) li.hidden = !!team && li.dataset.team !== team;
    for (const m of $$('[data-month]')) m.hidden = !$$('.row', m).some((li) => !li.hidden);
    for (const col of $$('.two--list > section')) { const e = $('[data-empty]', col); if (e) e.hidden = $$('.row', col).some((li) => !li.hidden); }
    history.replaceState(null, '', team ? `?tim=${team}` : location.pathname);
  };
  filters.addEventListener('click', (e) => { const b = e.target.closest('[data-f-team]'); if (b) { team = b.dataset.fTeam; apply(); } });
  apply();
}

// ---- kalendár: odber cez webcal a Google (potrebujú úplnú adresu) ----
for (const box of $$('[data-cal]')) {
  const abs = new URL($('[data-ics]', box).getAttribute('href'), location.href);
  if (!/^https?:$/.test(abs.protocol) || /^(localhost|127\.)/.test(abs.hostname)) continue;
  const webcal = abs.href.replace(/^https?:/, 'webcal:');
  const w = $('[data-webcal]', box), g = $('[data-gcal]', box);
  w.href = webcal; w.hidden = false;
  g.href = `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal)}`; g.hidden = false;
}
document.addEventListener('click', (e) => { $$('[data-cal][open]').forEach((d) => { if (!d.contains(e.target)) d.open = false; }); });
// Tab z ponuky von ju zavrie (inak ostane visieť nad obsahom)
$$('[data-cal]').forEach((d) => d.addEventListener('focusout', (e) => { if (e.relatedTarget && !d.contains(e.relatedTarget)) d.open = false; }));
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') $$('[data-cal][open]').forEach((d) => { d.open = false; $('summary', d).focus(); }); });

// ---- prehliadač fotiek (<dialog>), šípky a potiahnutie prstom ----
const galleries = $$('[data-gallery]');
if (galleries.length && 'HTMLDialogElement' in window) {
  const svg = (p) => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
  const dlg = document.createElement('dialog');
  dlg.className = 'lb';
  dlg.setAttribute('aria-label', 'Fotka');
  dlg.innerHTML = `<p class="lb-n" aria-live="polite"></p><img alt=""><button class="lb-btn lb-x" type="button" aria-label="Zavrieť">${svg('<path d="M6 6l12 12M18 6 6 18"/>')}</button><button class="lb-btn lb-prev" type="button" aria-label="Predchádzajúca fotka">${svg('<path d="m15 6-6 6 6 6"/>')}</button><button class="lb-btn lb-next" type="button" aria-label="Ďalšia fotka">${svg('<path d="m9 6 6 6-6 6"/>')}</button>`;
  document.body.append(dlg);
  const img = $('img', dlg), n = $('.lb-n', dlg);
  let list = [], i = 0, opener = null;
  const show = () => { const a = list[i]; img.src = a.href; img.alt = $('img', a).alt; n.textContent = `${i + 1} / ${list.length}`; };
  const go = (d) => { i = (i + d + list.length) % list.length; show(); };
  galleries.forEach((g) => g.addEventListener('click', (e) => {
    const a = e.target.closest('a[data-lb]'); if (!a) return;
    e.preventDefault(); list = $$('a[data-lb]', g); i = list.indexOf(a); opener = a; show(); dlg.showModal();
  }));
  $('.lb-x', dlg).onclick = () => dlg.close();
  $('.lb-prev', dlg).onclick = () => go(-1);
  $('.lb-next', dlg).onclick = () => go(1);
  dlg.addEventListener('keydown', (e) => { if (e.key === 'ArrowLeft') go(-1); if (e.key === 'ArrowRight') go(1); });
  dlg.addEventListener('close', () => opener?.focus());
  let x0 = null;
  dlg.addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; }, { passive: true });
  dlg.addEventListener('touchend', (e) => { if (x0 == null) return; const dx = e.changedTouches[0].clientX - x0; if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1); x0 = null; });
}

// ---- hľadanie hráča vo večnej štatistike ----
const find = $('[data-find]');
if (find) {
  find.hidden = false;
  const input = $('[data-find-input]', find), statRows = $$('#stat-t tbody tr'), empty = $('[data-find-empty]');
  const plain = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  input.addEventListener('input', () => {
    const q = plain(input.value.trim()).replace(/\s+/g, '-');
    let n = 0;
    for (const r of statRows) { const show = !q || r.dataset.name.includes(q); r.hidden = !show; if (show) n++; }
    if (empty) empty.hidden = n > 0;
  });
}
