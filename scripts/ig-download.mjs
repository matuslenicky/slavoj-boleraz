// Fotky z príspevkov Instagramu klubu -> media/ig/<kód>/<n>.jpg (zoznam z media/ig-posts.json, zbiera Playwright MCP bez prihlásenia)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let posts = JSON.parse(fs.readFileSync(path.join(ROOT, 'media', 'ig-posts.json'), 'utf8'));
if (typeof posts === 'string') posts = JSON.parse(posts);
for (const p of posts) {
  const dir = path.join(ROOT, 'media', 'ig', p.code.replace('reel/', 'reel-'));
  fs.mkdirSync(dir, { recursive: true });
  const list = p.imgs.length ? p.imgs.map((i) => i.src) : [p.ogimg];
  let n = 0;
  for (const u of list) {
    n++;
    const f = path.join(dir, `${n}.jpg`);
    if (fs.existsSync(f)) continue;
    const r = await fetch(u, { headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://www.instagram.com/' } });
    if (!r.ok) { console.warn('chyba', r.status, p.code, n); continue; }
    fs.writeFileSync(f, Buffer.from(await r.arrayBuffer()));
  }
  console.log(p.code, n, 'súborov');
}
