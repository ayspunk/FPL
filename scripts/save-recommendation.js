// Menyimpan rekomendasi line-up (formasi terbaik) untuk GW depan ke data/recommendations.json.
// Memakai mesin skor yang sama dengan dashboard (app.js) supaya Evaluasi Poin bisa menilai
// rekomendasi ASLI, bukan hasil hitung ulang. Rekomendasi GW yang sudah tersimpan tidak ditimpa
// setelah deadline-nya lewat (selama sebelum deadline, dihitung ulang agar mengikuti berita cedera/harga).
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..'), DATA = path.join(ROOT, 'data');
const rd = f => JSON.parse(fs.readFileSync(path.join(DATA, f), 'utf8'));

const noop = () => {};
const el = new Proxy(function(){}, { get: (t, k) => k === 'style' || k === 'classList' || k === 'dataset' ? new Proxy({}, { get: () => noop }) : k === 'value' ? '' : noop, apply: () => el });
const store = {};
const sandbox = {
  console, setTimeout, clearTimeout, setInterval: () => 0, clearInterval: noop, URL, fetch: async () => { throw new Error('no net'); },
  localStorage: { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; }, key: i => Object.keys(store)[i], get length() { return Object.keys(store).length; } },
  document: { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], addEventListener: noop, createElement: () => el, body: el, documentElement: el },
  navigator: { userAgent: 'node', serviceWorker: undefined }, location: { href: '', search: '', hash: '', origin: '' },
  addEventListener: noop, matchMedia: () => ({ matches: false, addEventListener: noop }),
};
sandbox.window = sandbox; sandbox.globalThis = sandbox; sandbox.self = sandbox;
vm.createContext(sandbox);
let src = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8').replace(/\nApp\.init\(\);\s*$/, '\n');
vm.runInContext(src + '\n;this.__app={Store,Process,CFG};', sandbox, { filename: 'app.js' });
const { Store, Process } = sandbox.__app;

const bs = rd('bootstrap.json'), fixtures = rd('fixtures.json');
const cur = bs.events.find(e => e.is_current), next = bs.events.find(e => e.is_next);
if (!next) { console.log('Tidak ada GW depan — lewati'); process.exit(0); }
Store.bootstrap = bs; Store.fixtures = fixtures;
Store.currentGW = cur ? cur.id : next.id - 1;
Store.targetGW = 0;
const { players } = Process.fromBootstrap(bs, fixtures, null);
Store.players = players;
Process.applyScores(players);
const fm = Store.formations[0];
if (!fm) { console.log('Formasi kosong — lewati'); process.exit(0); }

const pick = p => ({ id: p.id, name: p.Player, pos: p.Position, team: p.Team, opp: p.opponent || null, score: p.GWScore, price: p.Price });
const rec = {
  formation: fm.name, total: fm.total, deadline: next.deadline_time, savedAt: new Date().toISOString(),
  captain: fm.cap ? fm.cap.id : null, vice: fm.vc ? fm.vc.id : null,
  xi: fm.all.map(pick), bench: (fm.bench || []).map(pick),
  formations: Store.formations.map(f => ({ name: f.name, total: f.total, rank: f.rank })),
};
const file = path.join(DATA, 'recommendations.json');
const all = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
const old = all[next.id];
if (old && new Date(old.deadline) <= new Date()) { console.log(`GW${next.id} sudah lewat deadline — tidak ditimpa`); process.exit(0); }
all[next.id] = rec;
fs.writeFileSync(file, JSON.stringify(all));
console.log(`✅ Rekomendasi GW${next.id}: ${rec.formation} (${rec.total}), ${rec.xi.length} pemain`);
