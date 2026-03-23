/* ══════════════════════════════════════════════════════════════════
   FPL Dashboard — app.js  v3.0
   Sumber data utama: FPL API (semua 9 endpoint)
   Fallback: Google Sheets (untuk data pre-computed dari Excel)
   ══════════════════════════════════════════════════════════════════ */

// ═══════════════════════════════════════════════════════
// 1. CONFIG
// ═══════════════════════════════════════════════════════
const CFG = {
  leagues: [
    { name: 'Lantai 3 TU P2B League',  id: 611927  },
    { name: 'P2B Super League',         id: 24873   },
    { name: 'Tugas Belajar PLN League', id: 2150310 },
  ],
  myTeamId:     2414649,      // FPL entry/team ID user
  myTeamName:   'r00kie',     // nama tim untuk highlight (auto-detected from API)
  minMinutes:   450,
  maxPerTeam:   3,
  sheetsUrl:    '',
  selectedLeagueIdx: 0,
  // GitHub Pages JSON (same-origin, no CORS needed!)
  // Set to '' to disable, or auto-detect from window.location
  githubDataUrl: '',
  FPL: 'https://fantasy.premierleague.com/api/',
  PROXIES: [
    u => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(u)}`,
    u => `https://corsproxy.org/?url=${encodeURIComponent(u)}`,
    u => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
  ],
  GW_WEIGHTS: {
    'fdr_short':       { GK:.35, DEF:.30, MID:.30, FWD:.35 },
    'home':            { GK:.15, DEF:.10, MID:.10, FWD:.15 },
    'ppg':             { GK:.30, DEF:.30, MID:.30, FWD:.25 },
    'xgi':             { GK:.00, DEF:.10, MID:.20, FWD:.25 },
    'xgc':             { GK:.00, DEF:.20, MID:.10, FWD:.00 },
    'saves':           { GK:.20, DEF:.00, MID:.00, FWD:.00 },
    'dgw_blank':       { GK:.00, DEF:.00, MID:.00, FWD:.00 },
  },
  SCOUT_WEIGHTS: {
    'fdr_short':       {GK:.15,DEF:.15,MID:.15,FWD:.15},
    'home':            {GK:.10,DEF:.05,MID:.05,FWD:.05},
    'form':            {GK:.15,DEF:.10,MID:.15,FWD:.15},
    'ppg':             {GK:.20,DEF:.15,MID:.10,FWD:.10},
    'xgi':             {GK:.00,DEF:.10,MID:.10,FWD:.20},
    'xgc':             {GK:.00,DEF:.15,MID:.10,FWD:.00},
    'saves':           {GK:.15,DEF:.00,MID:.00,FWD:.00},
    'ict_index':       {GK:.00,DEF:.05,MID:.10,FWD:.10},
    'value_form':      {GK:.02,DEF:.02,MID:.02,FWD:.02},
    'net_transfers':   {GK:.08,DEF:.08,MID:.08,FWD:.08},
    'yellow_cards':    {GK:.05,DEF:.05,MID:.05,FWD:.05},
    'dgw_blank':       {GK:.00,DEF:.00,MID:.00,FWD:.00},
    'ep_next':         {GK:.10,DEF:.10,MID:.10,FWD:.10},
  },
};

const MANAGER_COLORS = [
  '#00e676','#448aff','#ffd740','#ff5252','#ce93d8',
  '#80cbc4','#ffcc80','#90caf9','#a5d6a7','#ef9a9a',
  '#ffe082','#b39ddb','#80deea','#f48fb1','#c5e1a5',
  '#ffab40','#84ffff','#ea80fc','#ff8a65','#b0bec5',
];

// ═══════════════════════════════════════════════════════
// CRITERIA CATALOG — all available scoring criteria
// type: 'per90'=per 90min normalized, 'direct'=raw normalized, 'computed'=pre-computed, 'inverse_per90'/'inverse_direct'=lower is better
// posAuto: suggested default weights per position {GK,DEF,MID,FWD} — user can override
// ═══════════════════════════════════════════════════════
const CRITERIA = [
  // ── Computed (fixture-based) ──
  {key:'fdr_short',    label:'FDR Jangka Pendek',   group:'Fixture', type:'computed', field:null, tip:'Skor FDR lawan di GW target saja. Rendah = lawan mudah.'},
  {key:'fdr_multi',    label:'FDR Multi-GW',         group:'Fixture', type:'computed', field:null, tip:'Rata-rata FDR lawan untuk N GW ke depan (diatur via slider Horizon).'},
  {key:'home',         label:'Home Advantage',       group:'Fixture', type:'computed', field:null, tip:'Bermain di kandang (10) atau tandang (5).'},
  {key:'dgw_blank',    label:'DGW / Blank',          group:'Fixture', type:'computed', field:null, tip:'Double GW (+10) atau Blank GW (-10). Normal = 0.'},
  // ── Performance ──
  {key:'total_points', label:'Total Points',         group:'Performance', type:'direct',  field:'total_points', tip:'Akumulasi poin sepanjang musim.'},
  {key:'round_points', label:'Round Points',         group:'Performance', type:'direct',  field:'event_points', tip:'Poin yang didapat di GW terakhir.'},
  {key:'ppg',          label:'Points Per Game',      group:'Performance', type:'direct',  field:'points_per_game', tip:'Rata-rata poin per pertandingan musim ini.'},
  {key:'form',         label:'Form',                 group:'Performance', type:'direct',  field:'form', tip:'Rata-rata poin dari 5 GW terakhir.'},
  {key:'ep_next',      label:'Expected Points',      group:'Performance', type:'direct',  field:'ep_next', tip:'Prediksi poin FPL untuk GW berikutnya.'},
  {key:'bonus',        label:'Bonus',                group:'Performance', type:'per90',   field:'bonus', tip:'Bonus poin per 90 menit bermain.'},
  {key:'bps',          label:'Bonus Pts System',     group:'Performance', type:'per90',   field:'bps', tip:'Skor sistem BPS per 90 menit. Menentukan bonus 1-3.'},
  // ── Attacking ──
  {key:'goals_scored', label:'Goals Scored',         group:'Attacking',   type:'per90',   field:'goals_scored', tip:'Gol per 90 menit bermain.'},
  {key:'assists',      label:'Assists',              group:'Attacking',   type:'per90',   field:'assists', tip:'Assist per 90 menit bermain.'},
  {key:'xg',           label:'xG (Total)',           group:'Attacking',   type:'per90',   field:'expected_goals', tip:'Expected Goals per 90 menit. Peluang gol dari posisi tembakan.'},
  {key:'xa',           label:'xA (Total)',           group:'Attacking',   type:'per90',   field:'expected_assists', tip:'Expected Assists per 90 menit. Peluang assist dari umpan.'},
  {key:'xgi',          label:'xGI (Total)',          group:'Attacking',   type:'per90',   field:'expected_goal_involvements', tip:'Expected Goal Involvements per 90. xG + xA gabungan.'},
  // ── Defending ──
  {key:'clean_sheets', label:'Clean Sheets',         group:'Defending',   type:'per90',   field:'clean_sheets', tip:'Clean sheet per 90 menit. Utama untuk GK/DEF.'},
  {key:'goals_conceded',label:'Goals Conceded',      group:'Defending',   type:'inverse_per90', field:'goals_conceded', tip:'Gol kebobolan per 90. Inverse: sedikit kebobolan = skor tinggi.'},
  {key:'xgc',          label:'xGC (Total)',          group:'Defending',   type:'inverse_per90', field:'expected_goals_conceded', tip:'Expected Goals Conceded per 90. Inverse: sedikit = skor tinggi.'},
  {key:'own_goals',    label:'Own Goals',            group:'Defending',   type:'inverse_per90', field:'own_goals', tip:'Gol bunuh diri per 90. Inverse: nol = skor tinggi.'},
  {key:'penalties_saved',label:'Penalties Saved',    group:'Defending',   type:'per90',   field:'penalties_saved', tip:'Penalti yang diselamatkan per 90 menit. Khusus GK.'},
  {key:'saves',        label:'Saves',                group:'Defending',   type:'per90',   field:'saves', tip:'Jumlah penyelamatan per 90 menit. Utama untuk GK.'},
  // ── Creativity & Threat ──
  {key:'influence',    label:'Influence',            group:'ICT',         type:'direct',  field:'influence', tip:'Skor pengaruh terhadap hasil pertandingan. Bagian dari ICT.'},
  {key:'creativity',   label:'Creativity',           group:'ICT',         type:'direct',  field:'creativity', tip:'Skor kreativitas menciptakan peluang. Bagian dari ICT.'},
  {key:'threat',       label:'Threat',               group:'ICT',         type:'direct',  field:'threat', tip:'Skor ancaman mencetak gol. Bagian dari ICT.'},
  {key:'ict_index',    label:'ICT Index',            group:'ICT',         type:'direct',  field:'ict_index', tip:'Influence + Creativity + Threat gabungan dari FPL.'},
  // ── Discipline ──
  {key:'yellow_cards', label:'Yellow Cards',         group:'Discipline',  type:'inverse_per90', field:'yellow_cards', tip:'Kartu kuning per 90. Inverse: sedikit = skor tinggi. Risiko suspensi.'},
  {key:'red_cards',    label:'Red Cards',            group:'Discipline',  type:'inverse_per90', field:'red_cards', tip:'Kartu merah per 90. Inverse: nol = skor tinggi.'},
  {key:'penalties_missed',label:'Penalties Missed',  group:'Discipline',  type:'inverse_per90', field:'penalties_missed', tip:'Penalti gagal per 90. Inverse: nol = skor tinggi.'},
  // ── Value & Ownership ──
  {key:'price',        label:'Price',                group:'Value',       type:'inverse_direct', field:'now_cost', transform: v=>v/10, tip:'Harga pemain. Inverse: murah = skor tinggi (value pick).'},
  {key:'value_form',   label:'Value (Form)',         group:'Value',       type:'direct',  field:'value_form', tip:'Rasio form/harga. Tinggi = value bagus berdasarkan performa terkini.'},
  {key:'value_season', label:'Value (Season)',       group:'Value',       type:'direct',  field:'value_season', tip:'Rasio total poin/harga musim ini.'},
  {key:'tsb',          label:'Selected By %',        group:'Value',       type:'direct',  field:'selected_by_percent', tip:'Persentase manajer FPL yang memilih pemain ini.'},
  // ── Transfers ──
  {key:'transfers_in', label:'Transfers In (round)', group:'Transfers',   type:'direct',  field:'transfers_in_event', tip:'Jumlah transfer masuk GW ini. Indikator popularitas.'},
  {key:'transfers_out',label:'Transfers Out (round)',group:'Transfers',   type:'inverse_direct', field:'transfers_out_event', tip:'Jumlah transfer keluar GW ini. Inverse: sedikit keluar = stabil.'},
  {key:'net_transfers',label:'Net Transfers (round)',group:'Transfers',   type:'direct',  field:null, compute: p => (+p.transfers_in_event||0) - (+p.transfers_out_event||0), tip:'Selisih transfer in - out. Positif = banyak diminati.'},
  {key:'cost_change',  label:'Price Change (round)', group:'Transfers',   type:'direct',  field:'cost_change_event', tip:'Perubahan harga GW ini. Positif = naik harga.'},
  // ── Minutes ──
  {key:'minutes',      label:'Minutes Played',       group:'Other',       type:'direct',  field:'minutes', tip:'Total menit bermain musim ini. Indikator keamanan menit.'},
  {key:'starts',       label:'Starts',               group:'Other',       type:'direct',  field:'starts', tip:'Jumlah start (dimainkan dari awal) musim ini.'},
];

const CRITERIA_MAP = {};
CRITERIA.forEach(c => { CRITERIA_MAP[c.key] = c; });

// ═══════════════════════════════════════════════════════
// 2. STORE
// ═══════════════════════════════════════════════════════
const Store = {
  // Players & formations
  players:       [],
  scoredPlayers: [],
  formations:    [],
  selectedForm:  0,
  posFilter:     'ALL',
  searchQuery:   '',
  subtab:        {},

  // FPL raw data
  bootstrap:     null,   // bootstrap-static
  fixtures:      null,   // fixtures
  liveEvent:     null,   // event/{GW}/live  (current GW live stats)
  leagueData:    null,   // leagues-classic/{ID}/standings
  managerInfos:  {},     // {entryId: entry data}        ← entry/{TID}/
  managerHistory:{},     // {entryId: history data}       ← entry/{TID}/history
  managerTransfers:{},   // {entryId: transfers}          ← entry/{TID}/transfers
  leaguePicks:     {},   // {entryId: picks}              ← entry/{TID}/event/{GW}/picks
  playerFixtures:{},     // {elementId: element-summary}  ← element-summary/{EID}/
  myManagerInfo: null,   // entry/{myTeamId}/
  myPicks:       null,   // entry/{TID}/event/{GW}/picks
  myTransfers:   null,   // entry/{TID}/transfers

  // Sheets (fallback / pre-computed)
  sheetsData:    null,

  // State
  currentGW:     null,
  targetGW:      0,     // 0 = auto (next GW), otherwise user-selected GW
  fdrHorizon:    3,     // number of GWs ahead for FDR multi-GW (1-8)
  optimizeLookback: 5, // GWs to look back for optimizer
  dataSource:    null,   // 'fpl' | 'sheets' | null
  gwWeights:     JSON.parse(JSON.stringify(CFG.GW_WEIGHTS)),
  activeGW:      null,    // active criteria keys for lineup (loaded from localStorage)
  activeScout:   null,    // active criteria keys for scout
  scoutWeights:  null,   // initialized in UI.loadSettings
  chartInstances:{},
  loadProgress:  { done:0, total:0 },
};

// ═══════════════════════════════════════════════════════
// 3. CACHE
// TTL: STATIC 6j | LEAGUE 30m | LIVE 5m | SHEETS 15m
// Storage: localStorage dengan auto-evict saat penuh
// ═══════════════════════════════════════════════════════
const Cache = {
  TTL:    { STATIC: 6*3600e3, LEAGUE: 30*60e3, LIVE: 5*60e3, SHEETS: 15*60e3 },
  PREFIX: 'fplDash_v1_',

  _k(url) {
    return this.PREFIX + btoa(unescape(encodeURIComponent(url))).slice(0,48).replace(/[+/=]/g,'_');
  },

  get(url) {
    try {
      const raw = localStorage.getItem(this._k(url));
      if (!raw) return null;
      const item = JSON.parse(raw);
      if (Date.now() - item.ts > item.ttl) { localStorage.removeItem(this._k(url)); return null; }
      return { data: item.data, ageMs: Date.now() - item.ts };
    } catch { return null; }
  },

  set(url, data, ttl = Cache.TTL.STATIC) {
    const val = JSON.stringify({ data, ts: Date.now(), ttl });
    try { localStorage.setItem(this._k(url), val); }
    catch { this._evict(); try { localStorage.setItem(this._k(url), val); } catch {} }
  },

  invalidate(url) { try { localStorage.removeItem(this._k(url)); } catch {} },

  _evict() {
    const entries = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k?.startsWith(this.PREFIX)) continue;
      try { entries.push({ k, ts: JSON.parse(localStorage.getItem(k)).ts }); } catch {}
    }
    entries.sort((a,b)=>a.ts-b.ts).slice(0, Math.ceil(entries.length/2))
           .forEach(e => localStorage.removeItem(e.k));
  },

  clear(match = '') {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith(this.PREFIX + match)) keys.push(k);
    }
    keys.forEach(k => localStorage.removeItem(k));
    return keys.length;
  },

  stats() {
    let count = 0, bytes = 0, expired = 0;
    const now = Date.now();
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k?.startsWith(this.PREFIX)) continue;
      count++; bytes += (localStorage.getItem(k)||'').length * 2;
      try { const item = JSON.parse(localStorage.getItem(k)); if (now-item.ts>item.ttl) expired++; } catch {}
    }
    return { count, kb: Math.round(bytes/1024), expired };
  },

  ageLabel(ms) {
    if (!ms) return '-';
    if (ms < 60e3)   return Math.round(ms/1e3) + 'd lalu';
    if (ms < 3600e3) return Math.round(ms/60e3) + 'm lalu';
    return (ms/3600e3).toFixed(1) + 'j lalu';
  },

  endpointTTL(path) {
    if (path.includes('bootstrap-static') || path.includes('fixtures')) return Cache.TTL.STATIC;
    if (path.includes('/live') || path.includes('/picks'))               return Cache.TTL.LIVE;
    return Cache.TTL.LEAGUE;
  },
};

// ═══════════════════════════════════════════════════════
// 4. FETCH LAYER  (semua request melalui Cache)
// ═══════════════════════════════════════════════════════
const Fetch = {
  _lastWorkingProxy: 0, // index into CFG.PROXIES
  _requestCount: 0,

  async _net(url, timeout = 12000) {
    const errors = [];
    this._requestCount++;

    // Build proxy order: last working first, then others
    const order = [this._lastWorkingProxy];
    for (let i = 0; i < CFG.PROXIES.length; i++) {
      if (i !== this._lastWorkingProxy) order.push(i);
    }

    for (const idx of order) {
      const px = CFG.PROXIES[idx];
      if (!px) continue;
      const fetchUrl = px(url);
      const label = `proxy#${idx+1}`;
      try {
        const r = await fetch(fetchUrl, { signal: AbortSignal.timeout(timeout) });
        if (r.ok) {
          const text = await r.text();
          try {
            let data = JSON.parse(text);
            // Unwrap common proxy wrappers
            if (data && data.contents && typeof data.contents === 'string') {
              try { data = JSON.parse(data.contents); } catch {}
            } else if (data && data.contents && typeof data.contents === 'object') {
              data = data.contents;
            }
            this._lastWorkingProxy = idx;
            return data;
          } catch {
            errors.push(`${label}: invalid JSON`);
          }
        } else {
          errors.push(`${label}: HTTP ${r.status}`);
        }
      } catch (e) {
        errors.push(`${label}: ${e.name||e.message}`);
      }
    }

    console.warn(`[FPL] ✗ All failed for ${url.split('/').slice(-3).join('/')}:`, errors.join(', '));
    Store._lastFetchErrors = errors;
    return null;
  },

  async fpl(path, forceFresh = false) {
    const url = CFG.FPL + path;
    const ttl = Cache.endpointTTL(path);
    if (!forceFresh) {
      const hit = Cache.get(url);
      if (hit) {
        Store.cacheHits = (Store.cacheHits||0) + 1;
        UI.showCacheBadge(hit.ageMs);
        return hit.data;
      }
    }
    Store.cacheMisses = (Store.cacheMisses||0) + 1;
    const data = await this._net(url);
    if (data) Cache.set(url, data, ttl);
    return data;
  },

  async batch(tasks, concurrency = 5, delayMs = 0) {
    const results = new Array(tasks.length).fill(null);
    let idx = 0;
    const run = async () => {
      while (idx < tasks.length) {
        const i = idx++;
        if (delayMs > 0) await new Promise(r => setTimeout(r, delayMs));
        try { results[i] = await tasks[i](); } catch {}
        Store.loadProgress.done++;
        UI.updateProgress();
      }
    };
    await Promise.all(Array.from({ length: concurrency }, run));
    return results;
  },

  async sheets(url) {
    if (!url) return null;
    const hit = Cache.get(url);
    if (hit) return hit.data;
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (!r.ok) {
        console.warn(`[Sheets] HTTP ${r.status} for ${url.slice(0,60)}…`);
        return null;
      }
      const text = await r.text();

      // Try JSON first (Apps Script Web App)
      try {
        const d = JSON.parse(text);
        console.log(`[Sheets] ✓ JSON parsed OK`);
        Cache.set(url, d, Cache.TTL.SHEETS);
        return d;
      } catch {}

      // Try CSV parsing (Google Sheets gviz/tq?tqx=out:csv)
      if (text.includes(',') && (text.includes('\n') || text.includes('\r'))) {
        console.log(`[Sheets] Attempting CSV parse…`);
        const parsed = this._parseCSV(text);
        if (parsed?.length) {
          const d = { players: parsed, meta: { gw: Store.currentGW || '?' } };
          console.log(`[Sheets] ✓ CSV parsed: ${parsed.length} rows`);
          Cache.set(url, d, Cache.TTL.SHEETS);
          return d;
        }
      }

      console.warn(`[Sheets] Could not parse response (not JSON, not valid CSV). First 200 chars:`, text.slice(0,200));
      return null;
    } catch (e) {
      console.warn(`[Sheets] Fetch error:`, e.message);
      return null;
    }
  },

  // Simple CSV parser for Google Sheets export
  _parseCSV(text) {
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) return null;

    // Parse header
    const headers = this._csvSplitRow(lines[0]);
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
      const vals = this._csvSplitRow(lines[i]);
      if (vals.length < 2) continue;
      const obj = {};
      headers.forEach((h, j) => {
        let v = vals[j] ?? '';
        // Auto-convert numbers
        if (v !== '' && !isNaN(v)) v = +v;
        obj[h.trim()] = v;
      });
      rows.push(obj);
    }
    return rows;
  },

  _csvSplitRow(line) {
    const result = [];
    let current = '', inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"' && line[i+1] === '"') { current += '"'; i++; }
        else if (ch === '"') { inQuotes = false; }
        else { current += ch; }
      } else {
        if (ch === '"') { inQuotes = true; }
        else if (ch === ',') { result.push(current); current = ''; }
        else { current += ch; }
      }
    }
    result.push(current);
    return result;
  },

  bootstrap()          { return this.fpl('bootstrap-static/'); },
  fixtures()           { return this.fpl('fixtures/'); },
  liveEvent(gw)        { return this.fpl('event/' + gw + '/live/'); },
  leagueStandings(lid, page=1) {
    return this.fpl('leagues-classic/' + lid + '/standings/?page_standings=' + page);
  },
  managerInfo(tid)     { return this.fpl('entry/' + tid + '/'); },
  managerHistory(tid)  { return this.fpl('entry/' + tid + '/history/'); },
  managerTransfers(tid){ return this.fpl('entry/' + tid + '/transfers/'); },
  managerPicks(tid,gw) { return this.fpl('entry/' + tid + '/event/' + gw + '/picks/'); },
  playerSummary(eid)   { return this.fpl('element-summary/' + eid + '/'); },

  // force-fresh (bypass cache untuk data live)
  forceBootstrap()  { return this.fpl('bootstrap-static/', true); },
  forceLive(gw)     { return this.fpl('event/' + gw + '/live/', true); },

  // GitHub Pages JSON (same-origin, no CORS proxy needed)
  async githubJSON(filename) {
    const base = CFG.githubDataUrl || this._detectGithubBase();
    if (!base) return null;
    const url = base + filename;
    // League data files: always bust cache (CDN may be stale)
    const volatile = ['league-picks','history','transfers','live'].some(k => filename.includes(k));
    if (!volatile) {
      const hit = Cache.get(url);
      if (hit) return hit.data;
    }
    try {
      const fetchUrl = volatile ? `${url}?_=${Date.now()}` : url;
      const r = await fetch(fetchUrl, { signal: AbortSignal.timeout(8000), cache: 'no-store' });
      if (!r.ok) return null;
      const data = await r.json();
      if (!volatile) Cache.set(url, data, Cache.TTL.LIVE);
      console.log(`[GitHub] ✓ ${filename}${volatile?' (fresh)':''}`);
      return data;
    } catch(e) {
      console.log(`[GitHub] ✗ ${filename}: ${e.message}`);
      return null;
    }
  },

  _detectGithubBase() {
    // Auto-detect if running on GitHub Pages
    if (typeof window !== 'undefined' && window.location) {
      const loc = window.location;
      if (loc.hostname.includes('github.io')) {
        const pathParts = loc.pathname.split('/').filter(Boolean);
        const repoName = pathParts[0] || '';
        return `${loc.origin}/${repoName}/data/`;
      }
      // Local development: try relative path
      if (loc.hostname === 'localhost' || loc.hostname === '127.0.0.1' || loc.protocol === 'file:') {
        return './data/';
      }
    }
    return null;
  },
};

// ═══════════════════════════════════════════════════════
// 4. PROCESS — DATA TRANSFORMATION
// ═══════════════════════════════════════════════════════
const Process = {

  // ── Bootstrap → Players ───────────────────────────────
  fromBootstrap(bs, fixtures, liveData) {
    const gwEv = bs.events.find(e => e.is_current) || bs.events.find(e => e.is_next);
    const gw   = gwEv?.id || 1;

    const teamMap = {};
    bs.teams.forEach(t => { teamMap[t.id] = t; });

    // FDR normalization
    const strDef = bs.teams.flatMap(t => [t.strength_defence_home, t.strength_defence_away]);
    const strAtk = bs.teams.flatMap(t => [t.strength_attack_home, t.strength_attack_away]);
    const [mnD,mxD] = [Math.min(...strDef), Math.max(...strDef)];
    const [mnA,mxA] = [Math.min(...strAtk), Math.max(...strAtk)];
    const nFDR = (v,mn,mx) => mn===mx ? 3 : +(1+(v-mn)/(mx-mn)*4).toFixed(2);

    // Build next fixture map per team (detect DGW, normal, blank)
    const teamFix = {};
    // For past GWs: include all fixtures. For future: only unfinished.
    const allFixRaw = (fixtures||[]).sort((a,b)=>a.event-b.event);

    // Determine target GW
    let targetGW;
    if (Store.targetGW > 0) {
      // User-selected GW
      targetGW = Store.targetGW;
    } else {
      // Auto: next GW from bootstrap
      const nextEvt = bs.events.find(e => e.is_next) || bs.events.find(e => e.is_current);
      const recoGW = nextEvt?.is_next ? nextEvt.id : gw + 1;
      const gwFixtures = allFixRaw.filter(f => f.event === recoGW);
      targetGW = gwFixtures.length > 0 ? recoGW : (nextEvt ? nextEvt.id : gw + 1);
    }

    const gwAllFix = allFixRaw.filter(f => f.event === targetGW);
    const isPastGW = targetGW <= gw;
    console.log(`[FPL] Fixture target: GW${targetGW} (current=${gw}, manual=${Store.targetGW>0}, past=${isPastGW}, fixtures=${gwAllFix.length})`);

    bs.teams.forEach(t => {
      const gwFixes = gwAllFix.filter(f => f.team_h === t.id || f.team_a === t.id);
      const fixtureCount = gwFixes.length;

      if (fixtureCount === 0) {
        // Blank GW — no fixture for this team
        teamFix[t.id] = {
          opp: 'BLANK', oppFull: 'No fixture',
          isHome: false, fdrAtk: 3, fdrDef: 3,
          isDGW: false, isBlank: true, fixtureCount: 0,
          event: targetGW,
        };
        return;
      }

      const fix = gwFixes[0];
      const isHome = fix.team_h === t.id;
      const oppId  = isHome ? fix.team_a : fix.team_h;
      const opp    = teamMap[oppId];
      if (!opp) return;

      const fdrDef = nFDR(isHome ? opp.strength_attack_away : opp.strength_attack_home, mnD, mxD);
      const fdrAtk = nFDR(isHome ? opp.strength_defence_away: opp.strength_defence_home, mnA, mxA);

      teamFix[t.id] = {
        opp: opp.short_name, oppFull: opp.name,
        isHome, fdrAtk, fdrDef,
        isDGW: fixtureCount > 1,
        isBlank: false,
        fixtureCount,
        event: targetGW,
      };
    });
    const blankTeams = Object.entries(teamFix).filter(([_,f])=>f.isBlank).map(([id,_])=>teamMap[+id]?.short_name||id);
    const dgwTeams = Object.entries(teamFix).filter(([_,f])=>f.isDGW).map(([id,_])=>teamMap[+id]?.short_name||id);
    console.log(`[FPL] Team fixtures: ${blankTeams.length} blank [${blankTeams.join(',')}], ${dgwTeams.length} DGW [${dgwTeams.join(',')}], ${Object.values(teamFix).filter(f=>!f.isBlank&&!f.isDGW).length} normal`);

    // ── Multi-GW FDR (average over N upcoming GWs) ──
    const horizon = Store.fdrHorizon || 3;
    const futureGWs = [...new Set(allFixRaw.filter(f => f.event >= targetGW).map(f=>f.event))].sort((a,b)=>a-b).slice(0, horizon);
    const teamFdrMulti = {};
    bs.teams.forEach(t => {
      const fdrVals = { def:[], atk:[] };
      futureGWs.forEach(gwN => {
        const gwF = allFixRaw.filter(f => f.event === gwN && (f.team_h === t.id || f.team_a === t.id));
        gwF.forEach(f => {
          const isH = f.team_h === t.id;
          const opp = teamMap[isH ? f.team_a : f.team_h];
          if (!opp) return;
          fdrVals.def.push(nFDR(isH ? opp.strength_attack_away : opp.strength_attack_home, mnD, mxD));
          fdrVals.atk.push(nFDR(isH ? opp.strength_defence_away : opp.strength_defence_home, mnA, mxA));
        });
        // Blank GW for this team in this GW — count as neutral 3.0
        if (!gwF.length) { fdrVals.def.push(3.0); fdrVals.atk.push(3.0); }
      });
      const avgD = fdrVals.def.length ? +(fdrVals.def.reduce((s,v)=>s+v,0)/fdrVals.def.length).toFixed(2) : 3;
      const avgA = fdrVals.atk.length ? +(fdrVals.atk.reduce((s,v)=>s+v,0)/fdrVals.atk.length).toFixed(2) : 3;
      teamFdrMulti[t.id] = { avgDef: avgD, avgAtk: avgA, horizon, gwRange: futureGWs };
    });

    // Live stats map (if available)
    const liveMap = {};
    if (liveData?.elements) {
      liveData.elements.forEach(e => { liveMap[e.id] = e.stats; });
    }

    // Position map
    const posMap = {1:'GK', 2:'DEF', 3:'MID', 4:'FWD'};

    // Filter available players
    const avail = bs.elements.filter(p =>
      p.status === 'a' || (p.status === 'd' && (p.chance_of_playing_next_round||0) >= 75)
    );

    // Compute normalization maxima (from all available players)
    const maxPPG   = Math.max(...avail.map(p=>+p.points_per_game||0), 1);
    const maxXGI   = Math.max(...avail.map(p=>+p.expected_goal_involvements||0), 1);
    const maxSaves = Math.max(...avail.filter(p=>p.element_type===1).map(p=>+p.saves||0), 1);
    const xgcPMs   = avail.filter(p=>[1,2,3].includes(p.element_type)&&p.minutes>=90)
                          .map(p=>(+p.expected_goals_conceded||0)/(p.minutes/90));
    const maxXGC   = Math.max(...xgcPMs, 0.01);

    const norm = (v, mx) => Math.min(10, +((v/mx)*10).toFixed(2));

    const rawResult = { gw, targetGW, players: avail.map(p => {
      const pos   = posMap[p.element_type] || 'FWD';
      const team  = teamMap[p.team];
      const fix   = teamFix[p.team] || { opp:'?', isHome:false, fdrAtk:3, fdrDef:3, isDGW:false, isBlank:false, fixtureCount:1 };
      const price = p.now_cost / 10;

      const fdrR   = (pos==='GK'||pos==='DEF') ? fix.fdrDef : fix.fdrAtk;
      const sFDR   = +Math.max(0,(5-fdrR)/4*10).toFixed(2);
      const sHome  = fix.isHome ? 10 : 5;
      const sPPG   = norm(+p.points_per_game||0, maxPPG);
      const sXGI   = norm(+p.expected_goal_involvements||0, maxXGI);
      // DGW/Blank score: +10 for DGW, 0 for normal, -10 for blank
      const sDGW   = fix.isBlank ? -10 : (fix.isDGW ? 10 : 0);
      const xgcPM  = p.minutes >= 90
                     ? +(+p.expected_goals_conceded/(p.minutes/90)).toFixed(3)
                     : null;
      const sXGC   = (['DEF','MID','GK'].includes(pos) && xgcPM!==null)
                     ? +Math.max(0,(1-xgcPM/maxXGC)*10).toFixed(2) : 0;
      const sSaves = pos==='GK' ? norm(+p.saves||0, maxSaves) : 0;

      // Live stats (if available)
      const live = liveMap[p.id] || {};

      return {
        id: p.id,
        Player:   p.web_name,
        Team:     team?.short_name || '?',
        TeamFull: team?.name || '?',
        TeamKey:  team?.short_name || String(p.team),
        TeamCode: team?.code || 0,
        Position: pos,
        Price:    price,
        status:   p.status,
        doubt:    p.status === 'd',
        avail:    p.chance_of_playing_next_round,
        minutes:  p.minutes || 0,
        PPG:      +p.points_per_game || 0,
        Form:     +p.form || 0,
        TP:       +p.total_points || 0,
        EP:       +p.ep_next || 0,
        TSB:      +p.selected_by_percent || 0,
        xGI:      +p.expected_goal_involvements || 0,
        xGC:      +p.expected_goals_conceded || 0,
        xGCpm:    xgcPM,
        Saves:    +p.saves || 0,
        ICT:      +p.ict_index || 0,
        TIn:      +p.transfers_in_event || 0,
        TOut:     +p.transfers_out_event || 0,
        YC:       +p.yellow_cards || 0,
        // Fixture
        FDR_next: fdrR,
        isHome:   fix.isHome,
        opponent: fix.opp,
        oppFull:  fix.oppFull || '?',
        isDGW:    fix.isDGW,
        isBlank:  fix.isBlank || false,
        fixtureCount: fix.fixtureCount ?? 1,
        // Multi-GW FDR
        fdrMulti: teamFdrMulti[p.team] || {avgDef:3,avgAtk:3},
        // Scores (legacy + dynamic)
        score_fdr_short: sFDR,
        score_home:      sHome,
        score_ppg:       sPPG,
        score_xgi:       sXGI,
        score_xgc:       sXGC,
        score_saves:     sSaves,
        score_dgw:       sDGW,
        // All criteria scores (computed below)
        scores: {},
        _raw: p, // keep raw FPL data ref for dynamic scoring
        // Live
        livePoints: live.total_points ?? null,
        liveBonus:  live.bonus ?? 0,
        GWScore:    0,
      };
    })};

    // ── Compute all criteria scores for every player ──
    const result = { gw, targetGW, players: [] };
    result.players = rawResult.players;
    Process._computeAllScores(result.players);
    return result;
  },

  // ── Largest Remainder Method: ensure integer %s sum to exactly 100 ──
  _roundWeightsTo100(rawWeights) {
    // rawWeights = {key: decimalValue} where sum ≈ 1.0
    const keys = Object.keys(rawWeights);
    const pcts = keys.map(k => rawWeights[k] * 100);
    const floors = pcts.map(v => Math.floor(v));
    const remainders = pcts.map((v,i) => ({ i, r: v - floors[i] }));
    let deficit = 100 - floors.reduce((s,v) => s+v, 0);
    // Sort by largest remainder, distribute +1 to each
    remainders.sort((a,b) => b.r - a.r);
    for (let j = 0; j < deficit && j < remainders.length; j++) {
      floors[remainders[j].i]++;
    }
    const result = {};
    keys.forEach((k,i) => { result[k] = floors[i] / 100; });
    return result;
  },

  // ── Bulk score computation for all criteria ──
  _computeAllScores(players) {
    if (!players.length) return;
    const minMins = 45; // minimum minutes for per90

    // Compute max values for normalization
    const maxVals = {};
    CRITERIA.forEach(c => {
      if (c.type === 'computed') return; // already computed
      let vals;
      if (c.type === 'per90' || c.type === 'inverse_per90') {
        vals = players.filter(p => (p._raw?.minutes||0) >= minMins).map(p => {
          const raw = c.compute ? c.compute(p._raw) : (c.transform ? c.transform(+(p._raw?.[c.field]||0)) : +(p._raw?.[c.field]||0));
          return Math.abs(raw) / Math.max(p._raw.minutes||1, 1) * 90;
        });
      } else {
        vals = players.map(p => {
          const raw = c.compute ? c.compute(p._raw) : (c.transform ? c.transform(+(p._raw?.[c.field]||0)) : +(p._raw?.[c.field]||0));
          return Math.abs(raw);
        });
      }
      maxVals[c.key] = Math.max(...vals, 0.001);
    });

    // Score each player
    players.forEach(p => {
      const raw = p._raw;
      if (!raw) return;
      const mins = raw.minutes || 0;

      // Computed scores (already in player obj)
      p.scores.fdr_short = p.score_fdr_short || 0;
      p.scores.home      = p.score_home || 0;
      p.scores.dgw_blank = p.score_dgw || 0;
      // Multi-GW FDR: convert to 0-10 score (low FDR = high score)
      const fdrM = p.fdrMulti || {};
      const fdrMultiR = (['GK','DEF'].includes(p.Position)) ? (fdrM.avgDef||3) : (fdrM.avgAtk||3);
      p.scores.fdr_multi = +Math.max(0, (5 - fdrMultiR) / 4 * 10).toFixed(2);

      CRITERIA.forEach(c => {
        if (c.type === 'computed') return;
        const rawVal = c.compute ? c.compute(raw) : (c.transform ? c.transform(+(raw[c.field]||0)) : +(raw[c.field]||0));

        let score = 0;
        if (c.type === 'per90') {
          if (mins >= minMins) {
            const per90 = rawVal / Math.max(mins, 1) * 90;
            score = Math.min(10, (per90 / maxVals[c.key]) * 10);
          }
        } else if (c.type === 'inverse_per90') {
          if (mins >= minMins) {
            const per90 = rawVal / Math.max(mins, 1) * 90;
            score = Math.max(0, (1 - per90 / maxVals[c.key]) * 10);
          } else {
            score = 5; // neutral if not enough minutes
          }
        } else if (c.type === 'direct') {
          score = Math.min(10, (rawVal / maxVals[c.key]) * 10);
        } else if (c.type === 'inverse_direct') {
          score = Math.max(0, (1 - rawVal / maxVals[c.key]) * 10);
        }

        p.scores[c.key] = +score.toFixed(2);
      });

      // Clean up raw ref (save memory)
      delete p._raw;
    });
  },

  // ── Bootstrap → Teams (EPL table proxy) ──────────────
  teamsFromBootstrap(bs) {
    return bs.teams.map(t => ({
      pos:0, club:t.name, short:t.short_name, strength:t.strength,
      strengthAtk: Math.round((t.strength_attack_home+t.strength_attack_away)/2),
      strengthDef: Math.round((t.strength_defence_home+t.strength_defence_away)/2),
    })).sort((a,b) => b.strength - a.strength);
  },

  // ── EPL Standings computed from finished fixtures ──
  eplFromFixtures(bs, fixtures) {
    if (!bs || !fixtures) return [];
    const teamMap = {};
    bs.teams.forEach(t => { teamMap[t.id] = { id:t.id, club:t.name, short:t.short_name, strength:t.strength, p:0,w:0,d:0,l:0,gf:0,ga:0,gd:0,pts:0,results:[] }; });
    const finished = fixtures.filter(f => f.finished && f.team_h_score != null);
    finished.sort((a,b) => a.event - b.event);
    finished.forEach(f => {
      const h = teamMap[f.team_h], a = teamMap[f.team_a];
      if (!h || !a) return;
      const hg = f.team_h_score, ag = f.team_a_score;
      h.p++; a.p++; h.gf += hg; h.ga += ag; a.gf += ag; a.ga += hg;
      if (hg > ag)      { h.w++; a.l++; h.pts+=3; h.results.push('W'); a.results.push('L'); }
      else if (hg < ag) { a.w++; h.l++; a.pts+=3; h.results.push('L'); a.results.push('W'); }
      else              { h.d++; a.d++; h.pts+=1; a.pts+=1; h.results.push('D'); a.results.push('D'); }
    });
    return Object.values(teamMap).map(t => {
      t.gd = t.gf - t.ga;
      t.form = t.results.slice(-5).join('');
      return t;
    }).sort((a,b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf);
  },

  // ── League Standings → Managers list ─────────────────
  processLeague(standing) {
    if (!standing?.standings?.results) return [];
    return standing.standings.results.map(e => ({
      entryId:    e.entry,
      entryName:  e.entry_name,
      playerName: e.player_name,
      rank:       e.rank,
      lastRank:   e.last_rank,
      total:      e.total,
      eventTotal: e.event_total,
    }));
  },

  // ── Manager History → Overall Ranking array per GW ───────────
  buildRankingMatrix(managers, histories) {
    const allGWs = new Set();
    const entryEvents = {};
    for (const [key, val] of Object.entries(histories)) {
      let events = [];
      if (val && val.current && Array.isArray(val.current)) events = val.current;
      else if (Array.isArray(val)) events = val;
      entryEvents[key] = events;
      events.forEach(e => {
        const ev = Number(e.event || 0);
        if (ev > 0) allGWs.add(ev);
      });
    }
    const gwLabels = [...allGWs].sort((a,b) => a - b);
    console.log(`[Matrix-Overall] GWs: ${gwLabels.length}`);

    const series = managers.map(m => {
      const hist = entryEvents[m.entryId] || entryEvents[String(m.entryId)] || [];
      const rankMap = {};
      hist.forEach(e => { rankMap[Number(e.event)] = Number(e.overall_rank); });
      return {
        name:    m.entryName,
        playerName: m.playerName || '',
        entryId: m.entryId,
        isMe:    m.entryName.toLowerCase().includes(CFG.myTeamName.toLowerCase()),
        ranks:   gwLabels.map(gw => rankMap[gw] ?? null),
        totalPts:m.total,
        eventPts:m.eventTotal,
      };
    });

    return { gwLabels, series };
  },

  // ── Manager History → League Ranking (position in league, not overall) ──
  buildLeagueRankMatrix(managers, histories) {
    const allGWs = new Set();

    // Extract events from all history entries (handle any format)
    const entryEvents = {}; // {entryId: [{event, points, ...}]}
    for (const [key, val] of Object.entries(histories)) {
      let events = [];
      if (val && val.current && Array.isArray(val.current)) {
        events = val.current;
      } else if (Array.isArray(val)) {
        events = val;
      }
      entryEvents[key] = events;
      events.forEach(e => {
        const ev = Number(e.event || e.Event || 0);
        if (ev > 0) allGWs.add(ev);
      });
    }

    const gwLabels = [...allGWs].sort((a,b) => a - b);
    console.log(`[Matrix-League] Entries: ${Object.keys(entryEvents).length}, GWs: ${gwLabels.length}, sample keys: ${Object.keys(entryEvents).slice(0,3)}`);

    if (!gwLabels.length) {
      // Debug: show what we actually received
      const firstKey = Object.keys(histories)[0];
      if (firstKey) {
        const v = histories[firstKey];
        const c = v?.current;
        const actualKeys = v ? Object.keys(v) : [];
        console.warn('[Matrix-League] 0 GWs! First entry key:', firstKey);
        console.warn('[Matrix-League] Object keys:', actualKeys);
        console.warn('[Matrix-League] Object type:', typeof v, 'isArray:', Array.isArray(v));
        console.warn('[Matrix-League] Raw JSON (first 300):', JSON.stringify(v).slice(0, 300));
        console.warn('[Matrix-League] .current:', c, '.current type:', typeof c);
        if (actualKeys.length && !c) {
          // Try first key as potential data
          const firstVal = v[actualKeys[0]];
          console.warn('[Matrix-League] v[firstKey]:', typeof firstVal, Array.isArray(firstVal) ? 'array len=' + firstVal.length : '');
        }
      }
    }

    // Build cumulative points + transfers per GW per manager
    // Use total_points from history (official FPL cumulative) for accuracy
    const ptsByGW = {};
    const transByGW = {};
    managers.forEach(m => {
      const hist = entryEvents[m.entryId] || entryEvents[String(m.entryId)] || [];
      const h = histories[m.entryId] || histories[String(m.entryId)];
      const chips = h?.chips || [];
      const chipGWs = new Set(chips.filter(c => {
        const n = (c.name||'').toLowerCase().replace(/[_ ]/g,'');
        return n.includes('wildcard') || n.includes('freehit');
      }).map(c => Number(c.event)));

      let cumTrans = 0;
      gwLabels.forEach(gw => {
        const ev = hist.find(e => Number(e.event) === gw);
        // Use total_points (official cumulative) instead of summing points manually
        const cumPts = Number(ev?.total_points) || 0;
        if (ev && !chipGWs.has(gw)) {
          cumTrans += Number(ev.event_transfers) || 0;
        }
        if (!ptsByGW[gw]) ptsByGW[gw] = {};
        if (!transByGW[gw]) transByGW[gw] = {};
        ptsByGW[gw][m.entryId] = cumPts;
        transByGW[gw][m.entryId] = cumTrans;
      });
    });

    const series = managers.map(m => ({
      name:    m.entryName,
      playerName: m.playerName || '',
      entryId: m.entryId,
      isMe:    m.entryName.toLowerCase().includes(CFG.myTeamName.toLowerCase()),
      ranks:   gwLabels.map(gw => {
        const pts = ptsByGW[gw] || {};
        const trans = transByGW[gw] || {};
        const myPts   = pts[m.entryId] ?? 0;
        const myTrans = trans[m.entryId] ?? 0;
        // Rank: higher pts = better. If tied, fewer transfers = better.
        const rank = Object.keys(pts).filter(eid => {
          const oPts   = pts[eid] ?? 0;
          const oTrans = trans[eid] ?? 0;
          return oPts > myPts || (oPts === myPts && oTrans < myTrans);
        }).length + 1;
        return rank;
      }),
      totalPts: m.total,
      eventPts: m.eventTotal,
    }));

    return { gwLabels, series };
  },

  // ── Transfer heatmap data ─────────────────────────────
  buildTransferMatrix(managers, transfers) {
    if (!transfers || typeof transfers !== 'object') return { gwLabels:[], managers, rows:[] };

    const allGWs = new Set();
    for (const [key, val] of Object.entries(transfers)) {
      if (Array.isArray(val)) {
        val.forEach(t => {
          const ev = Number(t?.event || 0);
          if (ev > 0) allGWs.add(ev);
        });
      }
    }
    const gwLabels = [...allGWs].sort((a,b) => a - b);

    const rows = gwLabels.map(gw => {
      const row = { gw };
      managers.forEach(m => {
        const arr = transfers[m.entryId] || transfers[String(m.entryId)];
        const trs = Array.isArray(arr) ? arr.filter(t => Number(t.event) === gw) : [];

        // Check chips from history
        const h = Store.managerHistory[m.entryId] || Store.managerHistory[String(m.entryId)];
        const chips = Array.isArray(h?.chips) ? h.chips : [];
        const chipThisGW = chips.find(c => Number(c.event) === gw);

        row[m.entryId] = {
          count: trs.length,
          chip:  chipThisGW?.name || null,
        };
      });
      return row;
    });

    return { gwLabels, managers, rows };
  },

  // ── My Picks → Squad ─────────────────────────────────
  buildMySquad(picks, bootstrap) {
    if (!picks?.picks || !bootstrap) return [];
    const elMap = {};
    bootstrap.elements.forEach(e => { elMap[e.id] = e; });
    const teamMap = {};
    bootstrap.teams.forEach(t => { teamMap[t.id] = t; });
    const posMap = {1:'GK',2:'DEF',3:'MID',4:'FWD'};

    return picks.picks.map(pick => {
      const el   = elMap[pick.element] || {};
      const team = teamMap[el.team] || {};
      const pos  = posMap[el.element_type] || '?';
      const role = pick.is_captain ? 'Captain'
                 : pick.is_vice_captain ? 'Vice Captain'
                 : pick.position <= 11 ? 'Starting XI' : 'Bench';
      // Find GWScore from scored players
      const scored = Store.scoredPlayers.find(p=>p.id===pick.element);
      return {
        id:         pick.element,
        squad_role: role,
        Position:   pos,
        Player:     el.web_name || '?',
        Team:       team.short_name || '?',
        Price:      (el.now_cost||0)/10,
        status:     el.status || 'a',
        multiplier: pick.multiplier,
        is_captain: pick.is_captain,
        is_vice_captain: pick.is_vice_captain,
        PPG:        +el.points_per_game || 0,
        Form:       +el.form || 0,
        xGI:        +el.expected_goal_involvements || 0,
        FDR_next:   scored?.FDR_next || null,
        ScoutScore: scored?.GWScore || 0,
        livePoints: scored?.livePoints ?? null,
      };
    });
  },

  // ── GW Score calculation (dynamic — uses criteria catalog) ──
  calcGWScore(p, weights) {
    if (!p.scores) return 0;
    let total = 0;
    for (const key of Object.keys(weights)) {
      const crit = CRITERIA_MAP[key];
      if (!crit) {
        // Legacy named weight → map to criteria key
        const legacyMap = {
          'FDR Jangka Pendek':'fdr_short', 'FDR Jangka Menengah':'fdr_short',
          'Home Advantage':'home', 'Points Per Game':'ppg', 'xGI':'xgi',
          'xGC (Defensive)':'xgc', 'Saves (GK)':'saves', 'DGW / Blank':'dgw_blank',
          'Form 3 GW':'form', 'ICT Index':'ict_index', 'Value (pts/£)':'value_form',
          'Transfer Momentum':'net_transfers', 'Suspension Risk':'yellow_cards',
        };
        const mapped = legacyMap[key];
        if (mapped && p.scores[mapped] !== undefined) {
          total += (p.scores[mapped] || 0) * (weights[key]?.[p.Position] || 0);
        }
        continue;
      }
      total += (p.scores[key] || 0) * (weights[key]?.[p.Position] || 0);
    }
    return +total.toFixed(2);
  },

  applyScores(players) {
    players.forEach(p => { p.GWScore = +Process.calcGWScore(p, Store.gwWeights); });
    const minMin = +document.getElementById('min-minutes')?.value || CFG.minMinutes;
    Store.scoredPlayers = players.filter(p => p.minutes >= minMin);
    Store.formations    = this.rankFormations(this.buildAllFormations(Store.scoredPlayers));
  },

  // ── Formation builders ────────────────────────────────
  sortPos:  (pl, pos) => pl.filter(p=>p.Position===pos).sort((a,b)=>b.GWScore-a.GWScore),

  pickN(candidates, n, selected) {
    const maxPT = +document.getElementById('max-per-team')?.value || CFG.maxPerTeam;
    const picked = [], all = [...selected];
    for (const c of candidates) {
      if (picked.length >= n) break;
      const cnt = all.filter(p=>p.TeamKey===c.TeamKey).length;
      if (cnt >= maxPT) continue;
      picked.push(c); all.push(c);
    }
    return picked;
  },

  buildLineup(pl, nD, nM, nF) {
    // Exclude blank GW players from lineup (mandatory — they can't score)
    const eligible = pl.filter(p => !p.isBlank);
    const GK  = this.sortPos(eligible,'GK'),  DEF = this.sortPos(eligible,'DEF'),
          MID = this.sortPos(eligible,'MID'), FWD = this.sortPos(eligible,'FWD');
    const gkP  = this.pickN(GK,  1, []);
    const defP = this.pickN(DEF, nD, gkP);
    const midP = this.pickN(MID, nM, [...gkP,...defP]);
    const fwdP = this.pickN(FWD, nF, [...gkP,...defP,...midP]);
    const all  = [...gkP,...defP,...midP,...fwdP];
    const field= [...defP,...midP,...fwdP].sort((a,b)=>b.GWScore-a.GWScore);
    const total= +all.reduce((s,p)=>s+(p.GWScore||0),0).toFixed(2);
    const cap  = field[0]||null;
    const vc   = field[1]||null;

    // Actual points calculation
    const hasLive     = all.some(p => p.livePoints != null);
    const totalActual = all.reduce((s,p) => s + (p.livePoints ?? 0), 0);
    const capBonus    = cap && cap.livePoints != null ? cap.livePoints : 0;
    const totalWithCap= totalActual + capBonus;

    return { gk:gkP[0]||null, def:defP, mid:midP, fwd:fwdP,
             cap, vc, total, all,
             hasLive, totalActual, totalWithCap, capBonus };
  },

  buildAllFormations(pl) {
    return [[3,4,3],[3,5,2],[4,3,3],[4,4,2],[4,5,1],[5,2,3],[5,3,2],[5,4,1]]
      .map(([d,m,f]) => ({ name:`${d}-${m}-${f}`, d,m,f, ...this.buildLineup(pl,d,m,f) }));
  },

  rankFormations(fms) {
    const sorted = [...fms].sort((a,b)=>b.total-a.total);
    return fms.map(f => ({ ...f, rank: sorted.findIndex(s=>s.name===f.name)+1 }));
  },
};

// ═══════════════════════════════════════════════════════
// 5. NAVIGATION
// ═══════════════════════════════════════════════════════
const SUBTABS = {
  lineup:  [{k:'gwrec',    l:'GW Recommendation'},{k:'gweval',l:'Evaluasi Poin'},{k:'gwscoring',l:'GW Scoring'},{k:'wlineup',l:'WLineUp'},{k:'optimize',l:'⚡ Optimize'}],
  scout:   [{k:'sscoring', l:'Scout Scoring'},{k:'srec',l:'Scout Recommendation'},{k:'swt',l:'Scout Weights'},{k:'soptimize',l:'⚡ Optimize'},{k:'price',l:'💰 Price Change'},{k:'diff',l:'🔮 Differentials'},{k:'captain',l:'👑 Captain Sim'}],
  fdr:     [{k:'fdr-def',  l:'DEF Matrix'},       {k:'fdr-atk',  l:'ATK Matrix'},{k:'fdr-ovr',l:'OVR Matrix'},{k:'fdrinfo',l:'Team Strength'}],
  epl:     [],
  league:  [{k:'rekap',    l:'Rekap'},             {k:'charts',   l:'Grafik'},   {k:'transfer',l:'Transfer & Chips'}],
  other:   [{k:'mysquad',  l:'My Squad'},          {k:'chiprec',  l:'Chip Recommendation'}],
  settings:[],
};

const Nav = {
  current: 'lineup',

  init() {
    document.querySelectorAll('.tab').forEach(t => {
      t.addEventListener('click', () => this.goTab(t.dataset.tab));
    });
    Object.keys(SUBTABS).forEach(k => { Store.subtab[k] = SUBTABS[k][0]?.k || null; });
    this.goTab('lineup');
  },

  goTab(tab) {
    this.current = tab;
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab===tab));
    document.querySelectorAll('.panel').forEach(p => p.classList.toggle('active', p.id===`panel-${tab}`));
    this.renderSubtabs(tab);
    Render.panel(tab, Store.subtab[tab]);
  },

  renderSubtabs(tab) {
    const bar  = document.getElementById('subtab-bar');
    const subs = SUBTABS[tab] || [];
    if (!subs.length) { bar.innerHTML=''; bar.classList.add('hidden'); return; }
    bar.classList.remove('hidden');
    bar.innerHTML = subs.map(s =>
      `<div class="subtab ${Store.subtab[tab]===s.k?'active':''}"
            onclick="Nav.goSubtab('${tab}','${s.k}')">${s.l}</div>`
    ).join('');
  },

  goSubtab(tab, key) {
    Store.subtab[tab] = key;
    this.renderSubtabs(tab);
    Render.panel(tab, key);
  },
};

// ═══════════════════════════════════════════════════════
// 6. HELPERS
// ═══════════════════════════════════════════════════════
const H = {
  loader: (msg='Memuat…') =>
    `<div class="loader-wrap"><div class="spinner"></div><div class="loader-text">${msg}</div></div>`,
  error:  msg => `<div class="error-box">⚠ ${msg}</div>`,
  info:   msg => `<div class="info-box">ℹ ${msg}</div>`,

  scoreClass: s => +s>=6?'s-hi':+s>=4?'s-mid':+s>=1?'s-lo':'s-null',
  scoreColor: s => +s>=6?'var(--green)':+s>=4?'var(--gold)':'var(--orange)',

  gwTargetBanner() {
    if (!Store.targetGW || Store.targetGW <= 0) return '';
    const gw = Store.targetGW;
    const cur = Store.currentGW || 0;
    if (gw <= cur) {
      return `<div class="info-box" style="background:rgba(255,145,0,.08);border-color:rgba(255,145,0,.3);color:var(--orange);margin-bottom:14px">
        🔍 <b>Backtest Mode — GW${gw}</b> · Melihat data fixture GW${gw} (sudah berlalu). Skor berdasarkan jadwal GW tersebut.
      </div>`;
    }
    return `<div class="info-box" style="background:rgba(206,147,216,.08);border-color:rgba(206,147,216,.3);color:var(--purple);margin-bottom:14px">
      🔮 <b>Preview Mode — GW${gw}</b> · Melihat fixture GW${gw} (belum dimainkan). Gunakan untuk perencanaan transfer jangka menengah.
    </div>`;
  },
  ptsClass:   p => p==null?'dim':+p>=8?'pts-great':+p>=5?'pts-good':+p>=2?'pts-ok':'pts-bad',

  fdrClass(v) {
    if (!v||v<=0) return 'fdr-none';
    if (v<2)   return 'fdr-1';
    if (v<2.5) return 'fdr-2';
    if (v<3)   return 'fdr-3';
    if (v<3.5) return 'fdr-4';
    return 'fdr-5';
  },

  teamTag:  t => `<span class="team-tag">${t||'?'}</span>`,
  posPill:  p => `<span class="pos-pill pos-${p}">${p}</span>`,
  numFmt:   (v,d=2) => v==null||v===''?'–':(+v).toFixed(d),
  pct:      v => v==null?'–':`${(+v).toFixed(1)}%`,

  chipEmoji(name) {
    if (!name) return null;
    const n = name.toLowerCase();
    if (n.includes('wildcard'))   return '🃏 WC';
    if (n.includes('freehit') || n.includes('free_hit')) return '🎯 FH';
    if (n.includes('bboost') || n.includes('bench_boost')) return '💺 BB';
    if (n.includes('3xc') || n.includes('triple_captain')) return '👑 TC';
    return name;
  },

  relRankColor(rank, total) {
    const pct = rank/total;
    if (pct<=0.1)  return 'var(--gold)';
    if (pct<=0.25) return 'var(--green)';
    if (pct<=0.5)  return 'var(--blue)';
    if (pct<=0.75) return 'var(--text2)';
    return 'var(--red)';
  },
};

// ═══════════════════════════════════════════════════════
// 7. RENDERERS
// ═══════════════════════════════════════════════════════
const Render = {
  panel(tab, subtab) {
    const el = document.getElementById(`content-${tab}`);
    if (!el) return;
    const map = {
      lineup:  { gwrec:this.lineupRec, gweval:this.lineupEval, gwscoring:this.lineupScoring, wlineup:this.lineupWLineup, optimize:this.lineupOptimize },
      scout:   { sscoring:this.scoutScoring, srec:this.scoutRec, swt:this.scoutWeight, soptimize:this.scoutOptimize, price:this.pricePredictor, diff:this.differentialFinder, captain:this.captainSimulator },
      fdr:     { 'fdr-def':()=>this.fdrMatrix('def'), 'fdr-atk':()=>this.fdrMatrix('atk'),
                 'fdr-ovr':()=>this.fdrMatrix('ovr'), fdrinfo:this.fdrInfo },
      epl:     { null:this.epl },
      league:  { rekap:this.leagueRekap, charts:this.leagueCharts, transfer:this.leagueTransfer },
      other:   { mysquad:this.otherSquad, chiprec:this.otherChip },
      settings:{ null:this.settings },
    };
    if (!Store.players.length && tab!=='settings') {
      el.innerHTML = H.loader('Menunggu data FPL…'); return;
    }
    const fn = map[tab]?.[subtab||'null'];
    el.innerHTML = fn ? fn.call(this) : H.info('Pilih sub-tab');
    if (tab==='league'&&subtab==='charts') setTimeout(()=>Charts.buildAll(),50);
    // Post-render hooks
    if (tab==='lineup'&&subtab==='wlineup') setTimeout(()=>UI.updateWeightTotals('gwt'),10);
    if (tab==='scout'&&subtab==='swt') setTimeout(()=>UI.updateWeightTotals('scwt'),10);
    if (tab==='settings') setTimeout(()=>{
      UI.updateCacheStats();UI.renderCacheEndpointList();
      // Auto-lookup team name if ID is set but name not yet detected
      if (CFG.myTeamId && !Store.myManagerInfo?.name) UI.lookupTeamId(CFG.myTeamId);
    },10);
  },

  // ── WLineUp ────────────────────────────────────────────
  lineupWLineup() {
    return this._criteriaWeightPanel('gw', Store.gwWeights, 'GW Scoring Weights — WLineUp',
      'Edit bobot kemudian klik <b>Apply</b>. Tambahkan kriteria dari katalog di bawah.');
  },

  // ── Backtest Weight Optimizer ──────────────────────────
  lineupOptimize() {
    return this._optimizePanel('gw');
  },

  // ── Shared Optimize Panel (GW + Scout) ──
  _optimizePanel(mode) {
    if (!Store.bootstrap || !Store.players.length) return H.info('Data belum dimuat.');
    const weights = mode === 'gw' ? Store.gwWeights : Store.scoutWeights;
    const backTab = mode === 'gw' ? 'wlineup' : 'swt';
    const parentTab = mode === 'gw' ? 'lineup' : 'scout';
    const applyFn = mode === 'gw' ? 'applySuggestedWeights' : 'applySuggestedScoutWeights';

    const gw = Store.currentGW || 1;
    const lookback = Store.optimizeLookback || 1;
    const allKeys = CRITERIA.map(c => c.key);
    const posArr = ['GK','DEF','MID','FWD'];

    // Get actual GW points from live data
    const liveMap = {};
    if (Store.liveEvent?.elements) Store.liveEvent.elements.forEach(e => { liveMap[e.id] = e.stats?.total_points ?? null; });

    const eligible = Store.players.filter(p => p.scores && liveMap[p.id] != null && p.minutes >= 90);

    if (eligible.length < 10) {
      return `
        <div class="section-title">⚡ ${mode==='gw'?'GW':'Scout'} Weight Optimizer</div>
        ${H.info(`Memerlukan data live GW aktif. Saat ini ${eligible.length} pemain eligible (perlu ≥10).`)}
        <div class="btn-row"><button class="btn btn-secondary" onclick="Nav.goSubtab('${parentTab}','${backTab}')">← Kembali</button></div>`;
    }

    const lookbackOpts = [1,3,5].map(n =>
      `<button class="filter-btn ${lookback===n?'active':''}" onclick="Store.optimizeLookback=${n};Nav.goSubtab('${parentTab}','${mode==='gw'?'optimize':'soptimize'}')">${n} GW</button>`
    ).join('');

    // Overall correlation
    const actualPts = eligible.map(p => liveMap[p.id]);
    const meanPts = actualPts.reduce((s,v)=>s+v,0)/actualPts.length;
    const overallCorr = {};
    allKeys.forEach(key => {
      const scores = eligible.map(p => p.scores[key] || 0);
      const meanS = scores.reduce((s,v)=>s+v,0)/scores.length;
      let num=0, denA=0, denB=0;
      for (let i=0;i<eligible.length;i++) { const dS=scores[i]-meanS, dP=actualPts[i]-meanPts; num+=dS*dP; denA+=dS*dS; denB+=dP*dP; }
      overallCorr[key] = (denA>0&&denB>0) ? +(num/Math.sqrt(denA*denB)).toFixed(4) : 0;
    });

    // Per-position suggested weights
    const suggested = {};
    allKeys.forEach(key => { suggested[key] = {GK:0,DEF:0,MID:0,FWD:0}; });
    posArr.forEach(position => {
      const pp = eligible.filter(p => p.Position === position);
      if (pp.length < 3) return;
      const posActual = pp.map(p => liveMap[p.id]);
      const posMean = posActual.reduce((s,v)=>s+v,0)/posActual.length;
      const corrs = {};
      allKeys.forEach(key => {
        const sc = pp.map(p => p.scores[key] || 0);
        const ms = sc.reduce((s,v)=>s+v,0)/sc.length;
        let n=0, dA=0, dB=0;
        for (let i=0;i<pp.length;i++) { const ds=sc[i]-ms, dp=posActual[i]-posMean; n+=ds*dp; dA+=ds*ds; dB+=dp*dp; }
        corrs[key] = (dA>0&&dB>0) ? Math.max(0, n/Math.sqrt(dA*dB)) : 0;
      });
      const total = Object.values(corrs).reduce((s,v)=>s+v,0);
      if (total > 0) {
        const raw = {};
        allKeys.forEach(key => { raw[key] = corrs[key] / total; });
        const adjusted = Process._roundWeightsTo100(raw);
        allKeys.forEach(key => { suggested[key][position] = adjusted[key]; });
      }
    });

    const sortedKeys = [...allKeys].sort((a,b) => Math.abs(overallCorr[b]) - Math.abs(overallCorr[a]));
    const currentActive = new Set(Object.keys(weights));

    const rows = sortedKeys.map(key => {
      const cr = CRITERIA_MAP[key]; if (!cr) return '';
      const tip = cr.tip ? ` title="${cr.tip}"` : '';
      const corr = overallCorr[key] || 0;
      const corrBar = `<div class="corr-bar"><div class="corr-fill ${corr>=0?'corr-pos':'corr-neg'}" style="width:${Math.min(100,Math.abs(corr)*100)}%"></div></div>`;
      const corrColor = corr > 0.15 ? 'var(--green)' : corr > 0 ? 'var(--text2)' : corr > -0.05 ? 'var(--text3)' : 'var(--red)';
      const isActive = currentActive.has(key);
      const hasSuggest = posArr.some(p => (suggested[key]?.[p]||0) > 0.01);
      const currentW = posArr.map(p => `<td class="mono c dim">${isActive?((weights[key]?.[p]||0)*100).toFixed(0)+'%':'–'}</td>`).join('');
      const suggestW = posArr.map(p => {
        const sw = ((suggested[key]?.[p]||0)*100).toFixed(0);
        return `<td class="mono c ${+sw>5?'s-hi':+sw>0?'':'dim'}">${sw}%</td>`;
      }).join('');
      return `<tr class="${hasSuggest?'':'opt-dim'}">
        <td${tip}><span class="crit-label">${cr.label}</span> <span class="crit-group">${cr.group}</span></td>
        <td class="mono c" style="color:${corrColor}">${corr.toFixed(3)}</td>
        <td>${corrBar}</td>
        ${currentW}${suggestW}
      </tr>`;
    }).join('');

    return `
      <div class="section-title">⚡ ${mode==='gw'?'GW':'Scout'} Weight Optimizer — Backtest GW${gw}</div>
      ${H.info(`Korelasi Pearson <b>semua ${allKeys.length} kriteria</b> vs poin aktual. <b>${eligible.length}</b> pemain eligible. Apply otomatis menambahkan kriteria relevan.`)}
      <div class="filters" style="margin-bottom:14px">
        <span class="dim" style="font-size:12px;margin-right:8px">Lookback:</span>${lookbackOpts}
        <span class="dim" style="font-size:11px;margin-left:auto">Sorted by |correlation|</span>
      </div>
      <div class="table-wrap" style="max-width:960px">
        <table class="weight-table opt-table">
          <thead><tr>
            <th rowspan="2">Kriteria</th><th rowspan="2" class="c">r</th><th rowspan="2">Korelasi</th>
            <th colspan="4" class="c" style="border-bottom:1px solid var(--border2)">Current</th>
            <th colspan="4" class="c" style="border-bottom:1px solid var(--border2);color:var(--green)">Suggested</th>
          </tr><tr>
            ${posArr.map(p=>`<th class="c" style="font-size:9px">${p}</th>`).join('')}
            ${posArr.map(p=>`<th class="c" style="font-size:9px;color:var(--green)">${p}</th>`).join('')}
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <div class="btn-row" style="margin-top:14px">
        <button class="btn btn-primary" onclick="UI.${applyFn}()">✓ Apply Suggested</button>
        <button class="btn btn-secondary" onclick="Nav.goSubtab('${parentTab}','${backTab}')">← Kembali</button>
      </div>
      <div class="info-box" style="margin-top:16px">
        <b>Cara baca:</b> <code>r</code> = korelasi Pearson. Baris transparan = tidak relevan. Apply → semua kriteria berbobot > 0 otomatis aktif.
      </div>`;
  },

  // ── GW Scoring table ───────────────────────────────────
  lineupScoring() {
    const pl = Store.scoredPlayers;
    if (!pl.length) return H.error('Tidak ada data pemain.');
    const maxS = Math.max(...pl.map(p=>p.GWScore), 1);
    const filterBtns = ['ALL','GK','DEF','MID','FWD'].map(p =>
      `<button class="filter-btn ${Store.posFilter===p?'active':''}"
               onclick="UI.setFilter('${p}')">${p}</button>`
    ).join('');
    let filtered = pl
      .filter(p=>Store.posFilter==='ALL'||p.Position===Store.posFilter)
      .filter(p=>!Store.searchQuery||p.Player.toLowerCase().includes(Store.searchQuery.toLowerCase()))
      .sort((a,b)=>b.GWScore-a.GWScore);

    const rows = filtered.map((p,i)=>{
      const sc=p.GWScore, bw=Math.round(sc/maxS*100);
      const d=p.doubt?'<span class="doubt-tag">⚠</span>':'';
      const live=p.livePoints!=null?`<span style="color:var(--gold);font-size:11px"> [${p.livePoints}pts]</span>`:'';
      return `<tr>
        <td class="dim" style="width:32px">${i+1}</td>
        <td>${H.posPill(p.Position)}</td>
        <td>${p.Player}${d}${live}</td>
        <td>${H.teamTag(p.Team)}</td>
        <td>
          <div class="score-bar-wrap">
            <span class="mono ${H.scoreClass(sc)}" style="min-width:36px">${sc.toFixed(2)}</span>
            <div class="score-bar"><div class="score-bar-fill" style="width:${bw}%;background:${H.scoreColor(sc)}"></div></div>
          </div>
        </td>
        <td class="mono dim r">${H.numFmt(p.FDR_next,1)}</td>
        <td class="c">${p.isHome?'🏠':'✈'} <span class="dim" style="font-size:11px">${p.opponent}</span></td>
        <td class="c">${p.isBlank?'<span style="color:var(--red);font-weight:700">⛔</span>':p.isDGW?'<span style="color:var(--blue);font-weight:700">2️⃣</span>':'–'}</td>
        <td class="mono r">${H.numFmt(p.PPG,1)}</td>
        <td class="mono r">${H.numFmt(p.xGI,2)}</td>
        <td class="mono r">${p.xGCpm!=null?H.numFmt(p.xGCpm,2):'–'}</td>
        <td class="mono r">${p.Saves||0}</td>
        <td class="mono dim r">${H.pct(p.TSB)}</td>
        <td class="mono dim r">£${p.Price.toFixed(1)}</td>
      </tr>`;
    }).join('');

    return `
      ${H.gwTargetBanner()}
      <div class="filters">
        ${filterBtns}
        <input class="search-input" type="text" placeholder="Cari pemain…"
               value="${Store.searchQuery}" oninput="UI.setSearch(this.value)">
        <span class="dim" style="font-size:12px;margin-left:auto">${filtered.length} pemain</span>
      </div>
      <div class="table-wrap max-h">
        <table>
          <thead><tr>
            <th>#</th><th>Pos</th><th>Pemain</th><th>Tim</th>
            <th>GWScore</th><th class="r">FDR</th><th>Lawan</th><th class="c">GW</th>
            <th class="r">PPG</th><th class="r">xGI</th><th class="r">xGC/90</th>
            <th class="r">Saves</th><th class="r">TSB%</th><th class="r">£</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  },

  // ── GW Recommendation ──────────────────────────────────
  lineupRec() {
    const fms = Store.formations;
    if (!fms.length) return H.error('Data belum siap.');
    const sel=Store.selectedForm, f=fms[sel];
    const rankColors={1:'var(--gold)',2:'#90caf9',3:'var(--purple)'};
    const hasLive = f.hasLive;

    // Sort by actual pts for "pts rank"
    const byPts = [...fms].sort((a,b)=>(b.totalWithCap||0)-(a.totalWithCap||0));

    const cards = fms.map((fm,i)=>{
      const ptsRank = byPts.findIndex(x=>x.name===fm.name)+1;
      const ptsLabel = hasLive
        ? `<div class="rc-pts">${fm.totalWithCap} <span>pts</span></div>
           <div class="rc-pts-rank">#${ptsRank} pts</div>`
        : '';
      return `
      <div class="rank-card rank-${fm.rank} ${i===sel?'selected':''}"
           style="--rc:${rankColors[fm.rank]||'var(--border2)'}"
           onclick="UI.selectForm(${i})">
        <div class="rc-rank">${fm.rank}</div>
        <div class="rc-name">${fm.name}</div>
        <div class="rc-score">${fm.total.toFixed(2)}</div>
        <div class="rc-label">GW Score</div>
        ${ptsLabel}
      </div>`;
    }).join('');

    // Summary strip
    const bestPtsForm = hasLive ? byPts[0] : null;
    const summaryStrip = `
      <div class="eval-summary-strip">
        <div class="eval-stat">
          <div class="eval-stat-label">Formasi</div>
          <div class="eval-stat-val">${f.name}</div>
        </div>
        <div class="eval-stat">
          <div class="eval-stat-label">GW Score</div>
          <div class="eval-stat-val" style="color:var(--blue)">${f.total.toFixed(2)}</div>
        </div>
        ${hasLive ? `
        <div class="eval-stat">
          <div class="eval-stat-label">Poin 11 Pemain</div>
          <div class="eval-stat-val" style="color:var(--text)">${f.totalActual}</div>
        </div>
        <div class="eval-stat">
          <div class="eval-stat-label">+ Captain (×2)</div>
          <div class="eval-stat-val" style="color:var(--gold)">+${f.capBonus}</div>
        </div>
        <div class="eval-stat highlight">
          <div class="eval-stat-label">Total Poin</div>
          <div class="eval-stat-val" style="color:var(--green);font-size:24px">${f.totalWithCap}</div>
        </div>
        ` : `
        <div class="eval-stat">
          <div class="eval-stat-label">Poin Aktual</div>
          <div class="eval-stat-val dim">Menunggu GW</div>
        </div>
        `}
      </div>`;

    return `
      <div class="rank-grid">${cards}</div>
      ${summaryStrip}
      <div class="lineup-container">
        <div>
          <div class="section-title">Lineup — Formasi ${f.name}</div>
          <div class="table-wrap">
            <table>
              <thead><tr>
                <th>Slot</th><th>Pemain</th><th>Tim</th><th>Lawan</th>
                <th class="r">GWScore</th>${hasLive?'<th class="r">Poin</th>':''}<th class="r">FDR</th><th class="r">PPG</th><th class="r">£</th>
              </tr></thead>
              <tbody>${this._lineupRows(f, hasLive)}</tbody>
            </table>
          </div>
        </div>
        ${this._pitch(f)}
      </div>`;
  },

  _lineupRows(f, hasLive=false) {
    const ptsCol = hasLive;
    const emptyPts = ptsCol ? '<td></td>' : '';
    const R = (slot,p,cls='')=>{
      if(!p) return `<tr class="${cls}"><td style="font-size:11px;letter-spacing:1px;text-transform:uppercase;color:var(--text3);width:70px">${slot}</td><td class="dim">–</td><td></td><td></td><td></td>${emptyPts}<td></td><td></td><td></td></tr>`;
      const sc=p.GWScore, d=p.doubt?'<span class="doubt-tag">⚠</span>':'';
      const dgw=p.isBlank?'<span style="color:var(--red);font-size:10px"> ⛔BGW</span>'
                :p.isDGW?'<span style="color:var(--blue);font-size:10px"> 2GW</span>':'';
      const isCap = f.cap && p.id===f.cap.id;
      const isVC  = f.vc && p.id===f.vc.id;
      const badge = isCap?'<span class="cap-tag">★ C</span>':isVC?'<span class="vc-tag">☆ V</span>':'';
      const ptsCell = ptsCol
        ? `<td class="mono r ${H.ptsClass(p.livePoints)}" style="font-weight:700">
            ${p.livePoints!=null?p.livePoints:'–'}${isCap&&p.livePoints!=null?`<span class="cap-x2"> ×2=${p.livePoints*2}</span>`:''}
           </td>`
        : '';
      return `<tr class="${cls}${isCap?' row-cap':''}${isVC?' row-vc':''}">
        <td style="font-size:11px;letter-spacing:1px;text-transform:uppercase;color:var(--text3)">${slot}</td>
        <td style="font-size:15px;font-weight:600">${p.Player}${d}${dgw}${badge}</td>
        <td>${H.teamTag(p.Team)}</td>
        <td class="dim" style="font-size:12px">${p.isHome?'🏠':'✈'} ${p.opponent||'?'}</td>
        <td class="mono r ${H.scoreClass(sc)}">${sc.toFixed(2)}</td>
        ${ptsCell}
        <td class="mono dim r">${H.numFmt(p.FDR_next,1)}</td>
        <td class="mono dim r">${H.numFmt(p.PPG,1)}</td>
        <td class="mono dim r">£${p.Price.toFixed(1)}</td>
      </tr>`;
    };
    const pad=(a,n)=>[...a,...Array(n-a.length).fill(null)];
    const rows=[];
    rows.push(R('GK',f.gk,'row-sep'));
    pad(f.def,5).forEach((p,i)=>rows.push(R(`DEF ${i+1}`,p,i===0?'row-sep':'')));
    pad(f.mid,5).forEach((p,i)=>rows.push(R(`MID ${i+1}`,p,i===0?'row-sep':'')));
    pad(f.fwd,3).forEach((p,i)=>rows.push(R(`FWD ${i+1}`,p,i===0?'row-sep':'')));

    // Total & Rank rows
    if (ptsCol) {
      rows.push(`<tr class="row-total">
        <td style="font-size:11px;letter-spacing:1px;text-transform:uppercase;color:var(--text3)">Total</td>
        <td colspan="3" class="dim" style="font-size:12px">11 pemain</td>
        <td class="mono r" style="font-size:18px;font-weight:700;color:var(--blue)">${f.total.toFixed(2)}</td>
        <td class="mono r" style="font-size:14px;color:var(--text2)">${f.totalActual}</td>
        <td></td><td></td><td></td></tr>`);
      rows.push(`<tr class="row-total-pts">
        <td style="font-size:11px;letter-spacing:1px;text-transform:uppercase;color:var(--gold)">+ Captain</td>
        <td colspan="3" class="dim" style="font-size:12px">${f.cap?f.cap.Player+' ×2':''}</td>
        <td></td>
        <td class="mono r" style="font-size:20px;font-weight:800;color:var(--green)">${f.totalWithCap}</td>
        <td></td><td></td><td></td></tr>`);
    } else {
      rows.push(`<tr class="row-total">
        <td style="font-size:11px;letter-spacing:1px;text-transform:uppercase;color:var(--text3)">Total</td>
        <td colspan="3" class="dim" style="font-size:12px">GK + 10 outfield</td>
        <td class="mono r" style="font-size:18px;font-weight:700;color:var(--green)">${f.total.toFixed(2)}</td>
        <td></td><td></td><td></td></tr>`);
    }
    rows.push(`<tr class="row-rank">
      <td style="font-size:11px;letter-spacing:1px;text-transform:uppercase;color:var(--text3)">Rank</td>
      <td colspan="3" class="dim" style="font-size:12px">dari ${Store.formations.length} formasi</td>
      <td class="mono r" style="font-size:20px;font-weight:800;color:${f.rank===1?'var(--gold)':f.rank===2?'#90caf9':f.rank===3?'var(--purple)':'var(--text2)'}">#${f.rank}</td>
      ${ptsCol?'<td></td>':''}<td></td><td></td><td></td></tr>`);
    return rows.join('');
  },

  _pitch(f) {
    const hasLive = f.hasLive;
    const shirtUrl = (p) => {
      if (!p?.TeamCode) return '';
      const isGK = p.Position === 'GK';
      return `https://fantasy.premierleague.com/dist/img/shirts/standard/shirt_${p.TeamCode}${isGK?'_1':''}-110.webp`;
    };
    const chip=(p,ex='')=>{
      if(!p) return `<div class="player-chip empty"><div class="p-shirt-img-wrap"><div class="p-shirt sh-default"></div></div></div>`;
      const d=p.doubt?' doubt':'';
      const isCap = f.cap && p.id===f.cap.id;
      const isVC  = f.vc && p.id===f.vc.id;
      const capBadge = isCap ? '<div class="p-cap-badge cap-badge">C</div>' : isVC ? '<div class="p-cap-badge vc-badge">V</div>' : '';
      const ptsHtml = hasLive && p.livePoints!=null
        ? `<div class="p-chip-pts ${H.ptsClass(p.livePoints)}">${isCap ? p.livePoints*2 : p.livePoints}</div>`
        : '';
      const tip = `${p.Player} (${p.Team})\n${p.Position} · £${p.Price.toFixed(1)}\nGWScore: ${p.GWScore.toFixed(2)}\nFDR: ${H.numFmt(p.FDR_next,1)} · ${p.isHome?'Home':'Away'} vs ${p.opponent||'?'}\nPPG: ${H.numFmt(p.PPG,1)} · xGI: ${H.numFmt(p.xGI,2)}${p.isBlank?' · ⛔ BLANK':''}${p.isDGW?' · 2️⃣ DGW':''}`;
      return `<div class="player-chip" title="${tip}">
        <div class="p-shirt-img-wrap">
          <img class="p-shirt-img" src="${shirtUrl(p)}" alt="${p.Team}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
          <div class="p-shirt sh-${p.Team||'default'}" style="display:none">${p.Team||'?'}</div>
          ${capBadge}
        </div>
        <div class="p-chip-name">${p.Player.split(' ').slice(-1)[0]}${isCap?' ★':isVC?' ☆':''}</div>
        <div class="p-chip-score${d}">${p.GWScore.toFixed(1)}</div>
        ${ptsHtml}
      </div>`;
    };
    const ptsHeader = hasLive
      ? ` — <span style="color:var(--green)">${f.totalWithCap} pts</span>`
      : '';
    return `<div class="pitch-wrap">
      <div class="section-title">Pitch View${ptsHeader}</div>
      <div class="pitch">
        <svg class="pitch-lines" viewBox="0 0 100 150" preserveAspectRatio="none">
          <rect x="5" y="5" width="90" height="140" rx="1" stroke="white" stroke-width=".8" fill="none"/>
          <line x1="5" y1="75" x2="95" y2="75" stroke="white" stroke-width=".4"/>
          <circle cx="50" cy="75" r="12" stroke="white" stroke-width=".4" fill="none"/>
          <rect x="25" y="5" width="50" height="18" stroke="white" stroke-width=".4" fill="none"/>
          <rect x="37" y="5" width="26" height="9" stroke="white" stroke-width=".4" fill="none"/>
          <rect x="25" y="127" width="50" height="18" stroke="white" stroke-width=".4" fill="none"/>
          <rect x="37" y="136" width="26" height="9" stroke="white" stroke-width=".4" fill="none"/>
        </svg>
        <div class="pitch-inner">
          <div class="pitch-row" style="flex:1.2">${f.fwd.map(p=>chip(p)).join('')}</div>
          <div class="pitch-row" style="flex:1.4">${f.mid.map(p=>chip(p)).join('')}</div>
          <div class="pitch-row" style="flex:1.4">${f.def.map(p=>chip(p)).join('')}</div>
          <div class="pitch-row" style="flex:1">${chip(f.gk)}</div>
        </div>
      </div>
    </div>`;
  },

  // ── Evaluasi Poin — Perbandingan poin aktual semua formasi ──
  lineupEval() {
    const fms = Store.formations;
    if (!fms.length) return H.error('Data belum siap.');
    const hasLive = fms[0]?.hasLive;

    if (!hasLive)
      return H.info('Data poin aktual belum tersedia untuk GW ini. Poin akan muncul setelah pertandingan berlangsung.');

    // Sort formations by actual pts
    const byPts = [...fms].sort((a,b)=>b.totalWithCap-a.totalWithCap);
    const maxPts = Math.max(...byPts.map(f=>f.totalWithCap), 1);
    const bestForm = byPts[0];

    // Summary
    let html = `
      <div class="eval-summary-strip">
        <div class="eval-stat highlight">
          <div class="eval-stat-label">Formasi Terbaik (Poin)</div>
          <div class="eval-stat-val" style="color:var(--gold)">${bestForm.name}</div>
        </div>
        <div class="eval-stat">
          <div class="eval-stat-label">Total Poin Tertinggi</div>
          <div class="eval-stat-val" style="color:var(--green)">${bestForm.totalWithCap}</div>
        </div>
        <div class="eval-stat">
          <div class="eval-stat-label">GW Score Tertinggi</div>
          <div class="eval-stat-val" style="color:var(--blue)">${[...fms].sort((a,b)=>b.total-a.total)[0].name} (${[...fms].sort((a,b)=>b.total-a.total)[0].total.toFixed(2)})</div>
        </div>
        <div class="eval-stat">
          <div class="eval-stat-label">Captain Terbaik</div>
          <div class="eval-stat-val" style="color:var(--gold)">${bestForm.cap?bestForm.cap.Player+' ('+((bestForm.cap.livePoints||0)*2)+' pts)':'–'}</div>
        </div>
      </div>`;

    // Ranking table
    html += `
      <div class="section-title">Ranking Formasi — Poin Aktual GW ${Store.currentGW}</div>
      <div class="table-wrap">
        <table>
          <thead><tr>
            <th class="c">#</th><th>Formasi</th>
            <th class="r">GW Score</th><th class="r">Rank Score</th>
            <th class="r">Poin (11)</th><th class="r">Cap Bonus</th>
            <th class="r">Total Poin</th><th class="r">Rank Poin</th>
            <th>Bar</th>
          </tr></thead>
          <tbody>`;

    byPts.forEach((fm, i) => {
      const pct = Math.round(fm.totalWithCap / maxPts * 100);
      const barColor = i===0?'var(--gold)':i===1?'var(--blue)':'var(--border2)';
      html += `<tr class="${i===0?'row-best':''}">
        <td class="c mono" style="font-size:18px;font-weight:800;color:${i===0?'var(--gold)':i===1?'#90caf9':i===2?'var(--purple)':'var(--text3)'}">${i+1}</td>
        <td style="font-size:16px;font-weight:700;letter-spacing:1px">${fm.name}</td>
        <td class="mono r ${H.scoreClass(fm.total/10)}">${fm.total.toFixed(2)}</td>
        <td class="mono dim r">#${fm.rank}</td>
        <td class="mono r">${fm.totalActual}</td>
        <td class="mono r" style="color:var(--gold)">+${fm.capBonus}</td>
        <td class="mono r" style="font-weight:800;font-size:16px;color:var(--green)">${fm.totalWithCap}</td>
        <td class="mono c" style="font-weight:700;color:${i===0?'var(--gold)':'var(--text3)'}">#${i+1}</td>
        <td style="min-width:160px">
          <div class="eval-bar"><div class="eval-bar-fill" style="width:${pct}%;background:${barColor}"></div></div>
        </td>
      </tr>`;
    });
    html += `</tbody></table></div>`;

    // Detail pemain formasi terbaik
    html += `
      <div class="section-title" style="margin-top:24px">Detail Poin — ${bestForm.name} (Total: ${bestForm.totalWithCap} pts)</div>
      <div class="table-wrap">
        <table>
          <thead><tr>
            <th>Pos</th><th>Pemain</th><th>Tim</th><th>Lawan</th>
            <th class="r">GWScore</th><th class="r">Poin</th><th class="c">Cap</th><th class="r">Kontribusi</th>
          </tr></thead>
          <tbody>`;

    (bestForm.all||[]).forEach(p => {
      const isCap = bestForm.cap && p.id===bestForm.cap.id;
      const pts = p.livePoints ?? 0;
      const contrib = isCap ? pts*2 : pts;
      html += `<tr class="${isCap?'row-cap':''}">
        <td>${H.posPill(p.Position)}</td>
        <td style="font-weight:600">${p.Player}${p.doubt?' <span class="doubt-tag">⚠</span>':''}</td>
        <td>${H.teamTag(p.Team)}</td>
        <td class="dim" style="font-size:12px">${p.isHome?'🏠':'✈'} ${p.opponent||'?'}</td>
        <td class="mono r ${H.scoreClass(p.GWScore)}">${p.GWScore.toFixed(2)}</td>
        <td class="mono r ${H.ptsClass(p.livePoints)}" style="font-weight:700">${p.livePoints!=null?p.livePoints:'–'}</td>
        <td class="c">${isCap?'<span style="background:var(--gold);color:#000;padding:1px 6px;border-radius:3px;font-size:10px;font-weight:800">C ×2</span>':''}</td>
        <td class="mono r" style="font-weight:700;color:${contrib>=8?'var(--green)':contrib>=4?'var(--blue)':'var(--text3)'}">${contrib}</td>
      </tr>`;
    });

    const totalContrib = (bestForm.all||[]).reduce((s,p)=>{
      const pts=p.livePoints??0;
      return s+(bestForm.cap&&p.id===bestForm.cap.id?pts*2:pts);
    },0);

    html += `<tr class="row-total">
      <td colspan="7" style="font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:var(--text3)">Total Kontribusi (termasuk captain ×2)</td>
      <td class="mono r" style="font-size:20px;font-weight:800;color:var(--green)">${totalContrib}</td>
    </tr></tbody></table></div>`;

    // Accuracy analysis
    html += `
      <div class="section-title" style="margin-top:24px">Akurasi Prediksi — GW Score vs Poin Aktual</div>
      <div class="eval-accuracy-grid">`;

    const allSelected = new Map();
    fms.forEach(fm => (fm.all||[]).forEach(p => { if(!allSelected.has(p.id)) allSelected.set(p.id,p); }));
    const uniquePlayers = [...allSelected.values()].sort((a,b)=>(b.livePoints??0)-(a.livePoints??0));

    html += `<div class="table-wrap"><table>
      <thead><tr><th>Pos</th><th>Pemain</th><th>Tim</th>
        <th class="r">GWScore</th><th class="r">Poin Aktual</th><th class="r">Selisih</th><th>Akurasi</th>
      </tr></thead><tbody>`;

    uniquePlayers.forEach(p => {
      const pts = p.livePoints ?? 0;
      const diff = pts - p.GWScore;
      const pct  = p.GWScore > 0 ? Math.min(100, Math.round(pts / p.GWScore * 100)) : 0;
      html += `<tr>
        <td>${H.posPill(p.Position)}</td>
        <td style="font-weight:600">${p.Player}</td>
        <td>${H.teamTag(p.Team)}</td>
        <td class="mono r ${H.scoreClass(p.GWScore)}">${p.GWScore.toFixed(2)}</td>
        <td class="mono r ${H.ptsClass(p.livePoints)}" style="font-weight:700">${p.livePoints!=null?p.livePoints:'–'}</td>
        <td class="mono r" style="color:${diff>=0?'var(--green)':'var(--red)'}">
          ${p.livePoints!=null?(diff>=0?'+':'')+diff.toFixed(1):'–'}
        </td>
        <td style="min-width:100px">
          <div class="eval-bar"><div class="eval-bar-fill" style="width:${pct}%;background:${pct>=70?'var(--green)':pct>=40?'var(--gold)':'var(--red)'}"></div></div>
        </td>
      </tr>`;
    });

    html += `</tbody></table></div></div>`;
    return html;
  },

  // ── Scout Weight (read-only) ───────────────────────────
  scoutWeight() {
    if (!Store.scoutWeights) Store.scoutWeights = JSON.parse(JSON.stringify(CFG.SCOUT_WEIGHTS));
    return this._criteriaWeightPanel('scout', Store.scoutWeights, 'Scout Scoring Weights',
      'Edit bobot lalu klik <b>Apply</b>. Total tiap posisi harus = 100%.');
  },

  scoutOptimize() {
    return this._optimizePanel('scout');
  },

  // ══════════════════════════════════════════════════════
  // PRICE CHANGE PREDICTOR
  // ══════════════════════════════════════════════════════
  pricePredictor() {
    if (!Store.bootstrap) return H.info('Data belum dimuat.');
    const bs = Store.bootstrap;
    const teamMap = {};
    bs.teams.forEach(t => { teamMap[t.id] = t; });

    // FPL price change threshold: ~100K net transfers for £0.1 change
    // We estimate probability based on net transfer ratio
    const players = bs.elements.filter(p => p.status !== 'u').map(p => {
      const netIn  = (+p.transfers_in_event || 0);
      const netOut = (+p.transfers_out_event || 0);
      const net    = netIn - netOut;
      const tsb    = +p.selected_by_percent || 0;
      // Total FPL managers ~11M, but active ~4M
      const activeMgrs = 4000000;
      const owned = Math.round(tsb / 100 * activeMgrs);
      // Threshold: need ~ownership/10 net transfers for price change
      const threshold = Math.max(owned * 0.04, 50000);
      const riseProb  = net > 0 ? Math.min(99, Math.round(net / threshold * 100)) : 0;
      const fallProb  = net < 0 ? Math.min(99, Math.round(Math.abs(net) / threshold * 100)) : 0;
      const direction = riseProb > 50 ? 'rise' : fallProb > 50 ? 'fall' : 'stable';
      const costChange = (+p.cost_change_event || 0) / 10;
      const costStart  = (+p.cost_change_start || 0) / 10;

      return {
        id: p.id,
        Player: p.web_name,
        Team: teamMap[p.team]?.short_name || '?',
        Position: ['','GK','DEF','MID','FWD'][p.element_type] || '?',
        Price: p.now_cost / 10,
        TSB: tsb,
        TIn: netIn,
        TOut: netOut,
        Net: net,
        riseProb, fallProb, direction,
        costChange, costStart,
        status: p.status,
      };
    });

    // Sort by probability (highest first)
    const risers = [...players].filter(p => p.riseProb > 20).sort((a,b) => b.riseProb - a.riseProb).slice(0, 20);
    const fallers = [...players].filter(p => p.fallProb > 20).sort((a,b) => b.fallProb - a.fallProb).slice(0, 20);

    const makeRow = (p, type) => {
      const prob = type === 'rise' ? p.riseProb : p.fallProb;
      const probColor = prob >= 80 ? 'var(--green)' : prob >= 50 ? 'var(--gold)' : 'var(--text2)';
      const probBar = `<div class="corr-bar" style="width:60px"><div class="corr-fill ${type==='rise'?'corr-pos':'corr-neg'}" style="width:${prob}%"></div></div>`;
      const arrow = type === 'rise' ? '📈' : '📉';
      return `<tr>
        <td>${H.posPill(p.Position)}</td>
        <td style="font-weight:600">${p.Player}</td>
        <td>${H.teamTag(p.Team)}</td>
        <td class="mono r">£${p.Price.toFixed(1)}</td>
        <td class="mono r" style="color:${type==='rise'?'var(--green)':'var(--red)'}">${p.costChange>=0?'+':''}${p.costChange.toFixed(1)}</td>
        <td class="mono r s-hi">${p.TIn.toLocaleString()}</td>
        <td class="mono r s-lo">${p.TOut.toLocaleString()}</td>
        <td class="mono r" style="color:${p.Net>0?'var(--green)':'var(--red)'}${p.Net===0?';color:var(--text3)':''}">${p.Net>0?'+':''}${p.Net.toLocaleString()}</td>
        <td class="mono c" style="color:${probColor};font-weight:700">${arrow} ${prob}%</td>
        <td>${probBar}</td>
      </tr>`;
    };

    const riseRows = risers.map(p => makeRow(p, 'rise')).join('');
    const fallRows = fallers.map(p => makeRow(p, 'fall')).join('');

    const tableHead = `<thead><tr>
      <th>Pos</th><th>Pemain</th><th>Tim</th><th class="r">Harga</th><th class="r">Δ GW</th>
      <th class="r">In</th><th class="r">Out</th><th class="r">Net</th><th class="c">Prob</th><th></th>
    </tr></thead>`;

    return `
      <div class="section-title">💰 Price Change Predictor — GW${Store.currentGW||'–'}</div>
      ${H.info('Prediksi kenaikan/penurunan harga berdasarkan net transfer relatif terhadap ownership. Threshold bervariasi per pemain.')}

      <div class="two-col">
        <div>
          <div class="section-title" style="color:var(--green)">📈 Likely to Rise (${risers.length})</div>
          <div class="table-wrap" style="max-height:500px;overflow-y:auto">
            <table>${tableHead}<tbody>${riseRows||'<tr><td colspan="10" class="dim c">Tidak ada kandidat naik harga</td></tr>'}</tbody></table>
          </div>
        </div>
        <div>
          <div class="section-title" style="color:var(--red)">📉 Likely to Fall (${fallers.length})</div>
          <div class="table-wrap" style="max-height:500px;overflow-y:auto">
            <table>${tableHead}<tbody>${fallRows||'<tr><td colspan="10" class="dim c">Tidak ada kandidat turun harga</td></tr>'}</tbody></table>
          </div>
        </div>
      </div>`;
  },

  // ══════════════════════════════════════════════════════
  // DIFFERENTIAL FINDER
  // ══════════════════════════════════════════════════════
  differentialFinder() {
    if (!Store.scoredPlayers.length) return H.info('Data belum dimuat.');

    const maxTSB = +(Store._diffMaxTSB || 10);
    const posFilter = Store._diffPos || 'ALL';

    const fBtns = ['ALL','GK','DEF','MID','FWD'].map(p =>
      `<button class="filter-btn ${posFilter===p?'active':''}"
        onclick="Store._diffPos='${p}';Nav.goSubtab('scout','diff')">${p}</button>`
    ).join('');

    const tsbSlider = `
      <div style="display:flex;align-items:center;gap:10px;margin-left:auto">
        <span class="dim" style="font-size:11px">Max TSB:</span>
        <input type="range" min="1" max="30" step="1" value="${maxTSB}" class="fdr-slider"
          oninput="Store._diffMaxTSB=+this.value;document.getElementById('diff-tsb-val').textContent=this.value+'%';Nav.goSubtab('scout','diff')">
        <span id="diff-tsb-val" class="mono" style="font-size:12px;color:var(--gold);min-width:30px">${maxTSB}%</span>
      </div>`;

    const diffs = Store.scoredPlayers
      .filter(p => p.TSB <= maxTSB && p.TSB > 0)
      .filter(p => posFilter === 'ALL' || p.Position === posFilter)
      .filter(p => !p.isBlank)
      .sort((a,b) => b.GWScore - a.GWScore)
      .slice(0, 30);

    const rows = diffs.map((p,i) => {
      const sc = p.GWScore;
      const diffScore = +(sc * (1 + (10 - p.TSB) / 10)).toFixed(2); // Bonus for low ownership
      return `<tr>
        <td class="dim">${i+1}</td>
        <td>${H.posPill(p.Position)}</td>
        <td style="font-weight:600">${p.Player}${p.doubt?'<span class="doubt-tag">⚠</span>':''}</td>
        <td>${H.teamTag(p.Team)}</td>
        <td class="mono r ${H.scoreClass(sc)}">${sc.toFixed(2)}</td>
        <td class="mono r" style="color:var(--gold);font-weight:700">${diffScore.toFixed(2)}</td>
        <td class="mono r dim">${H.pct(p.TSB)}</td>
        <td class="c">${p.isHome?'🏠':'✈'} <span class="dim" style="font-size:11px">${p.opponent}</span></td>
        <td class="mono r">${H.numFmt(p.FDR_next,1)}</td>
        <td class="mono r">${H.numFmt(p.Form,1)}</td>
        <td class="mono r">${H.numFmt(p.PPG,1)}</td>
        <td class="mono r">${H.numFmt(p.xGI,2)}</td>
        <td class="mono dim r">£${p.Price.toFixed(1)}</td>
      </tr>`;
    }).join('');

    return `
      <div class="section-title">🔮 Differential Finder — TSB ≤ ${maxTSB}%</div>
      ${H.info('Pemain dengan ownership rendah tapi skor tinggi. <b>Diff Score</b> = GWScore × bonus low-ownership. Ideal untuk mengejar rank.')}
      <div class="filters">
        ${fBtns}
        ${tsbSlider}
      </div>
      <div class="table-wrap max-h">
        <table>
          <thead><tr>
            <th>#</th><th>Pos</th><th>Pemain</th><th>Tim</th>
            <th class="r" title="GW Score standar">Score</th>
            <th class="r" title="Score × bonus ownership rendah" style="color:var(--gold)">Diff Score</th>
            <th class="r">TSB%</th><th>Lawan</th><th class="r">FDR</th>
            <th class="r">Form</th><th class="r">PPG</th><th class="r">xGI</th><th class="r">£</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  },

  // ══════════════════════════════════════════════════════
  // CAPTAIN SIMULATOR
  // ══════════════════════════════════════════════════════
  captainSimulator() {
    if (!Store.scoredPlayers.length) return H.info('Data belum dimuat.');

    const bs = Store.bootstrap;
    const liveMap = {};
    if (Store.liveEvent?.elements) Store.liveEvent.elements.forEach(e => { liveMap[e.id] = e.stats; });

    // Top captain candidates: sort by weighted captain score
    const candidates = Store.scoredPlayers
      .filter(p => !p.isBlank && p.Position !== 'GK')
      .map(p => {
        const live = liveMap[p.id];
        const livePts = live?.total_points ?? null;
        // Captain score: heavily weight form, xGI, PPG, and FDR
        const capScore = +(
          (p.scores?.form || 0) * 0.25 +
          (p.scores?.xgi || 0) * 0.25 +
          (p.scores?.ppg || 0) * 0.20 +
          (p.scores?.fdr_short || 0) * 0.15 +
          (p.scores?.home || 0) * 0.05 +
          (p.scores?.ep_next || 0) * 0.10
        ).toFixed(2);
        const ep = +(bs?.elements?.find(e => e.id === p.id)?.ep_next || 0);
        return { ...p, capScore: +capScore, ep, livePts };
      })
      .sort((a,b) => b.capScore - a.capScore)
      .slice(0, 10);

    const hasLive = candidates.some(c => c.livePts != null);

    const rows = candidates.map((p,i) => {
      const medal = i===0?'🥇':i===1?'🥈':i===2?'🥉':'';
      const liveCol = hasLive
        ? `<td class="mono r ${H.ptsClass(p.livePts)}" style="font-weight:700">${p.livePts!=null?`${p.livePts} → <b style="color:var(--gold)">${p.livePts*2}</b>`:''}</td>`
        : '';
      return `<tr class="${i===0?'highlight-row':''}">
        <td style="font-size:16px;text-align:center">${medal||i+1}</td>
        <td>${H.posPill(p.Position)}</td>
        <td style="font-weight:${i<3?700:400}">${p.Player}${p.doubt?'<span class="doubt-tag">⚠</span>':''}${p.isDGW?'<span style="color:var(--blue);font-size:10px"> 2GW</span>':''}</td>
        <td>${H.teamTag(p.Team)}</td>
        <td class="c">${p.isHome?'🏠':'✈'} <span class="dim" style="font-size:11px">${p.opponent}</span></td>
        <td class="mono r ${H.fdrClass(p.FDR_next)}" style="font-weight:700">${H.numFmt(p.FDR_next,1)}</td>
        <td class="mono r ${H.scoreClass(p.capScore)}" style="font-size:15px;font-weight:700">${p.capScore}</td>
        <td class="mono r">${H.numFmt(p.ep,1)}</td>
        <td class="mono r">${H.numFmt(p.Form,1)}</td>
        <td class="mono r">${H.numFmt(p.PPG,1)}</td>
        <td class="mono r">${H.numFmt(p.xGI,2)}</td>
        <td class="mono dim r">${H.pct(p.TSB)}</td>
        ${liveCol}
      </tr>`;
    }).join('');

    // Breakdown chart for top 3
    const top3 = candidates.slice(0,3);
    const factors = [
      {key:'form', label:'Form', w:25},
      {key:'xgi', label:'xGI', w:25},
      {key:'ppg', label:'PPG', w:20},
      {key:'fdr_short', label:'FDR', w:15},
      {key:'ep_next', label:'EP', w:10},
      {key:'home', label:'H/A', w:5},
    ];
    const breakdownRows = factors.map(f => {
      const cells = top3.map(p => {
        const v = p.scores?.[f.key] || 0;
        return `<td class="mono c ${H.scoreClass(v)}">${v.toFixed(1)}</td>`;
      }).join('');
      return `<tr><td>${f.label} <span class="dim">(${f.w}%)</span></td>${cells}</tr>`;
    }).join('');
    const totalCells = top3.map(p => `<td class="mono c" style="font-weight:700;color:var(--green);font-size:15px">${p.capScore}</td>`).join('');
    const breakdownHead = top3.map(p => `<th class="c" style="min-width:80px">${p.Player.split(' ').slice(-1)[0]}</th>`).join('');

    return `
      <div class="section-title">👑 Captain Simulator — GW${Store.currentGW||'–'}</div>
      ${H.info('Captain Score = Form(25%) + xGI(25%) + PPG(20%) + FDR(15%) + EP(10%) + Home(5%). Pemain terbaik untuk captain minggu ini.')}

      <div class="two-col">
        <div>
          <div class="section-title">Top 10 Kandidat Captain</div>
          <div class="table-wrap" style="max-height:500px;overflow-y:auto">
            <table>
              <thead><tr>
                <th class="c">#</th><th>Pos</th><th>Pemain</th><th>Tim</th><th>Lawan</th>
                <th class="r">FDR</th><th class="r" style="color:var(--gold)">Cap Score</th>
                <th class="r">EP</th><th class="r">Form</th><th class="r">PPG</th><th class="r">xGI</th>
                <th class="r">TSB%</th>${hasLive?'<th class="r">Live (×2)</th>':''}
              </tr></thead>
              <tbody>${rows}</tbody>
            </table>
          </div>
        </div>
        <div>
          <div class="section-title">Perbandingan Top 3</div>
          <div class="table-wrap">
            <table class="weight-table">
              <thead><tr><th>Faktor</th>${breakdownHead}</tr></thead>
              <tbody>${breakdownRows}</tbody>
              <tfoot><tr class="wt-trow"><td>Total</td>${totalCells}</tr></tfoot>
            </table>
          </div>
          <div class="info-box" style="margin-top:14px">
            <b>Rekomendasi Captain:</b><br>
            🥇 <b style="color:var(--green)">${top3[0]?.Player||'–'}</b> (${top3[0]?.Team||''}) — Score ${top3[0]?.capScore||0}
            ${top3[0]?.isHome?', bermain di kandang':''}
            ${top3[0]?.isDGW?' 🔥 Double GW!':''}
            <br>
            🥈 Alternatif: <b>${top3[1]?.Player||'–'}</b> (${top3[1]?.capScore||0})
            &nbsp;|&nbsp;
            🥉 <b>${top3[2]?.Player||'–'}</b> (${top3[2]?.capScore||0})
          </div>
        </div>
      </div>`;
  },

  // ── Shared criteria weight panel (used by WLineUp & Scout Weights) ──
  _criteriaWeightPanel(mode, weights, title, hint) {
    const prefix = mode === 'gw' ? 'gwt' : 'scwt';
    const pos = ['GK','DEF','MID','FWD'];
    const activeKeys = Object.keys(weights);

    // Sort active keys by group order
    const groupOrder = ['Fixture','Performance','Attacking','Defending','ICT','Discipline','Value','Transfers','Other'];
    const sortedKeys = [...activeKeys].sort((a,b) => {
      const ga = CRITERIA_MAP[a]?.group || 'Other', gb = CRITERIA_MAP[b]?.group || 'Other';
      const ia = groupOrder.indexOf(ga), ib = groupOrder.indexOf(gb);
      return (ia===-1?99:ia) - (ib===-1?99:ib);
    });

    // Pre-compute display values using largest-remainder per position (ensures sum = 100%)
    const displayVals = {};
    sortedKeys.forEach(key => { displayVals[key] = {}; });
    pos.forEach(p => {
      const rawPcts = sortedKeys.map(key => ((weights[key]?.[p]||0)*100));
      const floors = rawPcts.map(v => Math.floor(v));
      const rems = rawPcts.map((v,i) => ({i, r: v - floors[i]}));
      let deficit = 100 - floors.reduce((s,v)=>s+v,0);
      rems.sort((a,b)=>b.r-a.r);
      for (let j=0; j<deficit && j<rems.length; j++) floors[rems[j].i]++;
      sortedKeys.forEach((key,i) => { displayVals[key][p] = floors[i]; });
    });

    // Weight table rows with group separators and tooltips
    let lastGroup = '';
    const rows = sortedKeys.map(key => {
      const crit = CRITERIA_MAP[key];
      const label = crit ? crit.label : key;
      const grp = crit?.group || '';
      const tip = crit?.tip ? ` title="${crit.tip}"` : '';
      const vals = weights[key] || {GK:0,DEF:0,MID:0,FWD:0};
      // Group separator
      let sep = '';
      if (grp && grp !== lastGroup) {
        sep = `<tr class="wt-group-sep"><td colspan="${pos.length+2}" class="wt-group-label">${grp}</td></tr>`;
        lastGroup = grp;
      }
      return `${sep}<tr>
        <td class="crit-cell"${tip}>
          <span class="crit-label">${label}</span>
        </td>
        ${pos.map(p => `<td>
          <input class="weight-input" type="number"
            data-factor="${key}" data-pos="${p}" data-mode="${mode}"
            value="${displayVals[key]?.[p] ?? 0}"
            min="0" max="100" step="1"
            oninput="UI.updateWeightTotals('${prefix}')">
        </td>`).join('')}
        <td class="crit-action">
          <button class="btn-crit-remove" onclick="UI.removeCriteria('${mode}','${key}')" title="Hapus">✕</button>
        </td>
      </tr>`;
    }).join('');

    const totRow = pos.map(p => `<td class="wt-total" id="${prefix}-${p}">–</td>`).join('');

    // FDR Horizon slider — only for Scout mode
    const fdrSlider = mode === 'scout' ? `
      <div class="fdr-horizon-row">
        <label>FDR Horizon: <b id="fdr-horizon-val">${Store.fdrHorizon}</b> GW</label>
        <input type="range" min="1" max="8" step="1" value="${Store.fdrHorizon}"
          class="fdr-slider" oninput="UI.setFdrHorizon(this.value)">
        <span class="dim" style="font-size:11px">1 = hanya GW depan · 8 = rata-rata 8 GW</span>
      </div>` : '';

    // Criteria selector (grouped) with tooltips
    const groups = {};
    CRITERIA.forEach(c => {
      if (!groups[c.group]) groups[c.group] = [];
      groups[c.group].push(c);
    });
    const selectorRows = groupOrder.filter(g => groups[g]).map(grp => {
      const crits = groups[grp];
      const items = crits.map(c => {
        const isActive = activeKeys.includes(c.key);
        const tip = c.tip ? ` title="${c.tip}"` : '';
        return `<button class="crit-chip ${isActive ? 'active' : ''}"
          onclick="UI.toggleCriteria('${mode}','${c.key}')"
          ${isActive ? 'disabled' : ''}${tip}>
          ${isActive ? '✓ ' : '+ '}${c.label}
        </button>`;
      }).join('');
      return `<div class="crit-group-row">
        <div class="crit-group-label">${grp}</div>
        <div class="crit-chips">${items}</div>
      </div>`;
    }).join('');

    return `
      <div class="section-title">${title}</div>
      <div class="info-box">${hint}</div>
      ${fdrSlider}

      <div class="table-wrap" style="max-width:700px">
        <table class="weight-table">
          <thead><tr>
            <th>Kriteria</th>${pos.map(p => `<th>${p}</th>`).join('')}<th style="width:36px"></th>
          </tr></thead>
          <tbody>${rows}</tbody>
          <tfoot><tr class="wt-trow"><td style="color:var(--text3)">Total</td>${totRow}<td></td></tr></tfoot>
        </table>
      </div>

      <div class="btn-row">
        <button class="btn btn-primary" onclick="UI.apply${mode==='gw'?'GW':'Scout'}Weights()">✓ Apply & Recalculate</button>
        <button class="btn btn-secondary" onclick="UI.reset${mode==='gw'?'GW':'Scout'}Weights()">↺ Reset Default</button>
        ${mode==='gw'?'<button class="btn btn-secondary" onclick="Nav.goSubtab(\'lineup\',\'optimize\')">⚡ Optimize dari Data</button>':''}
      </div>

      <div class="section-title" style="margin-top:24px">Tambah Kriteria</div>
      <div class="crit-selector">${selectorRows}</div>
    `;
  },

  // ── Scout Scoring ──────────────────────────────────────
  scoutScoring() {
    const sd = Store.sheetsData?.scoutScoring || [];
    const pl = sd.length ? sd : Store.scoredPlayers.map(p=>({...p, ScoutScore:p.GWScore}));
    const fBtns = ['ALL','GK','DEF','MID','FWD'].map(p=>
      `<button class="filter-btn ${Store.posFilter===p?'active':''}"
               onclick="Store.posFilter='${p}';Nav.goSubtab('scout','sscoring')">${p}</button>`
    ).join('');
    const sorted = [...pl]
      .filter(p=>Store.posFilter==='ALL'||p.Position===Store.posFilter)
      .sort((a,b)=>(b.ScoutScore||0)-(a.ScoutScore||0));

    const rows = sorted.map((p,i)=>{
      const sc=p.ScoutScore||0;
      const d=(p.status==='d'||p.doubt)?'<span class="doubt-tag">⚠</span>':'';
      return `<tr>
        <td class="dim">${i+1}</td>
        <td>${H.posPill(p.Position)}</td>
        <td>${p.Player||'?'}${d}</td>
        <td>${H.teamTag(p.Team||p.Team2||'?')}</td>
        <td class="mono r ${H.scoreClass(sc)}">${sc.toFixed(2)}</td>
        <td class="mono dim r">${H.numFmt(p['FDR Next']||p.FDR_next,1)}</td>
        <td class="c">${p['Home?']===true||p.isHome===true?'🏠':'✈'}</td>
        <td class="mono r">${H.numFmt(p.Form||p.form,1)}</td>
        <td class="mono r">${H.numFmt(p.PPG,1)}</td>
        <td class="mono r">${H.numFmt(p.xGI,2)}</td>
        <td class="mono r">${H.numFmt(p.ICT,1)}</td>
        <td class="mono dim r">£${H.numFmt(p.Price,1)}</td>
      </tr>`;
    }).join('');

    return `
      <div class="filters">${fBtns}
        <input class="search-input" type="text" placeholder="Cari…"
               oninput="Store.searchQuery=this.value;Nav.goSubtab('scout','sscoring')">
      </div>
      <div class="table-wrap max-h">
        <table>
          <thead><tr>
            <th>#</th><th>Pos</th><th>Pemain</th><th>Tim</th>
            <th class="r">Scout Score</th><th class="r">FDR</th><th class="c">H/A</th>
            <th class="r">Form</th><th class="r">PPG</th><th class="r">xGI</th>
            <th class="r">ICT</th><th class="r">£</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  },

  // ── Scout Recommendation ───────────────────────────────
  scoutRec() {
    // Try sheets pre-computed first
    const sr = Store.sheetsData?.scoutRec || [];
    if (sr.length) return this._scoutRecFromSheets(sr);

    // Generate from FPL API data
    return this._scoutRecFromAPI();
  },

  _scoutRecFromSheets(sr) {
    const byPlayer = {};
    sr.forEach(r => {
      const k = `${r.squad_role}__${r.Player}`;
      if (!byPlayer[k]) byPlayer[k] = {...r, candidates:[]};
      byPlayer[k].candidates.push(r);
    });
    const blocks = Object.values(byPlayer).map(p => {
      const crows = p.candidates.map(c=>{
        const v=c.Verdict||'';
        const vcls=v.includes('✓')?'verdict-good':v.includes('↔')?'verdict-marg':'verdict-keep';
        return `<tr>
          <td>${c.Kandidat||'–'}</td>
          <td class="mono r">£${H.numFmt(c.Harga,1)}</td>
          <td class="mono r ${H.scoreClass(c['Skor Kandidat']||0)}">${H.numFmt(c['Skor Kandidat'],2)}</td>
          <td class="mono r ${(c.Delta||0)>0?'s-hi':(c.Delta||0)<0?'s-lo':'dim'}">${H.numFmt(c.Delta,2)}</td>
          <td class="mono dim r">${H.numFmt(c['FDR Next'],1)}</td>
          <td class="mono r">${H.numFmt(c.Form,1)}</td>
          <td class="${vcls}">${v}</td>
        </tr>`;
      }).join('');
      return `<div class="rec-player-block">
        <div class="rec-header">
          <span class="pos-pill pos-${p.Position}">${p.Position}</span>
          <span class="rec-player-name">${p.Player}</span>
          <span class="dim" style="font-size:11px">${p.squad_role}</span>
          <span class="rec-score-badge">${H.numFmt(p.ScoutScore,2)}</span>
          <span class="rec-urgency">${p.TransferUrgency||''}</span>
        </div>
        <div class="rec-candidates">
          <table>
            <thead><tr>
              <th>Kandidat</th><th class="r">£</th><th class="r">Score</th>
              <th class="r">Δ</th><th class="r">FDR</th><th class="r">Form</th><th>Verdict</th>
            </tr></thead>
            <tbody>${crows}</tbody>
          </table>
        </div>
      </div>`;
    }).join('');
    return `<div class="section-title">Scout Recommendation (Google Sheets)</div>${blocks}`;
  },

  _scoutRecFromAPI() {
    const squad = Store.mySquadData;
    const allPlayers = Store.scoredPlayers;
    if (!allPlayers.length) return H.error('Data pemain belum dimuat. Klik Refresh.');

    // If no squad: show best-per-position recommendations
    if (!squad?.length) {
      if (!CFG.myTeamId) {
        return H.info(`Untuk rekomendasi berdasarkan skuad Anda, masukkan <b>FPL Team ID</b> di tab ⚙ Settings.<br><br>
          Temukan ID di URL profil FPL: <code>fantasy.premierleague.com/entry/<b>ID</b>/…</code>
          <br><br>Sementara itu, berikut <b>Top Pick per posisi</b> berdasarkan GW Score:`)
          + this._topPicksFallback(allPlayers);
      }
      return H.info('Skuad Anda sedang dimuat. Tunggu beberapa detik atau klik Refresh.')
        + this._topPicksFallback(allPlayers);
    }

    const squadIds = new Set(squad.map(p => p.id));
    const mi = Store.myManagerInfo;
    const bank = mi?.last_deadline_bank ? mi.last_deadline_bank / 10 : 0;
    const teamValue = mi?.last_deadline_total_value ? mi.last_deadline_total_value / 10 : 0;

    // Team map for fixture display
    const teamMap = {};
    Store.bootstrap?.teams?.forEach(t=>{ teamMap[t.id]=t.short_name; });

    // For each squad player, find their full data from scoredPlayers
    const analysis = squad.map(sq => {
      const full = allPlayers.find(p => p.id === sq.id);
      const gwScore = full?.GWScore ?? sq.ScoutScore ?? 0;
      const pos = sq.Position;
      const sellingPrice = sq.Price; // approximate (FPL uses purchase price logic)

      // Candidates: same position, NOT in squad, sorted by GWScore desc
      const candidates = allPlayers
        .filter(p => p.Position === pos && !squadIds.has(p.id))
        .sort((a, b) => b.GWScore - a.GWScore)
        .slice(0, 5)
        .map(c => {
          const delta = +(c.GWScore - gwScore).toFixed(2);
          const affordable = (c.Price <= sellingPrice + bank);
          const priceDiff = +(c.Price - sellingPrice).toFixed(1);

          // Next 3 fixtures from element-summary (if loaded)
          const pf = Store.playerFixtures[c.id];
          let fixHtml = '';
          if (pf?.fixtures?.length) {
            const next3 = pf.fixtures.filter(f=>!f.finished).slice(0,3);
            fixHtml = next3.map(fx=>{
              const isHome = fx.is_home;
              const opp = teamMap[isHome?fx.team_a:fx.team_h]||'?';
              const diff = fx.difficulty;
              const cls = diff<=2?'fix-easy':diff<=3?'fix-med':'fix-hard';
              return `<span class="sc-fix ${cls}" title="GW${fx.event} FDR:${diff}">${isHome?'':'@'}${opp}</span>`;
            }).join('');
          }

          let verdict, vcls;
          if (delta >= 1.5 && affordable) {
            verdict = '✓ Transfer masuk'; vcls = 'verdict-good';
          } else if (delta >= 0.5 && affordable) {
            verdict = '↔ Pertimbangkan'; vcls = 'verdict-marg';
          } else if (delta > 0 && !affordable) {
            verdict = '💰 Over budget'; vcls = 'verdict-warn';
          } else {
            verdict = '— Tidak perlu'; vcls = 'verdict-keep';
          }
          return { ...c, delta, verdict, vcls, affordable, priceDiff, fixHtml };
        });

      // Determine urgency
      const bestDelta = candidates[0]?.delta || 0;
      let urgency, urgCls;
      if (gwScore <= 2 || (sq.status === 'i' || sq.status === 'u')) {
        urgency = '🔴 Segera'; urgCls = 'urg-high';
      } else if (sq.status === 'd' || gwScore <= 3.5) {
        urgency = '🟡 Pantau'; urgCls = 'urg-mid';
      } else if (bestDelta >= 2) {
        urgency = '🟡 Upgrade'; urgCls = 'urg-mid';
      } else {
        urgency = '🟢 Aman'; urgCls = 'urg-low';
      }

      // Next fixtures for current player
      const myPf = Store.playerFixtures[sq.id];
      let myFixHtml = '';
      if (myPf?.fixtures?.length) {
        const next3 = myPf.fixtures.filter(f=>!f.finished).slice(0,3);
        myFixHtml = next3.map(fx=>{
          const isHome = fx.is_home;
          const opp = teamMap[isHome?fx.team_a:fx.team_h]||'?';
          const diff = fx.difficulty;
          const cls = diff<=2?'fix-easy':diff<=3?'fix-med':'fix-hard';
          return `<span class="sc-fix ${cls}" title="GW${fx.event} FDR:${diff}">${isHome?'':'@'}${opp}</span>`;
        }).join('');
      }

      return {
        ...sq, gwScore, candidates, urgency, urgCls,
        full, myFixHtml,
      };
    });

    // Sort: Starting XI first, then by urgency (high → low), then by gwScore ascending
    const urgOrder = {'🔴 Segera':0, '🟡 Pantau':1, '🟡 Upgrade':1, '🟢 Aman':2};
    const roleOrder = {'Captain':0,'Vice Captain':1,'Starting XI':2,'Bench':3};
    analysis.sort((a, b) => {
      const ra = roleOrder[a.squad_role] ?? 9, rb = roleOrder[b.squad_role] ?? 9;
      if (ra !== rb) return ra - rb;
      const ua = urgOrder[a.urgency] ?? 9, ub = urgOrder[b.urgency] ?? 9;
      if (ua !== ub) return ua - ub;
      return a.gwScore - b.gwScore;
    });

    // Count urgencies
    const urgCounts = { high:0, mid:0, low:0 };
    analysis.forEach(a => {
      if (a.urgency.includes('🔴')) urgCounts.high++;
      else if (a.urgency.includes('🟡')) urgCounts.mid++;
      else urgCounts.low++;
    });

    // Build HTML
    let html = `
      <div class="eval-summary-strip">
        <div class="eval-stat">
          <div class="eval-stat-label">Skuad</div>
          <div class="eval-stat-val">${squad.length} pemain</div>
        </div>
        <div class="eval-stat">
          <div class="eval-stat-label">Bank</div>
          <div class="eval-stat-val" style="color:var(--text2)">£${bank.toFixed(1)}</div>
        </div>
        ${teamValue?`<div class="eval-stat">
          <div class="eval-stat-label">Team Value</div>
          <div class="eval-stat-val" style="color:var(--text2)">£${teamValue.toFixed(1)}</div>
        </div>`:''}
        <div class="eval-stat" ${urgCounts.high?'style="border-color:rgba(255,82,82,.3)"':''}>
          <div class="eval-stat-label">🔴 Transfer Segera</div>
          <div class="eval-stat-val" style="color:${urgCounts.high?'var(--red)':'var(--green)'}">${urgCounts.high}</div>
        </div>
        <div class="eval-stat">
          <div class="eval-stat-label">🟡 Perlu Pantau</div>
          <div class="eval-stat-val" style="color:var(--gold)">${urgCounts.mid}</div>
        </div>
        <div class="eval-stat">
          <div class="eval-stat-label">🟢 Aman</div>
          <div class="eval-stat-val" style="color:var(--green)">${urgCounts.low}</div>
        </div>
      </div>
      <div class="section-title">Scout Recommendation — GW ${Store.currentGW||'–'} (dari FPL API)</div>
    `;

    // Player blocks
    analysis.forEach(a => {
      const crows = a.candidates.map(c => {
        const dCls = c.delta > 0 ? 's-hi' : c.delta < 0 ? 's-lo' : 'dim';
        return `<tr>
          <td style="font-weight:600">${c.Player}${c.doubt?' <span class="doubt-tag">⚠</span>':''}</td>
          <td>${H.teamTag(c.Team)}</td>
          <td class="mono r">£${c.Price.toFixed(1)}</td>
          <td class="mono r ${H.scoreClass(c.GWScore)}">${c.GWScore.toFixed(2)}</td>
          <td class="mono r ${dCls}" style="font-weight:700">${c.delta>=0?'+':''}${c.delta.toFixed(2)}</td>
          <td class="mono dim r">${H.numFmt(c.FDR_next,1)}</td>
          <td class="c">${c.isHome?'🏠':'✈'} <span class="dim" style="font-size:10px">${c.opponent||'?'}</span></td>
          <td class="mono r">${H.numFmt(c.Form,1)}</td>
          <td class="mono r">${H.numFmt(c.PPG,1)}</td>
          ${c.fixHtml?`<td style="font-size:10px">${c.fixHtml}</td>`:'<td class="dim" style="font-size:10px">–</td>'}
          <td class="${c.vcls}">${c.verdict}</td>
        </tr>`;
      }).join('');

      const statusBadge = a.status === 'i' ? '<span class="rec-status-badge status-inj">Cedera</span>'
                        : a.status === 'u' ? '<span class="rec-status-badge status-una">Tidak tersedia</span>'
                        : a.status === 'd' ? '<span class="rec-status-badge status-dbt">Meragukan</span>'
                        : '';

      html += `<div class="rec-player-block ${a.urgCls}">
        <div class="rec-header">
          <span class="pos-pill pos-${a.Position}">${a.Position}</span>
          <span class="rec-player-name">${a.Player}</span>
          ${statusBadge}
          <span class="dim" style="font-size:11px">${a.squad_role}</span>
          <span class="rec-score-badge">${a.gwScore.toFixed(2)}</span>
          <span class="rec-urgency ${a.urgCls}">${a.urgency}</span>
          <span class="dim" style="font-size:11px;margin-left:auto">£${a.Price.toFixed(1)} · ${H.teamTag(a.Team)}${a.myFixHtml?' · '+a.myFixHtml:''}</span>
        </div>
        ${crows ? `<div class="rec-candidates">
          <table>
            <thead><tr>
              <th>Kandidat</th><th>Tim</th><th class="r">£</th><th class="r">Score</th>
              <th class="r">Δ</th><th class="r">FDR</th><th class="c">H/A</th>
              <th class="r">Form</th><th class="r">PPG</th><th>Next 3</th><th>Verdict</th>
            </tr></thead>
            <tbody>${crows}</tbody>
          </table>
        </div>` : ''}
      </div>`;
    });

    return html;
  },

  // Fallback: show top picks per position when no squad data
  _topPicksFallback(allPlayers) {
    const positions = ['GK','DEF','MID','FWD'];
    let html = '<div style="margin-top:16px">';
    positions.forEach(pos => {
      const top5 = allPlayers.filter(p=>p.Position===pos).sort((a,b)=>b.GWScore-a.GWScore).slice(0,5);
      if (!top5.length) return;
      html += `<div class="rec-player-block" style="margin-bottom:12px">
        <div class="rec-header">
          <span class="pos-pill pos-${pos}">${pos}</span>
          <span class="rec-player-name">Top 5 ${pos}</span>
        </div>
        <div class="rec-candidates"><table>
          <thead><tr><th>Pemain</th><th>Tim</th><th class="r">£</th><th class="r">GWScore</th><th class="r">FDR</th><th class="c">H/A</th><th class="r">Form</th><th class="r">PPG</th></tr></thead>
          <tbody>${top5.map(p=>`<tr>
            <td style="font-weight:600">${p.Player}${p.doubt?' <span class="doubt-tag">⚠</span>':''}</td>
            <td>${H.teamTag(p.Team)}</td>
            <td class="mono r">£${p.Price.toFixed(1)}</td>
            <td class="mono r ${H.scoreClass(p.GWScore)}">${p.GWScore.toFixed(2)}</td>
            <td class="mono dim r">${H.numFmt(p.FDR_next,1)}</td>
            <td class="c">${p.isHome?'🏠':'✈'} <span class="dim" style="font-size:10px">${p.opponent||'?'}</span></td>
            <td class="mono r">${H.numFmt(p.Form,1)}</td>
            <td class="mono r">${H.numFmt(p.PPG,1)}</td>
          </tr>`).join('')}</tbody>
        </table></div>
      </div>`;
    });
    html += '</div>';
    return html;
  },

  // ── FDR Matrix ──────────────────────────────────────────
  fdrMatrix(type) {
    // Try sheets pre-computed first
    const sd = Store.sheetsData?.fdr?.[type];
    if (sd?.length) return this._renderFDRTable(sd, type.toUpperCase());
    // Fall back to bootstrap-derived FDR
    if (!Store.bootstrap) return H.info('FDR Matrix memerlukan FPL API. Klik Refresh.');
    return this._fdrFromBootstrap(type);
  },

  _fdrFromBootstrap(type) {
    const bs   = Store.bootstrap;
    const fix  = Store.fixtures || [];
    const teamMap = {};
    bs.teams.forEach(t=>{ teamMap[t.id]=t; });

    const strDef=bs.teams.flatMap(t=>[t.strength_defence_home,t.strength_defence_away]);
    const strAtk=bs.teams.flatMap(t=>[t.strength_attack_home,t.strength_attack_away]);
    const [mnD,mxD]=[Math.min(...strDef),Math.max(...strDef)];
    const [mnA,mxA]=[Math.min(...strAtk),Math.max(...strAtk)];
    const nFDR=(v,mn,mx)=>mn===mx?3:+(1+(v-mn)/(mx-mn)*4).toFixed(1);

    const gw0  = Store.currentGW||1;
    const upcoming = fix.filter(f=>!f.finished_provisional).sort((a,b)=>a.event-b.event);
    // Get next 8 GWs
    const gwRange = [...new Set(upcoming.map(f=>f.event))].slice(0,8);

    const rows = bs.teams.map(t => {
      // Avg FDR
      const avgDef = nFDR((t.strength_defence_home+t.strength_defence_away)/2,mnD,mxD);
      const avgAtk = nFDR((t.strength_attack_home +t.strength_attack_away)/2, mnA,mxA);
      const avgOvr = +((avgDef+avgAtk)/2).toFixed(1);
      const avg    = type==='def'?avgDef:type==='atk'?avgAtk:avgOvr;

      const fixes = gwRange.map(gw => {
        const gwFixes = upcoming.filter(f=>f.event===gw&&(f.team_h===t.id||f.team_a===t.id));
        if (!gwFixes.length) return null;
        return gwFixes.map(f => {
          const isHome=f.team_h===t.id;
          const opp   =teamMap[isHome?f.team_a:f.team_h];
          if(!opp) return null;
          const fdrD=nFDR(isHome?opp.strength_attack_away:opp.strength_attack_home,mnD,mxD);
          const fdrA=nFDR(isHome?opp.strength_defence_away:opp.strength_defence_home,mnA,mxA);
          const val  =type==='def'?fdrD:type==='atk'?fdrA:+((fdrD+fdrA)/2).toFixed(1);
          return {opp:opp.short_name,isHome,val};
        }).filter(Boolean);
      });

      return {team:t.short_name, avg, fixes, fixtures:upcoming.filter(f=>f.team_h===t.id||f.team_a===t.id).length};
    }).sort((a,b)=>a.avg-b.avg);

    const gwLabels = gwRange.map(g=>`GW${g}`);
    return this._renderFDRTableFlat(rows, gwLabels, type.toUpperCase());
  },

  _renderFDRTableFlat(rows, gwLabels, label) {
    const headGWs = gwLabels.map(g=>`<th class="c">${g}</th>`).join('');
    const trows = rows.map(row => {
      const cells = row.fixes.map(fixArr => {
        if (!fixArr||!fixArr.length) return `<td class="fdr-cell fdr-none">–</td>`;
        // DGW: show both
        return fixArr.map(fix=>{
          const cls=H.fdrClass(fix.val);
          const ha =fix.isHome?'fc-home':'fc-away';
          return `<td class="fdr-cell ${cls}">
            <div class="fc-opp ${ha}">${fix.opp}</div>
            <div class="fc-ha">${fix.isHome?'(H)':'(A)'}</div>
            <div class="fc-val">${fix.val.toFixed(1)}</div>
          </td>`;
        }).join('');
      }).join('');
      return `<tr>
        <td style="font-weight:700">${row.team}</td>
        ${cells}
        <td class="fdr-avg-col ${H.fdrClass(row.avg)}">${row.avg?.toFixed(1)||'–'}</td>
      </tr>`;
    }).join('');

    return `
      <div class="section-title">FDR Matrix — ${label}${Store.sheetsData?.fdr?'':' (dari FPL API)'}</div>
      <div class="table-wrap max-h">
        <table class="fdr-table">
          <thead><tr><th>Tim</th>${headGWs}<th class="c">Avg</th></tr></thead>
          <tbody>${trows}</tbody>
        </table>
      </div>
      <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap">
        ${['<2 Sangat Mudah','2.0–2.4 Mudah','2.5–2.9 Sedang','3.0–3.4 Sulit','≥3.5 Sangat Sulit'].map((l,i)=>
          `<span class="fdr-${i+1}" style="padding:3px 10px;border-radius:3px;font-size:11px;font-weight:700">${l}</span>`).join('')}
      </div>`;
  },

  _renderFDRTable(data, label) {
    const gwLabels = (Store.sheetsData?.fdr?.gwLabels) || [];
    return this._renderFDRTableFlat(data, gwLabels, label);
  },

  // ── FDR Info (Team Strength) ───────────────────────────
  fdrInfo() {
    if (!Store.bootstrap) return H.info('Memerlukan FPL API.');
    const bs = Store.bootstrap;

    // Min-max normalization from actual data
    const allVals = bs.teams.flatMap(t => [
      t.strength_attack_home, t.strength_attack_away,
      t.strength_defence_home, t.strength_defence_away
    ]);
    const minV = Math.min(...allVals);
    const maxV = Math.max(...allVals);
    const range = maxV - minV || 1;

    const makebar = (v,col) => {
      const pct = Math.round(((v - minV) / range) * 100);
      return `<div class="score-bar-wrap" style="min-width:100px">
        <div class="score-bar"><div class="score-bar-fill" style="width:${pct}%;background:${col}"></div></div>
        <span class="mono dim" style="font-size:11px;min-width:36px">${v}</span>
      </div>`;
    };

    const rows = [...bs.teams].sort((a,b)=>b.strength-a.strength).map((t,i) => {
      return `<tr>
        <td class="dim">${i+1}</td>
        <td style="font-weight:700">${t.short_name}</td>
        <td>${t.name}</td>
        <td>${makebar(t.strength_attack_home,'var(--green)')}</td>
        <td>${makebar(t.strength_attack_away,'var(--blue)')}</td>
        <td>${makebar(t.strength_defence_home,'var(--gold)')}</td>
        <td>${makebar(t.strength_defence_away,'var(--orange)')}</td>
        <td class="c mono" style="font-weight:700">${t.strength}</td>
      </tr>`;
    }).join('');
    return `
      <div class="section-title">Team Strength Breakdown (FPL API)</div>
      ${H.info('Nilai strength digunakan untuk kalkulasi FDR. Lebih tinggi = lebih kuat = lawan lebih sulit.')}
      <div class="table-wrap max-h">
        <table>
          <thead><tr>
            <th>#</th><th>Short</th><th>Tim</th>
            <th><span style="color:var(--green)">ATK Home</span></th>
            <th><span style="color:var(--blue)">ATK Away</span></th>
            <th><span style="color:var(--gold)">DEF Home</span></th>
            <th><span style="color:var(--orange)">DEF Away</span></th>
            <th class="c">Overall</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  },

  // ── EPL Table ──────────────────────────────────────────
  epl() {
    const sd = Store.sheetsData?.eplTable;
    if (sd?.length) {
      const rows = sd.map((t,i)=>this._eplRow(t,i+1)).join('');
      return `<div class="section-title">EPL Table</div>
        <div class="table-wrap max-h"><table>
          <thead><tr><th class="c">#</th><th>Klub</th>
            <th class="c">P</th><th class="c">W</th><th class="c">D</th><th class="c">L</th>
            <th class="c">GF</th><th class="c">GA</th><th class="c">GD</th><th class="c">Pts</th><th title="5 pertandingan terakhir: 🟩 Win · 🟨 Draw · 🟥 Loss">Form</th><th class="c">Strength</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table></div>`;
    }
    // Compute from fixtures
    if (!Store.bootstrap) return H.info('EPL Table memerlukan FPL API.');
    const teams = Process.eplFromFixtures(Store.bootstrap, Store.fixtures);
    if (!teams.length) return H.info('Belum ada data fixture yang selesai.');
    const rows = teams.map((t,i)=>this._eplRow(t,i+1)).join('');
    return `
      <div class="section-title">EPL Table — GW ${Store.currentGW||'–'}</div>
      <div class="table-wrap max-h"><table>
        <thead><tr><th class="c">#</th><th>Klub</th>
          <th class="c">P</th><th class="c">W</th><th class="c">D</th><th class="c">L</th>
          <th class="c">GF</th><th class="c">GA</th><th class="c">GD</th><th class="c">Pts</th><th title="5 pertandingan terakhir: 🟩 Win · 🟨 Draw · 🟥 Loss">Form</th><th class="c">Strength</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table></div>`;
  },

  _eplRow(t,pos) {
    const zcls=pos<=4?'zone-cl':pos<=6?'zone-el':pos>=18?'zone-rel':'';
    const dots=String(t.form||'').split('').map(c=>
      c==='W'?'<div class="form-w" title="Win"></div>':c==='D'?'<div class="form-d" title="Draw"></div>':
      c==='L'?'<div class="form-l" title="Loss"></div>':'').join('');
    return `<tr class="${zcls}">
      <td class="epl-pos ${pos===1?'s-hi':pos<=4?'s-mid':''}">${pos}</td>
      <td class="epl-team">${t.club||t.name||'?'} <span class="epl-short">${t.short||t.short_name||''}</span></td>
      <td class="c mono dim">${t.p||0}</td><td class="c mono">${t.w||0}</td>
      <td class="c mono dim">${t.d||0}</td><td class="c mono dim">${t.l||0}</td>
      <td class="c mono" style="color:var(--green)">${t.gf||0}</td>
      <td class="c mono" style="color:var(--red)">${t.ga||0}</td>
      <td class="c mono ${(t.gd||0)>0?'s-hi':(t.gd||0)<0?'s-lo':''}">${(t.gd||0)>0?'+':''}${t.gd||0}</td>
      <td class="epl-pts">${t.pts||0}</td>
      <td><div class="epl-form" title="5 pertandingan terakhir (kanan = terbaru)">${dots}</div></td>
      <td class="epl-str c">${t.strength||t.Strength||'–'}</td>
    </tr>`;
  },

  // ── League Rekap ───────────────────────────────────────
  leagueRekap() {
    // Build from FPL league standings + manager history
    const managers = Store.leagueManagers || [];
    const ls       = Store.leagueData;
    let entries    = ls ? Process.processLeague(ls) : [...managers];

    if (!entries.length)
      return UI.leagueSelectHTML() + H.info('Data Liga belum tersedia. Klik Refresh atau tunggu data dimuat dari FPL API.');

    const currentGW = Store.currentGW || 0;
    const myName    = CFG.myTeamName.toLowerCase();
    const hasInfos  = Object.keys(Store.managerInfos).length > 0;
    const hasHist   = Object.keys(Store.managerHistory).length > 0;

    // Calculate total transfers + extract overall rank and team value from history
    const totalTransfers = {};
    const overallRanks = {};
    const teamValues = {};
    if (hasHist) {
      entries.forEach(e => {
        const h = Store.managerHistory[e.entryId] || Store.managerHistory[String(e.entryId)];
        const events = h?.current || (Array.isArray(h) ? h : []);
        const chips = h?.chips || [];
        const chipGWs = new Set(chips.filter(c => {
          const n = (c.name||'').toLowerCase().replace(/[_ ]/g,'');
          return n.includes('wildcard') || n.includes('freehit');
        }).map(c => Number(c.event)));

        let trans = 0;
        events.forEach(ev => {
          if (!chipGWs.has(Number(ev.event))) {
            trans += Number(ev.event_transfers) || 0;
          }
        });
        totalTransfers[e.entryId] = trans;

        // Extract overall rank and team value from last GW in history
        const lastGW = events.reduce((a, b) => Number(b.event) > Number(a.event) ? b : a, events[0]);
        if (lastGW?.total_points) e.total = Number(lastGW.total_points);
        if (lastGW?.overall_rank) overallRanks[e.entryId] = Number(lastGW.overall_rank);
        if (lastGW?.value) teamValues[e.entryId] = Number(lastGW.value);
        // Also try bank
        if (lastGW?.bank != null && !teamValues[e.entryId]) teamValues[e.entryId] = Number(lastGW.value) || 0;
      });

      // Re-sort: higher total pts first, then fewer transfers
      entries.sort((a, b) => {
        if ((b.total||0) !== (a.total||0)) return (b.total||0) - (a.total||0);
        return (totalTransfers[a.entryId]||0) - (totalTransfers[b.entryId]||0);
      });

      // Re-assign rank
      entries.forEach((e, i) => {
        e._prevRank = e.rank;
        e.rank = i + 1;
      });
    }

    const rows = entries.map(e => {
      const isMe  = e.entryName.toLowerCase().includes(myName);
      const rnk   = e.rank;
      const rCls  = rnk===1?'r1':rnk===2?'r2':rnk===3?'r3':'';
      const delta  = (e.lastRank || e._prevRank || rnk) - rnk;
      const dCls  = delta>0?'trend-up':delta<0?'trend-down':'trend-same';
      const dStr  = delta>0?`⬆ +${delta}`:delta<0?`⬇ ${delta}`:'➡ =';
      const trans = totalTransfers[e.entryId];
      const ovrRank = overallRanks[e.entryId];
      const tv = teamValues[e.entryId];
      return `<tr class="${isMe?'highlight-row':''}">
        <td class="rekap-rank ${rCls}">${rnk}</td>
        <td class="${dCls}" style="font-size:14px">${dStr}</td>
        <td style="font-size:15px;font-weight:${isMe?700:400}">${e.entryName}</td>
        <td class="dim">${e.playerName||'–'}</td>
        <td class="rekap-ep">${e.eventTotal??'–'}</td>
        <td class="rekap-tp">${e.total||0}</td>
        ${hasHist?`<td class="mono dim r" style="font-size:12px" title="Transfer tanpa chip WC/FH">${trans!=null?trans:'–'}</td>`:''}
        ${hasHist?`<td class="mono dim r" style="font-size:12px" title="Overall Rank">${ovrRank?'#'+ovrRank.toLocaleString():'–'}</td>`:''}
        ${hasHist?`<td class="mono dim r" style="font-size:12px" title="Team Value (termasuk bank)">£${tv?(tv/10).toFixed(1):'–'}</td>`:''}
      </tr>`;
    }).join('');

    return `
      ${UI.leagueSelectHTML()}
      <div class="stat-strip">
        <div class="stat-box"><div class="stat-label">Peserta</div><div class="stat-val">${entries.length}</div></div>
        <div class="stat-box"><div class="stat-label">GW Aktif</div><div class="stat-val blue">${currentGW}</div></div>
        <div class="stat-box"><div class="stat-label">Pemimpin</div><div class="stat-val" style="font-size:14px;color:var(--gold)">${entries[0]?.entryName?.split(' ')[0]||'–'}</div></div>
        <div class="stat-box"><div class="stat-label">Pts Tertinggi</div><div class="stat-val gold">${entries[0]?.total||0}</div></div>
      </div>
      <div class="section-title">Rekap Liga — ${Store.leagueData?.league?.name||CFG.leagues[CFG.selectedLeagueIdx]?.name||'–'}</div>
      ${hasHist?'':'<div class="info-box" style="margin-bottom:12px">ℹ Data transfer belum dimuat. Tiebreaker (poin sama → transfer lebih sedikit = rank lebih baik) akan aktif setelah history dimuat.</div>'}
      <div class="table-wrap max-h">
        <table>
          <thead><tr>
            <th class="c">#</th><th>Trend</th><th>Tim</th><th>Manajer</th>
            <th class="r">GW Pts</th><th class="r">Total Pts</th>
            ${hasHist?'<th class="r">Transfers</th>':''}
            ${hasHist?'<th class="r">Overall Rank</th><th class="r">Team Value</th>':''}
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  },

  // ── League Charts ──────────────────────────────────────
  leagueCharts() {
    const managers = Store.leagueManagers || [];
    const histCount = Object.keys(Store.managerHistory).length;
    const hasMatrix = Store.leagueMatrix?.gwLabels?.length > 0;
    const ligaName = Store.leagueData?.league?.name || CFG.leagues[CFG.selectedLeagueIdx]?.name || '–';

    // Data status bar
    const statusHtml = `<div class="eval-summary-strip" style="margin-bottom:12px">
      <div class="eval-stat">
        <div class="eval-stat-label">Liga</div>
        <div class="eval-stat-val" style="font-size:13px">${ligaName}</div>
      </div>
      <div class="eval-stat">
        <div class="eval-stat-label">Manajer</div>
        <div class="eval-stat-val">${managers.length}</div>
      </div>
      <div class="eval-stat" ${histCount===0?'style="border-color:rgba(255,82,82,.3)"':''}>
        <div class="eval-stat-label">History Loaded</div>
        <div class="eval-stat-val" style="color:${histCount>0?'var(--green)':'var(--red)'}">${histCount} / ${managers.length}</div>
      </div>
      <div class="eval-stat">
        <div class="eval-stat-label">GW Data</div>
        <div class="eval-stat-val" style="color:${hasMatrix?'var(--green)':'var(--red)'}">${hasMatrix?Store.leagueMatrix.gwLabels.length+' GW':'–'}</div>
      </div>
      ${histCount===0&&managers.length>0?`<div class="eval-stat" style="flex:2">
        <div class="eval-stat-label" style="color:var(--red)">⚠ History fetch gagal</div>
        <div class="eval-stat-val dim" style="font-size:11px">CORS proxy mungkin rate-limited. Klik Retry atau buka Console (F12) untuk detail.</div>
      </div>`:''}
    </div>
    ${histCount===0&&managers.length>0?`<div class="btn-row" style="margin-bottom:16px">
      <button class="btn btn-primary" onclick="App.loadLeagueData(Store.currentGW)">↻ Retry Fetch History</button>
      <button class="btn btn-secondary" onclick="UI.clearCache('all');App.loadLeagueData(Store.currentGW)">🗑 Clear Cache & Retry</button>
    </div>`:''}`;

    return `
      ${UI.leagueSelectHTML()}
      ${statusHtml}
      <div class="section-title">Grafik Liga</div>
      <div class="charts-grid">
        <div class="chart-card wide" id="card-bumpchart">
          <div class="chart-header"><div class="chart-title">📈 Ranking per GW — Bump Chart</div>${UI.shareBar('card-bumpchart','Bump_Chart')}</div>
          <div class="hm-league-name">${ligaName}</div>
          <div id="bump-chart-wrap" class="bump-svg-wrap">${hasMatrix?H.loader('Membangun chart…'):H.info('Data ranking per GW belum tersedia.')}</div>
        </div>
        <div class="chart-card" id="card-highlights" style="max-height:${Math.max(440, (managers.length||10)*36+40)}px">
          <div class="chart-header"><div class="chart-title">🏆 Manager Highlights — GW ${Store.currentGW||'–'}</div>${UI.shareBar('card-highlights','Manager_Highlights')}</div>
          <div class="hm-league-name">${ligaName}</div>
          <div id="manager-highlights" style="flex:1;overflow-y:auto">${this._managerHighlights()}</div>
        </div>
        <div class="chart-card" id="card-standings">
          <div class="chart-header"><div class="chart-title">🏅 Total Points Standings</div>${UI.shareBar('card-standings','Standings')}</div>
          <div class="hm-league-name">${ligaName}</div>
          <div class="chart-canvas-wrap" style="min-height:${Math.max(280, (managers.length||10)*30)}px"><canvas id="chart-standings"></canvas></div>
        </div>
      </div>`;
  },

  _managerHighlights() {
    const managers = Store.leagueManagers || [];
    const hasHist = Object.keys(Store.managerHistory).length > 0;
    const hasPicks = Object.keys(Store.leaguePicks).length > 0;
    if (!managers.length) return '<div class="dim" style="padding:12px">Menunggu data liga…</div>';

    const gw = Store.currentGW || 0;
    const bs = Store.bootstrap;
    const live = Store.liveEvent;
    const items = [];

    // Helpers
    const mgrName = (eid) => {
      const m = managers.find(x => x.entryId == eid);
      return m ? `${m.playerName||'?'} (${m.entryName})` : '?';
    };
    const playerName = (elId) => bs?.elements?.find(e => e.id == elId)?.web_name || '?';
    // Fast lookup map for live GW points
    const liveMap = {};
    if (live?.elements) live.elements.forEach(el => { liveMap[el.id] = el.stats?.total_points || 0; });
    const liveP = (elId) => liveMap[elId] ?? liveMap[String(elId)] ?? 0;

    if (hasHist) {
      const gwData = [];
      managers.forEach(m => {
        const h = Store.managerHistory[m.entryId] || Store.managerHistory[String(m.entryId)];
        const events = h?.current || (Array.isArray(h) ? h : []);
        const thisGW = events.find(e => Number(e.event) === gw);
        const prevGW = events.find(e => Number(e.event) === gw - 1);
        const chips = h?.chips || [];
        const chipGWs = new Set(chips.filter(c => {
          const n = (c.name||'').toLowerCase().replace(/[_ ]/g,'');
          return n.includes('wildcard') || n.includes('freehit');
        }).map(c => Number(c.event)));
        let totalTrans = 0, totalHits = 0;
        events.forEach(e => {
          if (!chipGWs.has(Number(e.event))) totalTrans += Number(e.event_transfers) || 0;
          totalHits += Number(e.event_transfers_cost) || 0;
        });
        gwData.push({
          entryId: m.entryId, name: mgrName(m.entryId),
          gwPts: Number(thisGW?.points) || 0,
          benchPts: Number(thisGW?.points_on_bench) || 0,
          gwTrans: Number(thisGW?.event_transfers) || 0,
          gwTransCost: Number(thisGW?.event_transfers_cost) || 0,
          totalTrans, totalHits,
          overallRank: Number(thisGW?.overall_rank) || 0,
          value: Number(thisGW?.value) || 0,
          bank: Number(thisGW?.bank) || 0,
        });
      });

      // ── League position delta (use total_points from history for consistency) ──
      const cumThis = {}, cumPrev = {};
      gwData.forEach(d => {
        const h = Store.managerHistory[d.entryId] || Store.managerHistory[String(d.entryId)];
        const events = h?.current || (Array.isArray(h) ? h : []);
        const thisEv = events.find(e => Number(e.event) === gw);
        const prevEv = events.find(e => Number(e.event) === gw - 1);
        cumThis[d.entryId] = Number(thisEv?.total_points) || 0;
        cumPrev[d.entryId] = Number(prevEv?.total_points) || 0;
      });
      // Rank with transfer tiebreaker (same logic as bump chart and rekap)
      const transAccum = {};
      gwData.forEach(d => { transAccum[d.entryId] = d.totalTrans; });
      gwData.forEach(d => {
        const posNow = gwData.filter(x =>
          cumThis[x.entryId] > cumThis[d.entryId] ||
          (cumThis[x.entryId] === cumThis[d.entryId] && (transAccum[x.entryId]||0) < (transAccum[d.entryId]||0))
        ).length + 1;
        const posPrev = gwData.filter(x =>
          cumPrev[x.entryId] > cumPrev[d.entryId] ||
          (cumPrev[x.entryId] === cumPrev[d.entryId] && (transAccum[x.entryId]||0) < (transAccum[d.entryId]||0))
        ).length + 1;
        d._leagueDelta = posPrev - posNow;
        d._leaguePos = posNow;
      });

      // ── COLUMN 1: Weekly highlights ──
      // 1. Manager of the Week
      const motw = gwData.reduce((a, b) => b.gwPts > a.gwPts ? b : a, gwData[0]);
      items.push({ icon:'🎯', label:'Manager of the Week', val:`${motw.gwPts} pts`, sub:motw.name });

      // 2. Biggest Rise
      const rise = gwData.reduce((a, b) => b._leagueDelta > a._leagueDelta ? b : a, gwData[0]);
      if (rise._leagueDelta > 0) items.push({ icon:'📈', label:'Biggest Rise', val:`+${rise._leagueDelta} pos → #${rise._leaguePos}`, sub:rise.name, cls:'s-hi' });
      else items.push({ icon:'📈', label:'Biggest Rise', val:'– (tidak ada)', sub:'' });

      // 3. Biggest Fall
      const fall = gwData.reduce((a, b) => b._leagueDelta < a._leagueDelta ? b : a, gwData[0]);
      if (fall._leagueDelta < 0) items.push({ icon:'📉', label:'Biggest Fall', val:`${fall._leagueDelta} pos → #${fall._leaguePos}`, sub:fall.name, cls:'s-lo' });
      else items.push({ icon:'📉', label:'Biggest Fall', val:'– (tidak ada)', sub:'' });

      // 4. Best Overall Rank
      const bestRank = gwData.filter(d => d.overallRank > 0).reduce((a, b) => b.overallRank < a.overallRank ? b : a, gwData[0]);
      if (bestRank.overallRank > 0) items.push({ icon:'🌍', label:'Best Overall Rank', val:`#${bestRank.overallRank.toLocaleString()}`, sub:bestRank.name });
      else items.push({ icon:'🌍', label:'Best Overall Rank', val:'–', sub:'' });

      // 5. Best GW Score (Week)
      {
        const bestWeek = [...gwData].sort((a,b) => b.gwPts - a.gwPts)[0];
        items.push({ icon:'⭐', label:'Best GW Score (Week)', val:`${bestWeek.gwPts} pts`, sub:bestWeek.name, cls:'s-hi' });
      }

      // 6. Worst GW Score (Week)
      {
        const worstWeek = [...gwData].sort((a,b) => a.gwPts - b.gwPts)[0];
        items.push({ icon:'💔', label:'Worst GW Score (Week)', val:`${worstWeek.gwPts} pts`, sub:worstWeek.name, cls:'s-lo' });
      }

      // 7. Best GW Score (Season)
      {
        let best = { pts:0, gw:0, name:'' };
        gwData.forEach(d => {
          const h = Store.managerHistory[d.entryId] || Store.managerHistory[String(d.entryId)];
          const events = h?.current || (Array.isArray(h) ? h : []);
          events.forEach(e => {
            const pts = Number(e.points) || 0;
            if (pts > best.pts) best = { pts, gw: Number(e.event), name: d.name };
          });
        });
        items.push({ icon:'🏅', label:'Best GW Score (Season)', val:`${best.pts} pts (GW${best.gw})`, sub:best.name, cls:'s-hi' });
      }

      // 8. Worst GW Score (Season)
      {
        let worst = { pts:999, gw:0, name:'' };
        gwData.forEach(d => {
          const h = Store.managerHistory[d.entryId] || Store.managerHistory[String(d.entryId)];
          const events = h?.current || (Array.isArray(h) ? h : []);
          events.forEach(e => {
            const pts = Number(e.points) || 0;
            if (pts < worst.pts && pts > 0) worst = { pts, gw: Number(e.event), name: d.name };
          });
        });
        items.push({ icon:'😱', label:'Worst GW Score (Season)', val:`${worst.pts} pts (GW${worst.gw})`, sub:worst.name, cls:'s-lo' });
      }

      // 9. Best Captain Pick / 10. Worst Captain Pick
      const minPicksNeeded = Math.max(2, Math.ceil(managers.length * 0.5));
      if (hasPicks && Object.keys(liveMap).length > 0) {
        const capData = [];
        managers.forEach(m => {
          const p = Store.leaguePicks[m.entryId] || Store.leaguePicks[String(m.entryId)];
          if (!p?.picks) return;
          const cap = p.picks.find(pk => pk.is_captain);
          if (!cap) return;
          const basePts = liveP(cap.element);
          const mult = cap.multiplier || 2;
          const effectivePts = basePts * mult;
          capData.push({
            entryId: m.entryId,
            name: mgrName(m.entryId),
            player: playerName(cap.element),
            elementId: cap.element,
            basePts, mult, effectivePts,
            gwPts: gwData.find(d => d.entryId == m.entryId)?.gwPts || 0,
          });
        });

        const picksCount = Object.keys(Store.leaguePicks).length;
        console.log(`[Highlights] Captain data: ${capData.length} picks, ${[...new Set(capData.map(c=>c.elementId))].length} unique, need ${minPicksNeeded}+`);

        if (capData.length >= minPicksNeeded) {
          // Best
          capData.sort((a,b) => b.effectivePts - a.effectivePts || b.gwPts - a.gwPts);
          const best = capData[0];
          items.push({ icon:'👑', label:'Best Captain Pick', val:`${best.effectivePts} pts`, sub:`${best.player} (${best.basePts}×${best.mult}) — ${best.name}`, cls:'s-hi' });

          // Worst: must be different manager
          capData.sort((a,b) => a.effectivePts - b.effectivePts || a.gwPts - b.gwPts);
          const worst = capData.find(c => c.entryId !== best.entryId);
          if (worst) {
            items.push({ icon:'💀', label:'Worst Captain Pick', val:`${worst.effectivePts} pts`, sub:`${worst.player} (${worst.basePts}×${worst.mult}) — ${worst.name}`, cls:'s-lo' });
          } else {
            items.push({ icon:'💀', label:'Worst Captain Pick', val:'–', sub:'Semua memilih captain yang sama' });
          }
        } else {
          items.push({ icon:'👑', label:'Best Captain Pick', val:'–', sub:`Picks ${capData.length}/${managers.length} — setup GitHub Actions` });
          items.push({ icon:'💀', label:'Worst Captain Pick', val:'–', sub:`Picks ${capData.length}/${managers.length} — setup GitHub Actions` });
        }
      } else {
        items.push({ icon:'👑', label:'Best Captain Pick', val:'–', sub:'Setup GitHub Actions → league-picks.json' });
        items.push({ icon:'💀', label:'Worst Captain Pick', val:'–', sub:'Setup GitHub Actions → league-picks.json' });
      }

      // ── COLUMN 2: Season highlights ──
      // 9. Most Transfers (Season)
      const mostTrans = gwData.reduce((a, b) => b.totalTrans > a.totalTrans ? b : a, gwData[0]);
      items.push({ icon:'🔄', label:'Most Transfers (Season)', val:`${mostTrans.totalTrans} transfers`, sub:mostTrans.name });

      // 10. Least Transfers (Season)
      const leastTrans = gwData.reduce((a, b) => b.totalTrans < a.totalTrans ? b : a, gwData[0]);
      items.push({ icon:'😴', label:'Least Transfers (Season)', val:`${leastTrans.totalTrans} transfers`, sub:leastTrans.name });

      // 11. Best Team Value
      const bestVal = gwData.reduce((a, b) => b.value > a.value ? b : a, gwData[0]);
      if (bestVal.value > 0) items.push({ icon:'💰', label:'Best Team Value', val:`£${(bestVal.value/10).toFixed(1)}`, sub:bestVal.name });

      // 12. Lowest Team Value
      const lowVal = gwData.filter(d => d.value > 0).reduce((a, b) => b.value < a.value ? b : a, gwData[0]);
      if (lowVal.value > 0) items.push({ icon:'🪙', label:'Lowest Team Value', val:`£${(lowVal.value/10).toFixed(1)}`, sub:lowVal.name });

      // 13. Most Pts on Bench
      const benchK = gwData.reduce((a, b) => b.benchPts > a.benchPts ? b : a, gwData[0]);
      items.push({ icon:'💺', label:'Most Pts on Bench', val:`${benchK.benchPts} pts`, sub:benchK.name });

      // 14. Most Bench Pts (Season)
      const benchSeason = gwData.map(d => {
        const h = Store.managerHistory[d.entryId] || Store.managerHistory[String(d.entryId)];
        const events = h?.current || (Array.isArray(h) ? h : []);
        return { ...d, totalBench: events.reduce((s, e) => s + (Number(e.points_on_bench) || 0), 0) };
      });
      const benchSK = benchSeason.reduce((a, b) => b.totalBench > a.totalBench ? b : a, benchSeason[0]);
      if (benchSK?.totalBench > 0) items.push({ icon:'🛋️', label:'Most Bench Pts (Season)', val:`${benchSK.totalBench} pts`, sub:benchSK.name });

      // 15. Transfer Hit this Week
      const hitMan = gwData.filter(d => d.gwTransCost > 0).reduce((a, b) => (b.gwTransCost > a.gwTransCost ? b : a), {gwTransCost:0});
      items.push({ icon:'💸', label:'Transfer Hit (Week)', val: hitMan.gwTransCost > 0 ? `-${hitMan.gwTransCost} pts` : '0 pts', sub: hitMan.name||'Tidak ada hit', cls: hitMan.gwTransCost > 0 ? 's-lo' : '' });

      // 16. Most Total Hits (Season)
      const mostHits = gwData.reduce((a, b) => b.totalHits > a.totalHits ? b : a, gwData[0]);
      items.push({ icon:'🩸', label:'Most Hits Taken (Season)', val: mostHits.totalHits > 0 ? `-${mostHits.totalHits} pts` : '0 pts', sub: mostHits.name, cls: mostHits.totalHits > 0 ? 's-lo' : '' });
    }

    if (!items.length) return '<div class="dim" style="padding:12px">Menunggu data history dimuat…</div>';

    // Column count: 8 per column
    const colSize = Math.ceil(items.length / 2);

    return `<div class="highlights-list" style="grid-template-rows:repeat(${colSize},auto)">
      ${items.map(it => `<div class="hl-item">
        <div class="hl-icon">${it.icon}</div>
        <div class="hl-content">
          <div class="hl-label">${it.label}</div>
          <div class="hl-val ${it.cls||''}">${it.val}</div>
          <div class="hl-sub">${it.sub}</div>
        </div>
      </div>`).join('')}
    </div>`;
  },

  // ── Transfer & Chips ───────────────────────────────────
  leagueTransfer() {
    const selHTML = UI.leagueSelectHTML();
    const matrix = Store.transferMatrix;
    if (!matrix?.rows?.length) {
      const sd = Store.sheetsData?.league;
      if (sd?.transfer?.length && sd?.managers?.length) return selHTML + this._transferFromSheets(sd);
      return selHTML + H.info('Data Transfer & Chips sedang dimuat dari FPL API, atau tambahkan Google Sheets URL di Settings.');
    }
    return selHTML + this._renderTransferHeatmap(matrix);
  },

  _renderTransferHeatmap(matrix) {
    const {managers, rows} = matrix;
    const myName = CFG.myTeamName.toLowerCase();
    const totalGW = Store.bootstrap?.events?.length || 38;
    const midGW = Math.ceil(totalGW / 2);
    const leagueName = Store.leagueData?.league?.name || CFG.leagues[CFG.selectedLeagueIdx]?.name || 'Liga';

    const head = managers.map((m,i)=>{
      const isMe=m.entryName.toLowerCase().includes(myName);
      return `<th class="${isMe?'hm-me-head':''}" data-col="${i}" style="min-width:72px;max-width:72px;overflow:hidden;text-overflow:ellipsis;font-size:10px;padding:6px 4px;cursor:pointer;text-align:center" title="${m.entryName}" onclick="UI.highlightHeatmapCol(${i})">${m.entryName.split(' ')[0]}</th>`;
    }).join('');

    // Compute totals per manager (only count numeric transfers, not chips)
    const totals = {};
    managers.forEach(m => { totals[m.entryId] = 0; });
    rows.forEach(row => {
      managers.forEach(m => {
        const val = row[m.entryId] || {count:0, chip:null};
        if (!val.chip) totals[m.entryId] += val.count;
      });
    });

    const trows = rows.map(row => {
      const gwNum = row.gw;
      const isHalfBorder = gwNum === midGW;
      const cells = managers.map((m,i) => {
        const val = row[m.entryId] || {count:0, chip:null};
        const isMe = m.entryName.toLowerCase().includes(myName);
        const chip = val.chip ? H.chipEmoji(val.chip) : null;
        const n    = val.count;
        const cls  = chip ? 'hm-chip' : `hm-${Math.min(n,5)}`;
        const disp = chip || (n===0?'–':n);
        return `<td class="${cls}${isMe?' hm-me':''}" data-col="${i}" title="${m.entryName}: ${chip||n+' transfer'}" style="text-align:center">${disp}</td>`;
      }).join('');
      const rowCls = isHalfBorder ? ' class="hm-half-border"' : '';
      return `<tr${rowCls}><td class="hm-gw">GW${gwNum}</td>${cells}</tr>`;
    }).join('');

    // Totals row
    const totalCells = managers.map((m,i) => {
      const isMe = m.entryName.toLowerCase().includes(myName);
      const t = totals[m.entryId] || 0;
      return `<td class="hm-total${isMe?' hm-me':''}" data-col="${i}" style="text-align:center">${t}</td>`;
    }).join('');

    const legend = [0,1,2,3,4,5].map(n =>
      `<span class="hm-${n}" style="padding:3px 9px;border-radius:3px;font-size:11px;font-weight:700">${n===0?'–':n===5?'5+':n}</span>`
    ).join('');

    return `
      <div id="card-transfers">
      <div class="chart-header">
        <div class="section-title" style="margin-bottom:0">Transfer & Chips per GW</div>
        ${UI.shareBar('card-transfers','Transfer_Chips')}
      </div>
      <div class="hm-league-name">${leagueName}</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;align-items:center">
        ${legend}
        <span style="font-size:13px;margin-left:8px">🎯 FH &nbsp; 🃏 WC &nbsp; 💺 BB &nbsp; 👑 TC</span>
      </div>
      <div class="heatmap-wrap">
        <table class="heatmap-table">
          <thead><tr><th class="gw-h">GW</th>${head}</tr></thead>
          <tbody>${trows}</tbody>
          <tfoot><tr class="hm-total-row"><td class="hm-gw" style="font-weight:700">Total</td>${totalCells}</tr></tfoot>
        </table>
      </div>
      </div>`;
  },

  _transferFromSheets(sd) {
    const managers = sd.managers || [];
    const myName   = CFG.myTeamName.toLowerCase();
    const myIdx    = managers.findIndex(m=>m.toLowerCase().includes(myName));
    const head = managers.map((m,i)=>
      `<th class="${i===myIdx?'s-hi':''}" style="min-width:72px;max-width:72px;overflow:hidden;text-overflow:ellipsis;font-size:10px;padding:6px 4px" title="${m}">${m.split(' ')[0]}</th>`
    ).join('');
    const rows = sd.transfer.map(row=>{
      const gw=row[0];
      const cells=managers.map((m,i)=>{
        const val=String(row[i+1]||'0');
        const isMe=i===myIdx;
        const isChip=/[🎯🃏💺👑]/.test(val);
        const cls=isChip?'hm-chip':`hm-${Math.min(parseInt(val)||0,5)}`;
        return `<td class="${cls}${isMe?' hm-me':''}">${isChip?val:val==='0'?'–':val}</td>`;
      }).join('');
      return `<tr><td class="hm-gw">GW${gw}</td>${cells}</tr>`;
    }).join('');
    return `
      <div class="section-title">Transfer & Chips per GW (Google Sheets)</div>
      <div class="heatmap-wrap">
        <table class="heatmap-table">
          <thead><tr><th class="gw-h">GW</th>${head}</tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  },

  // ── My Squad ───────────────────────────────────────────
  otherSquad() {
    const squad = Store.mySquadData;
    if (!squad?.length) {
      if (!CFG.myTeamId)
        return H.info('Tambahkan FPL Team ID Anda di Settings untuk melihat skuad aktif.');
      return H.info('Skuad Anda sedang dimuat… Jika tidak muncul, pastikan Team ID benar.');
    }
    const mi = Store.myManagerInfo;
    const infoStrip = mi ? `
      <div class="stat-strip">
        <div class="stat-box"><div class="stat-label">Team Name</div><div class="stat-val" style="font-size:14px;color:var(--text)">${mi.name||'–'}</div></div>
        <div class="stat-box"><div class="stat-label">Manager</div><div class="stat-val" style="font-size:14px;color:var(--text2)">${mi.player_first_name||''} ${mi.player_last_name||''}</div></div>
        <div class="stat-box"><div class="stat-label">Overall Rank</div><div class="stat-val blue">${mi.summary_overall_rank?mi.summary_overall_rank.toLocaleString():'–'}</div></div>
        <div class="stat-box"><div class="stat-label">Total Points</div><div class="stat-val gold">${mi.summary_overall_points||'–'}</div></div>
        <div class="stat-box"><div class="stat-label">GW Points</div><div class="stat-val">${mi.summary_event_points||'–'}</div></div>
        <div class="stat-box"><div class="stat-label">Team Value</div><div class="stat-val" style="color:var(--text2)">£${mi.last_deadline_total_value?(mi.last_deadline_total_value/10).toFixed(1):'–'}</div></div>
        <div class="stat-box"><div class="stat-label">Bank</div><div class="stat-val" style="color:var(--text2)">£${mi.last_deadline_bank?(mi.last_deadline_bank/10).toFixed(1):'–'}</div></div>
      </div>` : '';

    const roleMap = {'Captain':'captain','Vice Captain':'vc','Starting XI':'xi','Bench':'bench'};
    const cards = squad.map(p => {
      const roleKey = roleMap[p.squad_role]||'xi';
      const d = p.status==='d'?'<span class="doubt-tag">⚠ doubt</span>':'';
      const sc= p.ScoutScore||0;
      const live = p.livePoints!=null ? `<div style="font-family:'JetBrains Mono',monospace;font-size:13px;color:var(--gold);margin-top:4px">${p.livePoints} pts live</div>` : '';
      // Next fixtures from element-summary
      const pf = Store.playerFixtures[p.id];
      let fixHtml = '';
      if (pf?.fixtures?.length) {
        const next3 = pf.fixtures.filter(f=>!f.finished).slice(0,3);
        if (next3.length) {
          const teamMap = {};
          Store.bootstrap?.teams?.forEach(t=>{ teamMap[t.id]=t.short_name; });
          fixHtml = `<div class="sc-fixtures">${next3.map(fx=>{
            const isHome = fx.is_home;
            const opp = teamMap[isHome?fx.team_a:fx.team_h]||'?';
            const diff = fx.difficulty;
            const cls = diff<=2?'fix-easy':diff<=3?'fix-med':'fix-hard';
            return `<span class="sc-fix ${cls}" title="GW${fx.event} FDR:${diff}">${isHome?'':'@'}${opp}</span>`;
          }).join('')}</div>`;
        }
      }
      return `<div class="squad-card role-${roleKey} ${p.status==='d'?'status-d':''}">
        <div class="sc-role">${p.squad_role}${p.is_captain?' ⭐':p.is_vice_captain?' 🌟':''}</div>
        <div class="sc-name">${p.Player}${d}</div>
        <div class="sc-meta">
          ${H.posPill(p.Position)}
          ${H.teamTag(p.Team)}
          <span class="dim" style="font-family:'JetBrains Mono',monospace;font-size:12px">£${H.numFmt(p.Price,1)}</span>
        </div>
        <div class="sc-score">${sc.toFixed(2)}</div>
        ${live}
        <div class="sc-stats">
          <div class="sc-stat">PPG<span>${H.numFmt(p.PPG,1)}</span></div>
          <div class="sc-stat">Form<span>${H.numFmt(p.Form,1)}</span></div>
          <div class="sc-stat">xGI<span>${H.numFmt(p.xGI,2)}</span></div>
          <div class="sc-stat">FDR<span>${H.numFmt(p.FDR_next,1)}</span></div>
        </div>
        ${fixHtml}
      </div>`;
    }).join('');
    return `<div class="section-title">My Squad — GW ${Store.currentGW||'–'}</div>
      ${infoStrip}
      <div class="squad-grid">${cards}</div>`;
  },

  // ── Chip Recommendation ────────────────────────────────
  otherChip() {
    // Try sheets first
    const sd = Store.sheetsData?.chipRec || [];
    if (sd.length) return this._chipRecFromSheets(sd);
    // Generate from FPL API
    return this._chipRecFromAPI();
  },

  _chipRecFromSheets(sd) {
    const currentGW = Store.currentGW||0;
    const cards = sd.map(r=>{
      const gw=r.GW||0, isActive=gw===currentGW;
      return `<div class="chip-card ${isActive?'active-gw':''}">
        ${isActive?'<div style="position:absolute;top:10px;right:12px;font-size:10px;background:var(--green);color:#000;padding:2px 7px;border-radius:3px;font-weight:700;letter-spacing:1px">CURRENT GW</div>':''}
        <div class="chip-gw">GW ${gw} — Paruh ${r.Paruh||'?'}</div>
        <div class="chip-best">${r['Chip Terbaik']||'?'}</div>
        <div class="chip-alasan">${r['Alasan']||''}</div>
        <div class="chip-scores">
          <div class="chip-score-item"><div class="csi-label">WC</div><div class="csi-val csi-wc">${H.numFmt(r['Skor WC'],1)}</div></div>
          <div class="chip-score-item"><div class="csi-label">FH</div><div class="csi-val csi-fh">${H.numFmt(r['Skor FH'],1)}</div></div>
          <div class="chip-score-item"><div class="csi-label">BB</div><div class="csi-val csi-bb">${H.numFmt(r['Skor BB'],1)}</div></div>
          <div class="chip-score-item"><div class="csi-label">TC</div><div class="csi-val csi-tc">${H.numFmt(r['Skor TC'],1)}</div></div>
        </div>
      </div>`;
    }).join('');
    return `<div class="section-title">Chip Recommendation (Google Sheets)</div><div class="chip-grid">${cards}</div>`;
  },

  _chipRecFromAPI() {
    if (!Store.bootstrap || !Store.fixtures) return H.info('Data FPL belum dimuat. Klik Refresh.');
    const gw = Store.currentGW || 1;
    const totalGW = Store.bootstrap.events.length;
    const midSeason = Math.ceil(totalGW / 2);
    const currentHalf = gw <= midSeason ? 'H1' : 'H2';

    // Detect chips already used (from history) — filter by CURRENT half only
    const myId = CFG.myTeamId;
    const hist = Store.managerHistory[myId] || Store.managerHistory[String(myId)] || Store.managerHistory[Number(myId)];
    const allChipEntries = hist?.chips || [];
    // Filter to current half: H1 chips have event <= midSeason, H2 > midSeason
    const halfChips = allChipEntries.filter(c => {
      const ev = Number(c.event) || 0;
      return currentHalf === 'H1' ? ev <= midSeason : ev > midSeason;
    });
    console.log(`[ChipRec] myId=${myId}, hist found=${!!hist}, all chips=${allChipEntries.length}, half ${currentHalf} chips=${halfChips.length}:`, halfChips.map(c=>`${c.name}@GW${c.event}`));

    const usedChips = new Set(halfChips.map(c => (c.name||'').toLowerCase().replace(/[_ ]/g,'')));

    const allChips = [
      { key:'wildcard',  label:'🃏 Wildcard',       short:'WC',  used: usedChips.has('wildcard') },
      { key:'freehit',   label:'🎯 Free Hit',       short:'FH',  used: usedChips.has('freehit') },
      { key:'bboost',    label:'💺 Bench Boost',    short:'BB',  used: usedChips.has('bboost') || usedChips.has('benchboost') },
      { key:'3xc',       label:'👑 Triple Captain',  short:'TC',  used: usedChips.has('3xc') || usedChips.has('triplecaptain') },
    ];
    const remaining = allChips.filter(c => !c.used);

    // Squad analysis
    const squad = Store.mySquadData || [];
    const squadAvg = squad.length ? +(squad.reduce((s,p)=>(s+(p.ScoutScore||p.GWScore||0)),0)/squad.length).toFixed(1) : 0;
    const benchPlayers = squad.filter(p=>p.squad_role==='Bench');
    const benchAvg = benchPlayers.length ? +(benchPlayers.reduce((s,p)=>(s+(p.ScoutScore||p.GWScore||0)),0)/benchPlayers.length).toFixed(1) : 0;
    const bestPlayer = squad.length ? squad.reduce((b,p)=>(p.ScoutScore||p.GWScore||0)>(b.ScoutScore||b.GWScore||0)?p:b,squad[0]) : null;
    const lowScorers = squad.filter(p=>p.squad_role!=='Bench'&&(p.ScoutScore||p.GWScore||0)<3).length;

    // Analyze upcoming GWs
    const upcoming = (Store.fixtures||[]).filter(f=>!f.finished_provisional&&f.event>gw).sort((a,b)=>a.event-b.event);
    const gwRange = [...new Set(upcoming.map(f=>f.event))].sort((a,b)=>a-b).slice(0,8);

    const gwAnalysis = gwRange.map(gwNum => {
      const gwFixes = upcoming.filter(f => f.event === gwNum);
      const teamCounts = {};
      gwFixes.forEach(f => { teamCounts[f.team_h]=(teamCounts[f.team_h]||0)+1; teamCounts[f.team_a]=(teamCounts[f.team_a]||0)+1; });
      const dgwTeams = Object.entries(teamCounts).filter(([_,c])=>c>1).length;
      const isHalf = gwNum <= midSeason ? 'H1' : 'H2';
      // Count how many of MY squad have blanks this GW
      const myBlanks = squad.filter(p => {
        const teamId = Store.bootstrap?.teams?.find(t=>t.short_name===p.Team)?.id;
        return teamId && !teamCounts[teamId];
      }).length;
      // Best captain candidate FDR
      const capFDR = bestPlayer?.FDR_next || 3;
      return { gw:gwNum, matches:gwFixes.length, dgwTeams, isHalf, myBlanks, capFDR };
    });

    // Score each chip per GW (raw scores)
    const scoreMatrix = {}; // {chipKey: {gwNum: score}}
    remaining.forEach(chip => {
      scoreMatrix[chip.key] = {};
      gwAnalysis.forEach(ga => {
        let score = 1; // base (never 0 — all chips must be used)
        if (chip.key === 'freehit') {
          if (ga.matches < 8) score += 6;
          if (ga.matches < 6) score += 3;
          if (ga.myBlanks >= 4) score += 4;
          if (ga.myBlanks >= 6) score += 3;
        }
        if (chip.key === 'bboost') {
          if (ga.dgwTeams >= 3) score += 4;
          if (ga.dgwTeams >= 5) score += 3;
          if (benchAvg >= 3) score += 2;
          if (ga.myBlanks === 0) score += 2;
        }
        if (chip.key === '3xc') {
          if (ga.dgwTeams >= 2) score += 4;
          if (bestPlayer && (bestPlayer.ScoutScore||bestPlayer.GWScore||0) >= 6) score += 3;
          if (ga.capFDR < 2.5) score += 2;
        }
        if (chip.key === 'wildcard') {
          if (lowScorers >= 4) score += 5;
          if (lowScorers >= 6) score += 3;
          if (ga.dgwTeams >= 4) score += 2;
          if (ga.gw === gw+1) score += 1;
        }
        scoreMatrix[chip.key][ga.gw] = Math.min(10, score);
      });
    });

    // Greedy assignment: pick highest (chip,GW) pair, assign, repeat
    const assigned = {}; // {gwNum: chipObj}
    const assignedChips = new Set();
    const chipsToAssign = [...remaining];
    const gwPool = gwAnalysis.map(ga => ga.gw);

    // Limit to current half GWs
    const halfEndGW = currentHalf === 'H1' ? midSeason : totalGW;
    const halfGWs = gwPool.filter(g => g <= halfEndGW);

    for (let round = 0; round < chipsToAssign.length; round++) {
      let bestScore = -1, bestChip = null, bestGW = null;
      chipsToAssign.forEach(chip => {
        if (assignedChips.has(chip.key)) return;
        halfGWs.forEach(gwNum => {
          if (assigned[gwNum]) return;
          const s = scoreMatrix[chip.key]?.[gwNum] || 0;
          if (s > bestScore) { bestScore = s; bestChip = chip; bestGW = gwNum; }
        });
      });
      if (bestChip && bestGW) {
        assigned[bestGW] = bestChip;
        assignedChips.add(bestChip.key);
      }
    }

    // Build recommendations with assignments
    let wcGW = assigned[Object.keys(assigned).find(g => assigned[g]?.key === 'wildcard')] ? +Object.keys(assigned).find(g => assigned[g]?.key === 'wildcard') : 999;

    const recommendations = gwAnalysis.map(ga => {
      const scores = {};
      remaining.forEach(c => { scores[c.short] = scoreMatrix[c.key]?.[ga.gw] || 0; });

      const assignedChip = assigned[ga.gw] || null;
      let reason = '';

      if (assignedChip) {
        if (assignedChip.key === 'freehit') reason = `${ga.matches} match (${ga.myBlanks} pemain blank)`;
        else if (assignedChip.key === 'bboost') reason = `${ga.dgwTeams} DGW, bench avg ${benchAvg}`;
        else if (assignedChip.key === '3xc') reason = `Captain: ${bestPlayer?.Player||'?'} (FDR ${ga.capFDR.toFixed(1)})`;
        else if (assignedChip.key === 'wildcard') reason = `${lowScorers} pemain skor rendah — restruktur tim`;
      }

      // After WC GW, mark as "evaluasi ulang"
      const afterWC = ga.gw > wcGW && !assignedChip;
      if (afterWC) reason = '⚠ Tim berubah setelah WC — evaluasi ulang';

      return { ...ga, scores, best: assignedChip, reason, afterWC };
    });

    // Build HTML
    let html = `
      <div class="section-title">Chip Recommendation — GW${gw} (${currentHalf})</div>
      <div class="eval-summary-strip">
        <div class="eval-stat"><div class="eval-stat-label">GW Saat Ini</div><div class="eval-stat-val">${gw}</div></div>
        <div class="eval-stat"><div class="eval-stat-label">Half</div><div class="eval-stat-val" style="color:var(--blue)">${currentHalf}</div></div>
        <div class="eval-stat"><div class="eval-stat-label">Chip Tersisa</div><div class="eval-stat-val" style="color:var(--gold)">${remaining.length}/${allChips.length}</div></div>
        <div class="eval-stat"><div class="eval-stat-label">Squad Avg</div><div class="eval-stat-val">${squadAvg}</div></div>
        <div class="eval-stat"><div class="eval-stat-label">Bench Avg</div><div class="eval-stat-val" style="color:var(--text2)">${benchAvg}</div></div>
        ${allChips.map(c => `
        <div class="eval-stat" ${c.used?'style="opacity:.5"':''}>
          <div class="eval-stat-label">${c.short}</div>
          <div class="eval-stat-val" style="color:${c.used?'var(--red)':'var(--green)'}">${c.used?'✗ Used':'✓'}</div>
        </div>`).join('')}
      </div>`;

    const cards = recommendations.map(r => {
      const isDGW = r.dgwTeams > 0;
      const isBlank = r.matches < 10;
      const chipScores = remaining.map(c => {
        const s = r.scores[c.short]||0;
        const col = s>=7?'var(--green)':s>=4?'var(--gold)':'var(--text3)';
        return `<div class="chip-score-item"><div class="csi-label">${c.short}</div><div class="csi-val" style="color:${col}">${s.toFixed(0)}</div></div>`;
      }).join('');

      return `<div class="chip-card ${r.gw===gw+1?'active-gw':''} ${r.afterWC?'chip-after-wc':''}">
        ${r.gw===gw+1?'<div style="position:absolute;top:8px;right:10px;font-size:9px;background:var(--green);color:#000;padding:2px 6px;border-radius:3px;font-weight:700;letter-spacing:1px">NEXT GW</div>':''}
        <div class="chip-gw">GW ${r.gw} — ${r.isHalf}${isDGW?' · <span style="color:var(--blue)">DGW ('+r.dgwTeams+')</span>':''}${isBlank?' · <span style="color:var(--red)">'+r.matches+' match</span>':''}</div>
        <div class="chip-best" style="font-size:18px">${r.best?r.best.label:(r.afterWC?'❓ Evaluasi ulang':'–')}</div>
        <div class="chip-alasan">${r.reason||'–'}</div>
        <div class="chip-scores">${chipScores}</div>
        <div style="margin-top:8px;font-size:11px;color:var(--text3)">${r.matches} match · ${r.myBlanks} blank saya · ${r.dgwTeams} DGW</div>
      </div>`;
    }).join('');

    html += `<div class="chip-grid">${cards}</div>`;
    return html;
  },


  // ── Settings ───────────────────────────────────────────
  settings() {
    // Auto-detect team name from manager info
    const mi = Store.myManagerInfo;
    const detectedName = mi?.name || '';
    const detectedPlayer = mi ? `${mi.player_first_name||''} ${mi.player_last_name||''}`.trim() : '';

    return `
      <div class="settings-grid">
        <div class="settings-card">
          <h3>Identitas</h3>
          <div class="field-group">
            <label>FPL Team ID Saya</label>
            <input type="number" id="my-team-id" value="${CFG.myTeamId||''}" placeholder="contoh: 2414649"
              oninput="UI.lookupTeamId(this.value)">
            <div class="hint">Temukan di URL profil FPL: fantasy.premierleague.com/entry/<b>ID</b>/event/…</div>
            <div id="team-lookup-result" class="team-lookup-box">
              ${detectedName ? `<div class="lookup-ok">✓ Tim: <b>${detectedName}</b> — Manajer: ${detectedPlayer}</div>` : CFG.myTeamId ? '<div class="lookup-pending">Mendeteksi nama tim…</div>' : ''}
            </div>
          </div>
          <div class="field-group">
            <label>Filter Minimum Menit <span style="color:var(--text3)">(untuk GW Scoring & Rekomendasi)</span></label>
            <input type="number" id="min-minutes" value="${CFG.minMinutes}" min="0" max="3000" step="90">
            <div class="hint">
              Pemain dengan total menit bermain di bawah nilai ini <b>tidak masuk</b> dalam GW Scoring dan Formasi Rekomendasi,
              karena data statistik per-90-menit mereka belum reliable.<br>
              <b>450</b> = ≈5 match penuh &nbsp;|&nbsp; <b>270</b> = ≈3 match &nbsp;|&nbsp; <b>0</b> = tampilkan semua (termasuk pemain baru).
            </div>
          </div>
          <div class="field-group">
            <label>Max Pemain per Tim (FPL rule: 3)</label>
            <input type="number" id="max-per-team" value="${CFG.maxPerTeam}" min="1" max="5">
          </div>
          <div class="btn-row">
            <button class="btn btn-primary" onclick="UI.saveSettings();App.refresh()">Simpan & Refresh</button>
            <button class="btn btn-secondary" onclick="UI.saveSettings()">Simpan Saja</button>
          </div>
          <div id="settings-status" class="status-msg"></div>
        </div>

        <div class="settings-card">
          <h3>Google Sheets (Fallback & Pre-computed)</h3>
          <div class="field-group">
            <label>URL Apps Script Web App</label>
            <input type="text" id="sheets-url" value="${CFG.sheetsUrl}" placeholder="https://script.google.com/macros/s/…/exec">
            <div class="hint">Untuk data pre-computed dari Excel: Scout Scoring, Scout Recommendation, Chip Recommendation, FDR Matrix, EPL Table, Rekap Liga.</div>
          </div>
          <div class="field-group" style="margin-top:16px">
            <label>Format JSON yang diharapkan</label>
            <div class="hint" style="font-size:11px;line-height:1.8">
              <code>meta</code>: <code>{"gw":30}</code><br>
              <code>scoutScoring</code>: array dengan field Player, Team, Position, Price, ScoutScore, dll.<br>
              <code>scoutRec</code>: array ScoutRecommendation<br>
              <code>chipRec</code>: array RecommendationChip<br>
              <code>eplTable</code>: array FORM sheet (pos, club, short, pts, p, w, d, l, gd, form, strength)<br>
              <code>fdr</code>: <code>{"def":[rows], "atk":[rows], "ovr":[rows], "gwLabels":["GW30",…]}</code><br>
              <code>league</code>: <code>{"managers":[], "rekap":[], "transfer":[[gw, t1, t2,…],…]}</code>
            </div>
          </div>
          <div class="btn-row">
            <button class="btn btn-primary" onclick="App.refresh()">↻ Refresh Data</button>
          </div>
        </div>

        <div class="settings-card">
          <h3>⚡ Cache Manager</h3>
          <div class="hint" style="margin-bottom:12px">
            Data di-cache di localStorage untuk mempercepat load. TTL: bootstrap 6j · league 30m · live 5m · sheets 15m.
          </div>
          <div id="cache-stats" class="hint" style="font-family:'JetBrains Mono',monospace;font-size:12px;margin-bottom:14px">–</div>
          <div style="margin-bottom:12px">
            <table style="width:100%;border-collapse:collapse;font-size:12px">
              <thead><tr>
                <th style="text-align:left;padding:5px 8px;color:var(--text3);font-size:10px;letter-spacing:1px;border-bottom:1px solid var(--border)">ENDPOINT</th>
                <th style="text-align:center;padding:5px 8px;color:var(--text3);font-size:10px;letter-spacing:1px;border-bottom:1px solid var(--border)">TTL</th>
                <th style="text-align:center;padding:5px 8px;color:var(--text3);font-size:10px;letter-spacing:1px;border-bottom:1px solid var(--border)">STATUS</th>
                <th style="padding:5px 8px;border-bottom:1px solid var(--border)"></th>
              </tr></thead>
              <tbody id="cache-endpoint-list"></tbody>
            </table>
          </div>
          <div class="btn-row">
            <button class="btn btn-primary"   onclick="App.refresh()">↻ Refresh Semua</button>
            <button class="btn btn-secondary" onclick="UI.refreshLive()">↻ Live Only</button>
            <button class="btn btn-secondary" onclick="UI.clearCache('all')">🗑 Clear All Cache</button>
          </div>
          <div id="cache-clear-status" class="status-msg" style="margin-top:8px"></div>
        </div>

        <div class="settings-card">
          <h3>🔌 Proxy Diagnostik</h3>
          <div class="hint" style="margin-bottom:12px">
            FPL API tidak mendukung CORS — browser memblokir request langsung dari domain lain. Dashboard menggunakan CORS proxy sebagai perantara. Klik tombol di bawah untuk test proxy mana yang bekerja.
          </div>
          <div id="proxy-test-results" style="font-family:'JetBrains Mono',monospace;font-size:12px;line-height:2.2;margin-bottom:14px">
            Belum ditest. Klik tombol di bawah.
          </div>
          <div class="btn-row">
            <button class="btn btn-primary" onclick="UI.testProxies()">🧪 Test Semua Proxy</button>
          </div>
        </div>

        <div class="settings-card">
          <h3>FPL API Endpoints</h3>
          <div class="hint" style="font-size:12px;line-height:2">
            <b style="color:var(--green)">✓ bootstrap-static/</b> — pemain, tim, event<br>
            <b style="color:var(--green)">✓ fixtures/</b> — jadwal + DGW detection<br>
            <b style="color:var(--green)">✓ event/{GW}/live/</b> — poin live GW aktif<br>
            <b style="color:var(--green)">✓ leagues-classic/{ID}/standings/</b> — standings<br>
            <b style="color:var(--green)">✓ entry/{TID}/history/</b> — ranking per GW<br>
            <b style="color:var(--green)">✓ entry/{TID}/transfers/</b> — transfer history<br>
            <b style="color:var(--green)">✓ entry/{TID}/event/{GW}/picks/</b> — skuad aktif<br>
            <b style="color:var(--green)">✓ entry/{TID}/</b> — info manajer (overall rank, team value, bank)<br>
            <b style="color:var(--green)">✓ element-summary/{EID}/</b> — fixture per pemain (next 3 GW)
          </div>
        </div>
      </div>
      <script>
        UI.updateCacheStats();
        UI.renderCacheEndpointList();
      <\/script>`;
  },
};

// ═══════════════════════════════════════════════════════
// 8. CHARTS
// ═══════════════════════════════════════════════════════
const Charts = {
  destroy(key) {
    if (Store.chartInstances[key]) { Store.chartInstances[key].destroy(); delete Store.chartInstances[key]; }
  },

  buildAll() {
    const leagueMatrix = Store.leagueMatrix;
    if (leagueMatrix?.series?.length) {
      this.buildBump(leagueMatrix);
    }
    if (Store.leagueManagers?.length) this.buildStandingsBar(Store.leagueManagers);
  },

  buildBump(matrix) {
    const wrap = document.getElementById('bump-chart-wrap');
    if (!wrap) return;
    const { gwLabels, series } = matrix;
    if (!gwLabels?.length) { wrap.innerHTML = H.info('Data ranking per GW belum tersedia.'); return; }

    // Theme-aware colors
    const cs = getComputedStyle(document.documentElement);
    const textColor = cs.getPropertyValue('--text3').trim() || '#4a6a88';
    const gridStroke = cs.getPropertyValue('--border').trim() || 'rgba(30,48,72,.4)';

    const N=series.length, GW=gwLabels.length;
    const W=Math.max(900, GW*50), H_svg=N*26+60;
    const PL=16, PR=280, PT=28, PB=20;
    const IW=W-PL-PR, IH=H_svg-PT-PB;
    const xOf=i=>PL+(i/(GW-1||1))*IW;
    const yOf=r=>PT+((r-1)/(N-1||1))*IH;

    const svgPaths = series.map((s,si)=>{
      const pts=gwLabels.map((_,gi)=>s.ranks[gi]!=null?{x:xOf(gi),y:yOf(s.ranks[gi])}:null).filter(Boolean);
      if(pts.length<2) return '';
      let d=`M${pts[0].x},${pts[0].y}`;
      for(let i=1;i<pts.length;i++){
        const cx=(pts[i].x+pts[i-1].x)/2;
        d+=` C${cx},${pts[i-1].y} ${cx},${pts[i].y} ${pts[i].x},${pts[i].y}`;
      }
      const col  = s.isMe ? '#00e676' : MANAGER_COLORS[si%MANAGER_COLORS.length];
      const thick= s.isMe ? 3 : 1.5;
      const opa  = s.isMe ? 1 : .4;
      const dots = pts.map(p=>`<circle cx="${p.x}" cy="${p.y}" r="${s.isMe?4:2}" fill="${col}" stroke="none"/>`).join('');
      const lastPt=pts[pts.length-1];
      const lastR =s.ranks[gwLabels.length-1]||'?';
      // Label: "TeamName (PlayerName) #rank"
      const fullName = s.playerName ? `${s.name} (${s.playerName})` : s.name;
      const lbl=`<text x="${lastPt.x+10}" y="${lastPt.y+4}" fill="${col}" font-size="${s.isMe?12:10}"
        font-weight="${s.isMe?700:400}" font-family="Barlow Condensed,sans-serif">${fullName} #${lastR}</text>`;
      return `<g class="bump-manager">
        <path class="bump-line ${s.isMe?'hl':''}" d="${d}" stroke="${col}" stroke-width="${thick}" opacity="${opa}"/>
        ${dots}${lbl}
      </g>`;
    }).join('');

    const gwHd=gwLabels.map((g,i)=>
      `<text x="${xOf(i)}" y="${H_svg-PB+16}" fill="${textColor}" font-size="10" text-anchor="middle" font-family="Barlow Condensed,sans-serif">GW${g}</text>`
    ).join('');
    const rnkHd=Array.from({length:N},(_,i)=>
      `<text x="${PL-4}" y="${yOf(i+1)+4}" fill="${textColor}" font-size="9" text-anchor="end" font-family="JetBrains Mono,monospace">#${i+1}</text>`
    ).join('');
    const gridH=Array.from({length:GW},(_,i)=>
      `<line x1="${xOf(i)}" y1="${PT}" x2="${xOf(i)}" y2="${H_svg-PB}" stroke="${gridStroke}" stroke-width=".5" opacity=".5"/>`
    ).join('');

    wrap.innerHTML=`<svg class="bump-svg" width="${W}" height="${H_svg}" viewBox="0 0 ${W} ${H_svg}">
      ${gridH}${rnkHd}${gwHd}${svgPaths}
    </svg>`;

    wrap.querySelectorAll('.bump-manager').forEach(g=>{
      const line=g.querySelector('.bump-line');
      const isMe=line?.classList.contains('hl');
      g.addEventListener('mouseenter',()=>{
        wrap.querySelectorAll('.bump-line').forEach(l=>l.style.opacity='0.1');
        if(line){line.style.opacity='1';line.style.strokeWidth=isMe?'3':'2.5';}
      });
      g.addEventListener('mouseleave',()=>{
        wrap.querySelectorAll('.bump-line').forEach(l=>{
          l.style.opacity=l.classList.contains('hl')?'1':'0.4';
          l.style.strokeWidth=l.classList.contains('hl')?'3':'1.5';
        });
      });
    });
  },

  buildStandingsBar(managers) {
    this.destroy('standings');
    const canvas=document.getElementById('chart-standings'); if(!canvas) return;
    const sorted=[...managers].sort((a,b)=>b.total-a.total);
    const myName=CFG.myTeamName.toLowerCase();
    const labels=sorted.map(m=>m.entryName);
    const tps   =sorted.map(m=>m.total||0);
    const gwpts =sorted.map(m=>m.eventTotal||0);
    const bgs   =labels.map(l=>l.toLowerCase().includes(myName)?'rgba(0,230,118,.8)':'rgba(68,138,255,.5)');
    const gwBgs =labels.map(l=>l.toLowerCase().includes(myName)?'rgba(255,215,64,.85)':'rgba(255,215,64,.5)');

    // Theme-aware grid/tick colors
    const cs = getComputedStyle(document.documentElement);
    const gridColor = cs.getPropertyValue('--border').trim() || 'rgba(30,48,72,.5)';
    const tickColor = cs.getPropertyValue('--text3').trim() || '#4a6a88';
    const labelColor = cs.getPropertyValue('--text2').trim() || '#7a9ab8';

    Store.chartInstances['standings']=new Chart(canvas,{
      type:'bar',
      data:{labels, datasets:[
        {
          label:'Total Pts',
          data:tps,
          backgroundColor:bgs,
          borderRadius:3,
          xAxisID:'x',
          order:2,
        },
        {
          label:'GW Pts',
          data:gwpts,
          backgroundColor:gwBgs,
          borderRadius:3,
          xAxisID:'x2',
          order:1,
        },
      ]},
      options:{
        indexAxis:'y',
        responsive:true,
        maintainAspectRatio:false,
        plugins:{
          legend:{labels:{color:labelColor,font:{size:10}}},
          tooltip:{
            callbacks:{
              label: ctx => `${ctx.dataset.label}: ${ctx.raw} pts`,
            }
          },
        },
        scales:{
          x:{
            position:'bottom',
            grid:{color:gridColor},
            ticks:{color:tickColor,font:{size:10}},
            title:{display:true, text:'Total Pts', color:tickColor, font:{size:10}},
          },
          x2:{
            position:'top',
            grid:{drawOnChartArea:false},
            ticks:{color:'rgba(255,215,64,.7)',font:{size:9}},
            title:{display:true, text:'GW Pts', color:'rgba(255,215,64,.7)', font:{size:10}},
          },
          y:{
            grid:{color:gridColor+'33'},
            ticks:{color:labelColor,font:{size:10}},
          },
        },
      },
    });
  },
};

// ═══════════════════════════════════════════════════════
// 9. UI HELPERS
// ═══════════════════════════════════════════════════════
const UI = {
  THEMES: ['dark','steel','light','midnight'],
  THEME_ICONS: {dark:'🌙',steel:'🌤',light:'☀️',midnight:'🌌'},

  initTheme() {
    const saved = localStorage.getItem('fplDashTheme') || 'dark';
    document.documentElement.setAttribute('data-theme', saved);
    const btn = document.getElementById('theme-btn');
    if (btn) btn.textContent = this.THEME_ICONS[saved] || '🌙';
  },

  // ── Heatmap column highlight on click ──
  _hlCol: -1,
  highlightHeatmapCol(colIdx) {
    // Toggle: click same column again to deselect
    if (this._hlCol === colIdx) { this._hlCol = -1; } else { this._hlCol = colIdx; }
    const table = document.querySelector('.heatmap-table');
    if (!table) return;
    // Remove existing highlights
    table.querySelectorAll('.hm-hl, .hm-hl-head').forEach(el => { el.classList.remove('hm-hl','hm-hl-head'); });
    if (this._hlCol < 0) return;
    // Add highlights to column
    table.querySelectorAll(`[data-col="${colIdx}"]`).forEach(el => {
      if (el.classList.contains('hm-me') || el.classList.contains('hm-me-head')) return; // don't override own highlight
      el.classList.add(el.tagName === 'TH' ? 'hm-hl-head' : 'hm-hl');
    });
  },

  // ── Save / Share card as image ──
  shareBar(cardId, title='') {
    return `<div class="share-bar">
      <button class="btn-share" onclick="UI.saveCard('${cardId}','${title}')" title="Save as PNG">📥 Save</button>
      <button class="btn-share" onclick="UI.shareCard('${cardId}','${title}')" title="Share to WhatsApp">💬 Share</button>
    </div>`;
  },

  async saveCard(cardId, title='FPL Dashboard') {
    const el = document.getElementById(cardId);
    if (!el) return;
    try {
      const canvas = await html2canvas(el, { backgroundColor: getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() || '#080d14', scale: 2 });
      const link = document.createElement('a');
      link.download = `${title.replace(/[^a-zA-Z0-9]/g,'_')}_GW${Store.currentGW||''}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch(e) { console.error('Save failed:', e); }
  },

  async shareCard(cardId, title='FPL Dashboard') {
    const el = document.getElementById(cardId);
    if (!el) return;
    try {
      const canvas = await html2canvas(el, { backgroundColor: getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() || '#080d14', scale: 2 });
      const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
      const file = new File([blob], `${title}_GW${Store.currentGW||''}.png`, { type:'image/png' });

      // Try native share first (mobile)
      if (navigator.share && navigator.canShare?.({files:[file]})) {
        await navigator.share({ title, files:[file] });
      } else {
        // Fallback: open WhatsApp with image URL (desktop)
        // Save to temp and open WhatsApp Web
        const url = canvas.toDataURL('image/png');
        const link = document.createElement('a');
        link.download = file.name;
        link.href = url;
        link.click();
        // Open WhatsApp with text
        setTimeout(() => {
          window.open(`https://wa.me/?text=${encodeURIComponent(`${title} — GW${Store.currentGW||''}\n${window.location.href}`)}`, '_blank');
        }, 500);
      }
    } catch(e) { console.error('Share failed:', e); }
  },

  cycleTheme() {
    const current = document.documentElement.getAttribute('data-theme') || 'dark';
    const idx = this.THEMES.indexOf(current);
    const next = this.THEMES[(idx+1) % this.THEMES.length];
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('fplDashTheme', next);
    const btn = document.getElementById('theme-btn');
    if (btn) btn.textContent = this.THEME_ICONS[next] || '🌙';
    // Re-render current tab to pick up new theme colors (SVGs, charts)
    Nav.goTab(Nav.current);
    if (Nav.current==='league' && Store.subtab['league']==='charts') {
      setTimeout(()=>Charts.buildAll(), 150);
    }
  },
  setSrc(type) {
    const el = document.getElementById('src-badge');
    if (!el) return;
    const map = {
      loading: ['Loading…',    ''],
      fpl:     ['✓ FPL API',   ''],
      github:  ['✓ GitHub',    ''],
      cached:  ['⚡ Cached',    ''],
      sheets:  ['⚠ GSheets',   ' fallback'],
      error:   ['✗ Error',     ' error'],
    };
    const [text, cls] = map[type] || map.error;
    el.textContent = text;
    el.className   = `badge badge-src${cls}`;
  },

  showCacheBadge(ageMs) {
    const el = document.getElementById('src-badge');
    if (!el) return;
    el.textContent = `⚡ Cache ${Cache.ageLabel(ageMs)}`;
    el.className   = 'badge badge-src';
    el.title       = `Data dari cache. Cache hits: ${Store.cacheHits||0}, misses: ${Store.cacheMisses||0}`;
  },

  setProgress(msg) {
    const el = document.getElementById('src-badge');
    if (el) { el.textContent = msg; el.className = 'badge badge-src'; }
  },

  updateProgress() {
    const { done, total } = Store.loadProgress;
    if (!total || done >= total) return;
    const pct = Math.round(done / total * 100);
    this.setProgress(`${pct}% (${done}/${total})`);
  },

  // Update cache stats di Settings panel jika terbuka
  updateCacheStats() {
    const el = document.getElementById('cache-stats');
    if (!el) return;
    const s = Cache.stats();
    el.innerHTML = `<span style="color:var(--green)">${s.count} entries</span> · `
      + `<span style="color:var(--text2)">${s.kb} KB</span> · `
      + `<span style="color:var(--orange)">${s.expired} expired</span> · `
      + `Hits: <span style="color:var(--blue)">${Store.cacheHits||0}</span> / `
      + `Miss: <span style="color:var(--text3)">${Store.cacheMisses||0}</span>`;
  },

  setFilter(pos) { Store.posFilter=pos; Nav.goSubtab('lineup','gwscoring'); },
  setSearch(q)   { Store.searchQuery=q; Nav.goSubtab('lineup','gwscoring'); },
  selectForm(i)  { Store.selectedForm=i; Nav.goSubtab('lineup','gwrec'); },

  // ── Cache UI ───────────────────────────────────────
  renderCacheEndpointList() {
    const el = document.getElementById('cache-endpoint-list');
    if (!el) return;
    const gw  = Store.currentGW || '?';
    const tid = CFG.myTeamId || '';
    const lid = CFG.leagues[CFG.selectedLeagueIdx]?.id || '';

    const endpoints = [
      { label:'bootstrap-static/',   path:'bootstrap-static/',           ttl:'6j',  tier:'STATIC' },
      { label:'fixtures/',            path:'fixtures/',                   ttl:'6j',  tier:'STATIC' },
      { label:`event/${gw}/live/`,    path:`event/${gw}/live/`,           ttl:'5m',  tier:'LIVE'   },
      { label:`standings (liga)`,     path:`leagues-classic/${lid}/standings/?page_standings=1`, ttl:'30m', tier:'LEAGUE' },
      ...(tid ? [
        { label:`entry/${tid}/`,              path:`entry/${tid}/`,              ttl:'30m', tier:'LEAGUE' },
        { label:`entry/${tid}/history/`,      path:`entry/${tid}/history/`,      ttl:'30m', tier:'LEAGUE' },
        { label:`entry/${tid}/transfers/`,    path:`entry/${tid}/transfers/`,    ttl:'30m', tier:'LEAGUE' },
        { label:`picks GW${gw}`,             path:`entry/${tid}/event/${gw}/picks/`, ttl:'5m', tier:'LIVE' },
      ] : []),
    ];

    const tierColor = { STATIC:'var(--green)', LEAGUE:'var(--blue)', LIVE:'var(--gold)', SHEETS:'var(--orange)' };

    el.innerHTML = endpoints.map(ep => {
      const url  = CFG.FPL + ep.path;
      const hit  = Cache.get(url);
      const age  = hit ? Cache.ageLabel(hit.ageMs) : null;
      const status = hit
        ? `<span style="color:var(--green);font-size:11px">⚡ ${age}</span>`
        : `<span style="color:var(--text3);font-size:11px">–</span>`;

      return `<tr>
        <td style="padding:5px 8px;font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--text2)">${ep.label}</td>
        <td style="padding:5px 8px;text-align:center;font-size:11px;font-weight:700;color:${tierColor[ep.tier]}">${ep.ttl}</td>
        <td style="padding:5px 8px;text-align:center">${status}</td>
        <td style="padding:5px 8px;text-align:right">
          <button class="btn btn-sm btn-secondary" onclick="UI.clearOneCache('${url}')" style="font-size:9px;padding:2px 6px">↺</button>
        </td>
      </tr>`;
    }).join('');
  },

  clearOneCache(url) {
    Cache.invalidate(url);
    this.renderCacheEndpointList();
    this.updateCacheStats();
    const el = document.getElementById('cache-clear-status');
    if (el) { el.textContent = '✓ Entry dihapus.'; el.className = 'status-msg ok'; setTimeout(()=>el.textContent='',2000); }
  },

  clearCache(scope = 'all') {
    const n = Cache.clear();
    Store.cacheHits = 0; Store.cacheMisses = 0;
    this.renderCacheEndpointList();
    this.updateCacheStats();
    const el = document.getElementById('cache-clear-status');
    if (el) { el.textContent = `✓ ${n} cache entries dihapus.`; el.className = 'status-msg ok'; setTimeout(()=>el.textContent='',3000); }
  },

  async refreshLive() {
    const gw  = Store.currentGW;
    const tid = CFG.myTeamId;
    if (gw)  Cache.invalidate(CFG.FPL + `event/${gw}/live/`);
    if (tid) Cache.invalidate(CFG.FPL + `entry/${tid}/event/${gw}/picks/`);
    this.setProgress('Refreshing live…');
    if (gw) {
      const live = await Fetch.forceLive ? Fetch.forceLive(gw) : Fetch.liveEvent(gw);
      Store.liveEvent = live;
    }
    this.setSrc('fpl');
    Nav.goTab(Nav.current);
    this.renderCacheEndpointList();
    this.updateCacheStats();
  },

  async testProxies() {
    const el = document.getElementById('proxy-test-results');
    if (!el) return;
    const testUrl = CFG.FPL + 'bootstrap-static/';
    const names = CFG.PROXIES.map((_,i)=>`Proxy #${i+1}`);
    const urls  = CFG.PROXIES.map(px=>px(testUrl));

    el.innerHTML = '<div style="color:var(--text3);font-size:12px;margin-bottom:8px">ℹ Direct fetch ke FPL API selalu gagal dari browser karena CORS policy — ini normal. Dashboard menggunakan CORS proxy.</div>'
      + '<div style="color:var(--gold)">⏳ Testing… mohon tunggu.</div>';
    const results = [];

    for (let i = 0; i < urls.length; i++) {
      const name = names[i];
      const url  = urls[i];
      const t0   = performance.now();
      try {
        const r = await fetch(url, { signal: AbortSignal.timeout(10000) });
        const ms = Math.round(performance.now() - t0);
        if (r.ok) {
          const text = await r.text();
          const isJson = text.startsWith('{');
          results.push({ name, ok:true, ms, note: isJson?`✓ OK (${ms}ms, valid JSON)`:`⚠ OK tapi bukan JSON` });
        } else {
          results.push({ name, ok:false, ms, note: `✗ HTTP ${r.status} (${ms}ms)` });
        }
      } catch (e) {
        const ms = Math.round(performance.now() - t0);
        results.push({ name, ok:false, ms, note: `✗ ${e.name}: ${e.message} (${ms}ms)` });
      }

      // Update live
      el.innerHTML = '<div style="color:var(--text3);font-size:12px;margin-bottom:8px">ℹ Direct fetch ke FPL API selalu gagal dari browser karena CORS policy — ini normal.</div>'
        + results.map(r =>
        `<div style="color:${r.ok?'var(--green)':'var(--red)'}">${r.name}: ${r.note}</div>`
      ).join('') + (i < urls.length-1 ? `<div style="color:var(--gold)">⏳ Testing ${names[i+1]}…</div>` : '');
    }

    const working = results.filter(r=>r.ok);
    const summary = working.length
      ? `<div style="margin-top:8px;color:var(--green);font-weight:700">✓ ${working.length}/${results.length} proxy bekerja. Yang tercepat: ${working.sort((a,b)=>a.ms-b.ms)[0].name} (${working[0].ms}ms)</div>`
      : `<div style="margin-top:8px;color:var(--red);font-weight:700">✗ Semua proxy gagal. Gunakan GitHub Actions atau Google Sheets sebagai data source alternatif.</div>`;
    el.innerHTML += summary;
  },

  updateWeightTotals(prefix='gwt') {
    const container = document.getElementById(`${prefix}-GK`)?.closest('table') || document;
    ['GK','DEF','MID','FWD'].forEach(pos=>{
      const inputs=container.querySelectorAll(`.weight-input[data-pos="${pos}"]`);
      const tot=Array.from(inputs).reduce((s,el)=>s+(parseInt(el.value)||0),0);
      const el=document.getElementById(`${prefix}-${pos}`);
      if(el){el.textContent=`${tot}%`;el.className=`wt-total ${tot>=99&&tot<=101?'wt-ok':'wt-warn'}`;}
    });
  },

  applyGWWeights() {
    const newWeights = {};
    document.querySelectorAll('.weight-input[data-mode="gw"]').forEach(el => {
      const f = el.dataset.factor, p = el.dataset.pos;
      if (!newWeights[f]) newWeights[f] = {GK:0,DEF:0,MID:0,FWD:0};
      newWeights[f][p] = Math.round(parseFloat(el.value)||0) / 100;
    });
    Store.gwWeights = newWeights;
    Object.assign(CFG.GW_WEIGHTS, newWeights);
    try { localStorage.setItem('fplDashGWWeights', JSON.stringify(newWeights)); } catch {}
    Process.applyScores(Store.players);
    Nav.goSubtab('lineup','gwscoring');
  },

  applyScoutWeights() {
    const newWeights = {};
    document.querySelectorAll('.weight-input[data-mode="scout"]').forEach(el => {
      const f = el.dataset.factor, p = el.dataset.pos;
      if (!newWeights[f]) newWeights[f] = {GK:0,DEF:0,MID:0,FWD:0};
      newWeights[f][p] = Math.round(parseFloat(el.value)||0) / 100;
    });
    Store.scoutWeights = newWeights;
    try { localStorage.setItem('fplDashScoutWeights', JSON.stringify(newWeights)); } catch {}
    Nav.goSubtab('scout','swt');
  },

  resetScoutWeights() {
    Store.scoutWeights = JSON.parse(JSON.stringify(CFG.SCOUT_WEIGHTS));
    try { localStorage.removeItem('fplDashScoutWeights'); } catch {}
    Nav.goSubtab('scout','swt');
  },

  resetGWWeights() {
    Store.gwWeights = JSON.parse(JSON.stringify(CFG.GW_WEIGHTS));
    try { localStorage.removeItem('fplDashGWWeights'); } catch {}
    Process.applyScores(Store.players);
    Nav.goSubtab('lineup','wlineup');
  },

  toggleCriteria(mode, key) {
    const weights = mode === 'gw' ? Store.gwWeights : Store.scoutWeights;
    if (weights[key]) return; // already active
    weights[key] = {GK:0, DEF:0, MID:0, FWD:0};
    const tab = mode === 'gw' ? 'lineup' : 'scout';
    const subtab = mode === 'gw' ? 'wlineup' : 'swt';
    Nav.goSubtab(tab, subtab);
  },

  removeCriteria(mode, key) {
    const weights = mode === 'gw' ? Store.gwWeights : Store.scoutWeights;
    delete weights[key];
    const tab = mode === 'gw' ? 'lineup' : 'scout';
    const subtab = mode === 'gw' ? 'wlineup' : 'swt';
    Nav.goSubtab(tab, subtab);
  },

  setFdrHorizon(n) {
    Store.fdrHorizon = Math.max(1, Math.min(8, +n || 3));
    // Re-process players with new horizon
    if (Store.bootstrap && Store.fixtures) {
      const { players } = Process.fromBootstrap(Store.bootstrap, Store.fixtures, Store.liveEvent);
      Store.players = players;
      Process.applyScores(players);
    }
    document.getElementById('fdr-horizon-val')?.textContent && (document.getElementById('fdr-horizon-val').textContent = Store.fdrHorizon);
  },

  applySuggestedWeights() {
    const finalWeights = UI._computeOptimalWeights();
    if (!finalWeights) return;
    console.log(`[Optimize] GW applied: ${Object.keys(finalWeights).length} criteria`);
    Store.gwWeights = finalWeights;
    try { localStorage.setItem('fplDashGWWeights', JSON.stringify(finalWeights)); } catch {}
    Process.applyScores(Store.players);
    Nav.goSubtab('lineup','wlineup');
  },

  applySuggestedScoutWeights() {
    const finalWeights = UI._computeOptimalWeights();
    if (!finalWeights) return;
    console.log(`[Optimize] Scout applied: ${Object.keys(finalWeights).length} criteria`);
    Store.scoutWeights = finalWeights;
    try { localStorage.setItem('fplDashScoutWeights', JSON.stringify(finalWeights)); } catch {}
    Nav.goSubtab('scout','swt');
  },

  _computeOptimalWeights() {
    const liveMap = {};
    if (Store.liveEvent?.elements) Store.liveEvent.elements.forEach(e => { liveMap[e.id] = e.stats?.total_points ?? null; });
    const eligible = Store.players.filter(p => p.scores && liveMap[p.id] != null && p.minutes >= 90);
    if (eligible.length < 5) return null;
    const allKeys = CRITERIA.map(c => c.key);
    const pos = ['GK','DEF','MID','FWD'];
    const newWeights = {};
    pos.forEach(position => {
      const pp = eligible.filter(p => p.Position === position);
      if (pp.length < 3) return;
      const actual = pp.map(p => liveMap[p.id]);
      const mean = actual.reduce((s,v)=>s+v,0)/actual.length;
      const corrs = {};
      allKeys.forEach(key => {
        const sc = pp.map(p => p.scores[key] || 0);
        const ms = sc.reduce((s,v)=>s+v,0)/sc.length;
        let n=0,dA=0,dB=0;
        for (let i=0;i<pp.length;i++) { const ds=sc[i]-ms, dp=actual[i]-mean; n+=ds*dp; dA+=ds*ds; dB+=dp*dp; }
        corrs[key] = (dA>0&&dB>0) ? Math.max(0, n/Math.sqrt(dA*dB)) : 0;
      });
      const total = Object.values(corrs).reduce((s,v)=>s+v,0);
      if (total > 0) {
        // Normalize and apply largest-remainder to ensure integer % sums to 100
        const raw = {};
        allKeys.forEach(key => { raw[key] = corrs[key] / total; });
        const adjusted = Process._roundWeightsTo100(raw);
        allKeys.forEach(key => {
          if (!newWeights[key]) newWeights[key] = {GK:0,DEF:0,MID:0,FWD:0};
          newWeights[key][position] = adjusted[key];
        });
      }
    });
    const finalWeights = {};
    Object.entries(newWeights).forEach(([key, w]) => {
      if (pos.some(p => w[p] > 0.005)) finalWeights[key] = w;
    });
    return finalWeights;
  },

  buildLeagueSelect() {
    // No-op: league selector is now inline in League tab renderers
  },

  buildGWSelect() {
    const sel = document.getElementById('gw-select');
    if (!sel || !Store.bootstrap) return;
    const events = Store.bootstrap.events || [];
    const currentGW = Store.currentGW || 1;
    const totalGW = events.length;
    const target = Store.targetGW || 0;

    let html = `<option value="0" ${target===0?'selected':''}>▶ GW${currentGW + 1} (Auto)</option>`;
    html += '<optgroup label="── GW Lalu ──">';
    for (let g = currentGW; g >= 1; g--) {
      const ev = events.find(e => e.id === g);
      const label = g === currentGW ? `GW${g} (Aktif)` : `GW${g}`;
      html += `<option value="${g}" ${target===g?'selected':''}>${label}</option>`;
    }
    html += '</optgroup>';
    html += '<optgroup label="── GW Depan ──">';
    for (let g = currentGW + 1; g <= totalGW; g++) {
      html += `<option value="${g}" ${target===g?'selected':''}>GW${g}</option>`;
    }
    html += '</optgroup>';
    sel.innerHTML = html;
  },

  changeTargetGW(gw) {
    Store.targetGW = gw; // 0 = auto
    const label = gw === 0 ? 'Auto' : `GW${gw}`;
    console.log(`[UI] Target GW changed → ${label}`);

    // Re-process players with new fixture target
    if (Store.bootstrap && Store.fixtures) {
      const { players, targetGW } = Process.fromBootstrap(Store.bootstrap, Store.fixtures, Store.liveEvent);
      Store.players = players;
      Process.applyScores(players);
      // Update GW badge to show target
      const badge = document.getElementById('gw-badge');
      if (badge) {
        if (gw === 0) {
          badge.textContent = `GW ${Store.currentGW}`;
          badge.style.color = '';
        } else if (gw <= Store.currentGW) {
          badge.textContent = `GW ${Store.currentGW} → 🔍${gw}`;
          badge.style.color = 'var(--orange)';
        } else {
          badge.textContent = `GW ${Store.currentGW} → 🔮${gw}`;
          badge.style.color = 'var(--purple)';
        }
      }
      Nav.goTab(Nav.current);
    }
  },

  leagueSelectHTML() {
    const leagues = CFG.leagues.map((l,i)=>
      `<option value="${i}" ${i===CFG.selectedLeagueIdx?'selected':''}>${l.name} (ID: ${l.id})</option>`
    ).join('');
    return `<div class="league-sel-bar">
      <label class="league-sel-label">🏆 Liga Aktif</label>
      <select class="league-sel" onchange="UI.switchLeague(+this.value)">${leagues}</select>
    </div>`;
  },

  switchLeague(idx) {
    CFG.selectedLeagueIdx = idx;
    try {
      const saved = JSON.parse(localStorage.getItem('fplDashCfg')||'{}');
      saved.selectedLeagueIdx = idx;
      localStorage.setItem('fplDashCfg', JSON.stringify(saved));
    } catch {}

    // Clear ALL league-related data
    Store.leagueData = null;
    Store.leagueManagers = [];
    Store.leagueMatrix = null;
    Store.overallRankMatrix = null;
    Store.transferMatrix = null;
    Store.managerHistory = {};
    Store.managerTransfers = {};
    Store.managerInfos = {};
    Store.leaguePicks = {};

    // Invalidate cache for ALL leagues (standings + manager data)
    CFG.leagues.forEach(l => {
      Cache.invalidate(CFG.FPL + 'leagues-classic/' + l.id + '/standings/?page_standings=1');
    });

    // Show loading immediately
    const cont = document.getElementById('content-league');
    if (cont) cont.innerHTML = H.loader(`Memuat data ${CFG.leagues[idx]?.name || 'liga'}…`);

    // Fetch new league data
    App.loadLeagueData(Store.currentGW);
  },

  // ── Team ID auto-lookup ──
  _lookupTimer: null,
  lookupTeamId(val) {
    clearTimeout(this._lookupTimer);
    const el = document.getElementById('team-lookup-result');
    const id = +val;
    if (!id || id < 1) { if (el) el.innerHTML = ''; return; }
    if (el) el.innerHTML = '<div class="lookup-pending">Mencari…</div>';
    this._lookupTimer = setTimeout(async () => {
      try {
        const info = await Fetch.managerInfo(id);
        if (info?.name) {
          Store.myManagerInfo = info;
          const name = info.name;
          const player = `${info.player_first_name||''} ${info.player_last_name||''}`.trim();
          if (el) el.innerHTML = `<div class="lookup-ok">✓ Tim: <b>${name}</b> — Manajer: ${player}</div>`;
          // Auto-set team name in config
          CFG.myTeamName = name;
        } else {
          if (el) el.innerHTML = '<div class="lookup-err">✗ Team ID tidak ditemukan</div>';
        }
      } catch {
        if (el) el.innerHTML = '<div class="lookup-err">✗ Gagal menghubungi FPL API</div>';
      }
    }, 800);
  },

  saveSettings() {
    CFG.myTeamId   = +document.getElementById('my-team-id')?.value   || null;
    // Auto-set team name from manager info lookup
    if (Store.myManagerInfo?.name) CFG.myTeamName = Store.myManagerInfo.name;
    CFG.sheetsUrl  = document.getElementById('sheets-url')?.value    || '';
    CFG.minMinutes = +document.getElementById('min-minutes')?.value  || 450;
    CFG.maxPerTeam = +document.getElementById('max-per-team')?.value || 3;
    try {
      localStorage.setItem('fplDashCfg', JSON.stringify({
        myTeamId:CFG.myTeamId, myTeamName:CFG.myTeamName,
        sheetsUrl:CFG.sheetsUrl, minMinutes:CFG.minMinutes,
        maxPerTeam:CFG.maxPerTeam, selectedLeagueIdx:CFG.selectedLeagueIdx,
      }));
      const s=document.getElementById('settings-status');
      if(s){s.textContent='✓ Settings tersimpan.';s.className='status-msg ok';}
    } catch {}
    this.buildLeagueSelect();
  },

  loadSettings() {
    try {
      const saved=JSON.parse(localStorage.getItem('fplDashCfg')||'{}');
      if(saved.myTeamId)         CFG.myTeamId         = saved.myTeamId;
      if(saved.myTeamName)       CFG.myTeamName       = saved.myTeamName;
      if(saved.sheetsUrl)        CFG.sheetsUrl        = saved.sheetsUrl;
      if(saved.minMinutes)       CFG.minMinutes       = saved.minMinutes;
      if(saved.maxPerTeam)       CFG.maxPerTeam       = saved.maxPerTeam;
      if(saved.selectedLeagueIdx!==undefined) CFG.selectedLeagueIdx = saved.selectedLeagueIdx;
    } catch {}
    // Load scout weights
    try {
      const sw = JSON.parse(localStorage.getItem('fplDashScoutWeights')||'null');
      Store.scoutWeights = sw || JSON.parse(JSON.stringify(CFG.SCOUT_WEIGHTS));
    } catch { Store.scoutWeights = JSON.parse(JSON.stringify(CFG.SCOUT_WEIGHTS)); }
    // Load GW weights
    try {
      const gw = JSON.parse(localStorage.getItem('fplDashGWWeights')||'null');
      if (gw && Object.keys(gw).length > 0) {
        // Validate: keys should be criteria keys, not legacy names
        const hasLegacy = Object.keys(gw).some(k => k.includes(' '));
        if (!hasLegacy) {
          Store.gwWeights = gw;
        } else {
          console.log('[Settings] Legacy GW weights detected, resetting to defaults');
          localStorage.removeItem('fplDashGWWeights');
        }
      }
    } catch {}
    // Validate scout weights too
    try {
      const sw = Store.scoutWeights;
      if (sw && Object.keys(sw).some(k => k.includes(' '))) {
        console.log('[Settings] Legacy Scout weights detected, resetting');
        Store.scoutWeights = JSON.parse(JSON.stringify(CFG.SCOUT_WEIGHTS));
        localStorage.removeItem('fplDashScoutWeights');
      }
    } catch {}
  },
};

// ═══════════════════════════════════════════════════════
// 10. APP — MAIN DATA ORCHESTRATOR
// ═══════════════════════════════════════════════════════
const App = {
  async refresh() {
    Store.cacheHits   = 0;
    Store.cacheMisses = 0;
    Store.loadStart   = Date.now();

    UI.setSrc('loading');
    const cont = document.getElementById(`content-${Nav.current}`);

    // ── Check if bootstrap is cached (instant load path) ──
    const bsUrl    = CFG.FPL + 'bootstrap-static/';
    const bsCached = Cache.get(bsUrl);
    if (bsCached) {
      if (cont) cont.innerHTML = H.loader(`⚡ Memuat dari cache…`);
    } else {
      if (cont) cont.innerHTML = H.loader('Menghubungi data source…');
    }

    // ── Step 0: Try GitHub Pages JSON (same-origin, no CORS) ──
    const ghAll = await Fetch.githubJSON('all.json');
    if (ghAll && !bsCached) {
      // GitHub JSON available — use as sheetsData for computed data
      Store.sheetsData = ghAll;
      console.log('[App] GitHub JSON loaded as sheetsData');
    }

    // ── Step 0b: Try GitHub bootstrap.json (raw FPL data, same-origin) ──
    let bootstrap = null, fixtures = null;
    const ghBs = await Fetch.githubJSON('bootstrap.json');
    const ghFx = await Fetch.githubJSON('fixtures.json');
    if (ghBs && ghFx) {
      bootstrap = ghBs;
      fixtures  = ghFx;
      console.log('[App] ✓ Using GitHub JSON as primary data source');
      UI.setSrc('github');
      Store.dataSource = 'github';
    }

    // ── Step 1: If no GitHub data, try FPL API via CORS proxy ──
    if (!bootstrap) {
      [bootstrap, fixtures] = await Promise.all([
        Fetch.bootstrap(),
        Fetch.fixtures(),
      ]);
    }

    if (!bootstrap) {
      const sheetsUrl = CFG.sheetsUrl || document.getElementById('sheets-url')?.value || '';
      const sd = await Fetch.sheets(sheetsUrl);
      if (sd?.players?.length) {
        Store.sheetsData = sd;
        const r = { gw: sd.meta?.gw||'?', players: sd.players.map(p=>({...p,GWScore:0,doubt:p.status==='d'})) };
        Store.players   = r.players;
        Store.currentGW = r.gw;
        Store.dataSource= 'sheets';
        UI.setSrc('sheets');
        document.getElementById('gw-badge').textContent = `GW ${r.gw}`;
        Process.applyScores(Store.players);
        Nav.goTab(Nav.current);
        return;
      }
      UI.setSrc('error');
      const errs = Store._lastFetchErrors || [];
      const errDetail = errs.length
        ? `<br><br><b style="color:var(--text2)">Detail kegagalan:</b><br><span style="font-family:'JetBrains Mono',monospace;font-size:11px;line-height:2">${errs.map(e=>`• ${e}`).join('<br>')}</span>`
        : '';
      const sheetsNote = sheetsUrl
        ? `<br><br><b style="color:var(--text2)">Google Sheets fallback:</b> URL ditemukan tapi ${sd===null?'gagal fetch/parse — pastikan format output JSON (Apps Script Web App) atau CSV (gviz export).':'tidak ada data player di response.'}`
        : '<br><br><b style="color:var(--orange)">Google Sheets URL kosong.</b> Tambahkan di Settings sebagai fallback.';
      if (cont) cont.innerHTML = H.error(
        `FPL API tidak dapat diakses melalui semua CORS proxy.${errDetail}${sheetsNote}`
        + `<br><br><b>Solusi:</b>`
        + `<br>1. Buka <a href="https://fantasy.premierleague.com/api/bootstrap-static/" target="_blank" style="color:var(--blue)">FPL API langsung</a> — jika bisa dibuka, berarti CORS proxy yang bermasalah.`
        + `<br>2. Coba lagi dalam beberapa menit (proxy sering pulih sendiri).`
        + `<br>3. Buka Console browser (F12) untuk detail error.`
        + `<br>4. Gunakan Google Sheets sebagai alternatif data source.`
      );
      return;
    }

    // ── FPL OK ──
    Store.bootstrap  = bootstrap;
    Store.fixtures   = fixtures;
    Store.dataSource = 'fpl';

    const gwEv = bootstrap.events.find(e=>e.is_current) || bootstrap.events.find(e=>e.is_next);
    const gw   = gwEv?.id || 1;
    Store.currentGW = gw;
    document.getElementById('gw-badge').textContent = `GW ${gw}`;

    // ── Step 2: Live event (try GitHub first, then CORS proxy) ──
    let liveData = await Fetch.githubJSON('live.json');
    if (!liveData) liveData = await Fetch.liveEvent(gw);
    Store.liveEvent = liveData;

    // ── Step 3: Process players ──
    const { players } = Process.fromBootstrap(bootstrap, fixtures, liveData);
    Store.players = players;
    Process.applyScores(players);

    const elapsed = Date.now() - Store.loadStart;
    const srcLabel = Store.dataSource === 'github' ? 'github' : Store.cacheMisses === 0 ? 'cached' : 'fpl';
    UI.setSrc(srcLabel);

    // Render immediately
    Nav.goTab(Nav.current);
    UI.buildGWSelect();

    // ── Step 4: League data (background, concurrency=5) ──
    this.loadLeagueData(gw);

    // ── Step 5: My Squad (background) ──
    if (CFG.myTeamId) this.loadMySquad(gw);

    // ── Step 6: Sheets pre-computed (background) ──
    const sheetsUrl = CFG.sheetsUrl || document.getElementById('sheets-url')?.value || '';
    if (sheetsUrl) this.loadSheets(sheetsUrl);

    // ── Step 7: Player fixtures for recommended lineup (background) ──
    const recPlayerIds = new Set();
    Store.formations.forEach(fm => (fm.all||[]).forEach(p => recPlayerIds.add(p.id)));
    this.loadPlayerFixtures([...recPlayerIds]);

    console.log(`[FPL] Load ${elapsed}ms | hits:${Store.cacheHits} miss:${Store.cacheMisses}`);
  },

  async loadLeagueData(gw) {
    const lid = CFG.leagues[CFG.selectedLeagueIdx]?.id;
    if (!lid) return;

    // Show loading
    if (Nav.current === 'league') {
      const cont = document.getElementById('content-league');
      if (cont && !Store.leagueManagers?.length) cont.innerHTML = H.loader('Memuat data liga…');
    }

    // Fetch standings (force fresh if league was switched)
    let ls = null;
    const forceFresh = !Store.leagueManagers?.length;
    try {
      ls = forceFresh
        ? await Fetch.fpl('leagues-classic/' + lid + '/standings/?page_standings=1', true)
        : await Fetch.leagueStandings(lid);
    } catch(e) { console.warn('[League] standings error:', e); }

    if (!ls) {
      if (Nav.current === 'league') Nav.goTab('league');
      return;
    }
    Store.leagueData = ls;
    const managers = Process.processLeague(ls);
    Store.leagueManagers = managers;
    console.log(`[League] Standings OK: ${managers.length} managers in ${ls.league?.name||'?'}`);

    // Quick render rekap + show history loading indicator
    if (Nav.current === 'league') {
      Nav.goTab('league');
      const cont = document.getElementById('content-league');
      if (cont && managers.length > 0) {
        cont.insertAdjacentHTML('beforeend',
          `<div class="loader-wrap" id="hist-loader" style="padding:20px 0"><div class="spinner"></div><div class="loader-text">Memuat history 0/${managers.length} manajer…</div></div>`);
      }
    }

    // ── Load GitHub data FIRST (instant, no proxy needed) ──
    // Picks
    console.log('[League] Loading GitHub JSON data…');
    let histOK = 0;

    // ── GitHub Picks ──
    const ghPicks = await Fetch.githubJSON('league-picks.json');
    if (ghPicks && typeof ghPicks === 'object' && !Array.isArray(ghPicks)) {
      const keys = Object.keys(ghPicks);
      const firstKey = keys[0];
      const firstVal = ghPicks[firstKey];
      console.log(`[League] GitHub picks: ${keys.length} keys, first="${firstKey}", firstHasPicks=${!!firstVal?.picks}`);

      // Validate format: {entryId: {picks:[...], ...}} not {elements:[...]}
      if (firstVal?.picks && Array.isArray(firstVal.picks)) {
        keys.forEach(eid => {
          const entry = ghPicks[eid];
          if (entry?.picks && Array.isArray(entry.picks)) {
            Store.leaguePicks[eid] = entry;
            Store.leaguePicks[Number(eid)] = entry;
          }
        });
        console.log(`[League] ✓ GitHub picks: ${keys.length} managers`);
      } else {
        console.warn(`[League] ✗ GitHub picks: wrong format. Expected {id:{picks:[...]}}, got key="${firstKey}". File may be stale — re-run GitHub Actions.`);
      }
    } else {
      console.log(`[League] GitHub picks: file not found or empty`);
    }

    // ── GitHub History ──
    const ghHist = await Fetch.githubJSON('history.json');
    if (ghHist && Array.isArray(ghHist) && ghHist.length > 0) {
      const entryIds = new Set(managers.map(m => m.entryId));
      ghHist.forEach(row => {
        const eid = row.entry_id;
        const key = entryIds.has(eid) ? eid : (entryIds.has(Number(eid)) ? Number(eid) : null);
        if (!key) return;
        if (!Store.managerHistory[key]) Store.managerHistory[key] = { current: [], chips: [] };
        Store.managerHistory[key].current.push(row);
      });
      histOK = Object.keys(Store.managerHistory).length;
      console.log(`[League] GitHub history: ${histOK} managers`);
    }

    // ── GitHub Chips ──
    const ghChips = await Fetch.githubJSON('chips.json');
    if (ghChips && Array.isArray(ghChips) && ghChips.length > 0) {
      ghChips.forEach(chip => {
        const eid = chip.entry_id;
        const key = Store.managerHistory[eid] ? eid : (Store.managerHistory[Number(eid)] ? Number(eid) : null);
        if (!key) return;
        if (!Store.managerHistory[key].chips) Store.managerHistory[key].chips = [];
        // Avoid duplicates
        const exists = Store.managerHistory[key].chips.some(c => c.event === chip.event && c.name === chip.name);
        if (!exists) Store.managerHistory[key].chips.push(chip);
      });
      console.log(`[League] GitHub chips: ${ghChips.length} usages loaded`);
    }

    // ── Proxy: only fetch what GitHub doesn't have ──
    const needProxy = histOK < managers.length;
    if (needProxy) {
      const missing = managers.filter(m => !Store.managerHistory[m.entryId] && !Store.managerHistory[String(m.entryId)]);
      console.log(`[League] Proxy: fetching ${missing.length} missing history…`);
      missing.forEach(m => Cache.invalidate(CFG.FPL + 'entry/' + m.entryId + '/history/'));

      const tasks = missing.map(m => async () => {
        try {
          let h = await Fetch.fpl('entry/' + m.entryId + '/history/', true);
          if (h && !h.current && h.contents) h = typeof h.contents === 'string' ? JSON.parse(h.contents) : h.contents;
          if (h?.current?.length) { Store.managerHistory[m.entryId] = h; histOK++; }
        } catch {}
        const lt = document.querySelector('#hist-loader .loader-text');
        if (lt) lt.textContent = `History: ${histOK}/${managers.length}`;
      });

      // Also fetch missing picks
      const missingPicks = managers.filter(m => !Store.leaguePicks[m.entryId] && !Store.leaguePicks[String(m.entryId)]);
      const pTasks = missingPicks.map(m => async () => {
        try {
          const p = await Fetch.managerPicks(m.entryId, gw);
          if (p?.picks) { Store.leaguePicks[m.entryId] = p; Store.leaguePicks[String(m.entryId)] = p; }
        } catch {}
      });

      const allTasks = [];
      for (let i = 0; i < Math.max(tasks.length, pTasks.length); i++) {
        if (i < tasks.length) allTasks.push(tasks[i]);
        if (i < pTasks.length) allTasks.push(pTasks[i]);
      }
      if (allTasks.length) await Fetch.batch(allTasks, 2, 250);
      histOK = Object.keys(Store.managerHistory).length;
      console.log(`[League] After proxy: History ${histOK}, Picks ${Object.keys(Store.leaguePicks).length}`);
    } else {
      console.log(`[League] GitHub had all data — skipping proxy`);
    }

    // Build matrices immediately after history (don't wait for transfers)
    if (histOK > 0) {
      Store.leagueMatrix      = Process.buildLeagueRankMatrix(managers, Store.managerHistory);
      Store.overallRankMatrix  = Process.buildRankingMatrix(managers, Store.managerHistory);
      console.log(`[League] Matrix built: ${Store.leagueMatrix?.gwLabels?.length} GWs, ${Store.leagueMatrix?.series?.length} series`);
    } else {
      console.warn(`[League] ⚠ No history data — charts will not render. Proxy may be rate-limiting.`);
    }

    // Re-render with chart + picks data
    if (Nav.current === 'league') {
      Nav.goTab('league');
      if (Store.subtab['league'] === 'charts') setTimeout(()=>Charts.buildAll(), 200);
    }

    // ── Phase 2: Transfers + Info (try GitHub first) ──
    const ghTransfers = await Fetch.githubJSON('transfers.json');
    if (Array.isArray(ghTransfers) && ghTransfers.length > 0) {
      // Group by entry_id
      ghTransfers.forEach(t => {
        const eid = t.entry_id;
        if (!Store.managerTransfers[eid]) Store.managerTransfers[eid] = [];
        Store.managerTransfers[eid].push(t);
      });
      console.log(`[League] Transfers from GitHub: ${Object.keys(Store.managerTransfers).length} managers`);
    }

    // Proxy fetch for remaining transfers + info
    const bgTasks = [
      ...managers.filter(m => !Store.managerTransfers[m.entryId] && !Store.managerTransfers[String(m.entryId)])
        .map(m => async () => {
          try { const t = await Fetch.managerTransfers(m.entryId); if (t) Store.managerTransfers[m.entryId] = t; } catch {}
        }),
      ...managers.map(m => async () => {
        try { const i = await Fetch.managerInfo(m.entryId); if (i) Store.managerInfos[m.entryId] = i; } catch {}
      }),
    ];
    if (bgTasks.length) await Fetch.batch(bgTasks, 2, 500);
    Store.transferMatrix = Process.buildTransferMatrix(managers, Store.managerTransfers);
    console.log(`[League] Transfers+Info done. Transfer matrix: ${Store.transferMatrix?.rows?.length||0} GWs`);

    // Final re-render
    if (Nav.current === 'league') Nav.goTab('league');
  },

  async loadMySquad(gw) {
    const tid = CFG.myTeamId;
    if (!tid) return;

    // Try GitHub first (instant, no proxy needed)
    let picks = await Fetch.githubJSON('picks.json');
    if (picks) console.log('[App] ✓ My picks from GitHub');

    let info = await Fetch.githubJSON('manager.json');
    if (info) console.log('[App] ✓ My manager info from GitHub');

    // Proxy fallback only if GitHub didn't have it
    if (!picks) {
      try { picks = await Fetch.managerPicks(tid, gw); } catch {}
    }
    if (!info) {
      try { info = await Fetch.managerInfo(tid); } catch {}
    }

    if (info) Store.myManagerInfo = info;
    if (!picks) { console.warn('[App] My picks: not available'); return; }
    Store.myPicks    = picks;
    Store.mySquadData= Process.buildMySquad(picks, Store.bootstrap);
    console.log(`[App] My squad built: ${Store.mySquadData?.length||0} players`);

    // Load element-summary for squad players (background)
    this.loadPlayerFixtures((Store.mySquadData||[]).map(p=>p.id).slice(0,15));

    // Re-render if on other tab / mysquad
    if (Nav.current==='other' && Store.subtab['other']==='mysquad') Nav.goSubtab('other','mysquad');
  },

  async loadPlayerFixtures(playerIds) {
    if (!playerIds?.length) return;
    const tasks = playerIds.filter(id=>!Store.playerFixtures[id]).map(id => async () => {
      const data = await Fetch.playerSummary(id);
      if (data) Store.playerFixtures[id] = data;
      return data;
    });
    if (tasks.length) await Fetch.batch(tasks, 4);
  },

  async loadSheets(url) {
    const sd = await Fetch.sheets(url);
    if (!sd) return;
    Store.sheetsData = sd;
    // Trigger re-render of currently visible panel if it uses sheets data
    const cur = Nav.current;
    if (['scout','other'].includes(cur)) Nav.goTab(cur);
    if (cur==='league' && Store.subtab['league']==='transfer') Nav.goSubtab('league','transfer');
    if (cur==='epl') Nav.goTab('epl');
  },

  init() {
    UI.loadSettings();
    UI.initTheme();
    UI.buildLeagueSelect();
    Nav.init();
    this.refresh();
  },
};

// ─── Start ───────────────────────────────────────────
App.init();
