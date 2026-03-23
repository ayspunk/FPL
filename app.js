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
  myTeamId:     null,         // FPL entry/team ID user (isi di Settings)
  myTeamName:   'r00kie',     // nama tim untuk highlight
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
  {key:'total_points', label:'Total Points',         group:'Performance', type:'direct',  field:'total_points'},
  {key:'round_points', label:'Round Points',         group:'Performance', type:'direct',  field:'event_points'},
  {key:'ppg',          label:'Points Per Game',      group:'Performance', type:'direct',  field:'points_per_game', tip:'Rata-rata poin per pertandingan musim ini.'},
  {key:'form',         label:'Form',                 group:'Performance', type:'direct',  field:'form', tip:'Rata-rata poin dari 5 GW terakhir.'},
  {key:'ep_next',      label:'Expected Points',      group:'Performance', type:'direct',  field:'ep_next'},
  {key:'bonus',        label:'Bonus',                group:'Performance', type:'per90',   field:'bonus'},
  {key:'bps',          label:'Bonus Pts System',     group:'Performance', type:'per90',   field:'bps'},
  // ── Attacking ──
  {key:'goals_scored', label:'Goals Scored',         group:'Attacking',   type:'per90',   field:'goals_scored'},
  {key:'assists',      label:'Assists',              group:'Attacking',   type:'per90',   field:'assists'},
  {key:'xg',           label:'xG (Total)',           group:'Attacking',   type:'per90',   field:'expected_goals'},
  {key:'xa',           label:'xA (Total)',           group:'Attacking',   type:'per90',   field:'expected_assists'},
  {key:'xgi',          label:'xGI (Total)',          group:'Attacking',   type:'per90',   field:'expected_goal_involvements', tip:'Expected Goal Involvements per 90 menit. xG + xA.'},
  // ── Defending ──
  {key:'clean_sheets', label:'Clean Sheets',         group:'Defending',   type:'per90',   field:'clean_sheets'},
  {key:'goals_conceded',label:'Goals Conceded',      group:'Defending',   type:'inverse_per90', field:'goals_conceded'},
  {key:'xgc',          label:'xGC (Total)',          group:'Defending',   type:'inverse_per90', field:'expected_goals_conceded', tip:'Expected Goals Conceded per 90. Inverse: sedikit = skor tinggi.'},
  {key:'own_goals',    label:'Own Goals',            group:'Defending',   type:'inverse_per90', field:'own_goals'},
  {key:'penalties_saved',label:'Penalties Saved',    group:'Defending',   type:'per90',   field:'penalties_saved'},
  {key:'saves',        label:'Saves',                group:'Defending',   type:'per90',   field:'saves', tip:'Jumlah penyelamatan per 90 menit. Utama untuk GK.'},
  // ── Creativity & Threat ──
  {key:'influence',    label:'Influence',            group:'ICT',         type:'direct',  field:'influence'},
  {key:'creativity',   label:'Creativity',           group:'ICT',         type:'direct',  field:'creativity'},
  {key:'threat',       label:'Threat',               group:'ICT',         type:'direct',  field:'threat'},
  {key:'ict_index',    label:'ICT Index',            group:'ICT',         type:'direct',  field:'ict_index', tip:'Influence + Creativity + Threat gabungan dari FPL.'},
  // ── Discipline ──
  {key:'yellow_cards', label:'Yellow Cards',         group:'Discipline',  type:'inverse_per90', field:'yellow_cards'},
  {key:'red_cards',    label:'Red Cards',            group:'Discipline',  type:'inverse_per90', field:'red_cards'},
  {key:'penalties_missed',label:'Penalties Missed',  group:'Discipline',  type:'inverse_per90', field:'penalties_missed'},
  // ── Value & Ownership ──
  {key:'price',        label:'Price',                group:'Value',       type:'inverse_direct', field:'now_cost', transform: v=>v/10},
  {key:'value_form',   label:'Value (Form)',         group:'Value',       type:'direct',  field:'value_form'},
  {key:'value_season', label:'Value (Season)',       group:'Value',       type:'direct',  field:'value_season'},
  {key:'tsb',          label:'Selected By %',        group:'Value',       type:'direct',  field:'selected_by_percent'},
  // ── Transfers ──
  {key:'transfers_in', label:'Transfers In (round)', group:'Transfers',   type:'direct',  field:'transfers_in_event'},
  {key:'transfers_out',label:'Transfers Out (round)',group:'Transfers',   type:'inverse_direct', field:'transfers_out_event'},
  {key:'net_transfers',label:'Net Transfers (round)',group:'Transfers',   type:'direct',  field:null, compute: p => (+p.transfers_in_event||0) - (+p.transfers_out_event||0)},
  {key:'cost_change',  label:'Price Change (round)', group:'Transfers',   type:'direct',  field:'cost_change_event'},
  // ── Minutes ──
  {key:'minutes',      label:'Minutes Played',       group:'Other',       type:'direct',  field:'minutes'},
  {key:'starts',       label:'Starts',               group:'Other',       type:'direct',  field:'starts'},
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
      console.log(`[GitHub] ✓ ${filename}$
