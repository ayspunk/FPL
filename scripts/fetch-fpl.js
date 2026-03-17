#!/usr/bin/env node
// ============================================================
// FPL DATA FETCHER — Node.js (untuk GitHub Actions)
// Fetch FPL API → hitung EPL/FDR/League → simpan JSON ke data/
// Tidak perlu CORS proxy — berjalan di server GitHub!
// ============================================================

const fs   = require('fs');
const path = require('path');
const https = require('https');

// ============================================================
// CONFIG
// ============================================================
const CONFIG = {
  LEAGUE_IDS:  [24873, 611927, 2150310],
  MY_ENTRY_ID: 2414649,
  FPL_BASE:    'https://fantasy.premierleague.com/api',
  DATA_DIR:    path.join(__dirname, '..', 'data'),
  DELAY_MS:    400,
};

// ============================================================
// HTTP FETCH
// ============================================================
function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
      }
    }, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode} from ${url.split('/').slice(-3).join('/')}`));
        res.resume();
        return;
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch(e) { reject(new Error(`JSON parse: ${e.message}`)); }
      });
    }).on('error', reject);
  });
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }
function log(msg) { console.log(`[${new Date().toISOString().slice(11,19)}] ${msg}`); }
function saveJSON(filename, data) {
  const fp = path.join(CONFIG.DATA_DIR, filename);
  fs.writeFileSync(fp, JSON.stringify(data));
  const kb = (fs.statSync(fp).size / 1024).toFixed(1);
  log(`  💾 ${filename} (${kb} KB)`);
}

// ============================================================
// MAIN
// ============================================================
async function main() {
  log('▶ FPL Data Fetch START');
  fs.mkdirSync(CONFIG.DATA_DIR, { recursive: true });

  const result = {
    meta: null, players: [], scoutScoring: [], eplTable: [],
    fdr: {}, league: {}, scoutRec: [], chipRec: [],
    _updated: new Date().toISOString(),
  };

  try {
    // ═══ 1. BOOTSTRAP ═══
    log('Fetching bootstrap-static...');
    const bootstrap = await fetchJSON(CONFIG.FPL_BASE + '/bootstrap-static/');
    const curEv = bootstrap.events.find(e => e.is_current) || bootstrap.events.find(e => e.is_next);
    const gw = curEv ? curEv.id : 1;
    log(`✅ ${bootstrap.elements.length} pemain, ${bootstrap.teams.length} tim, GW${gw}`);
    result.meta = { gw };
    saveJSON('bootstrap.json', bootstrap);

    // ═══ 2. FIXTURES ═══
    log('Fetching fixtures...');
    const fixtures = await fetchJSON(CONFIG.FPL_BASE + '/fixtures/');
    log(`✅ ${fixtures.length} fixtures`);
    saveJSON('fixtures.json', fixtures);

    // ═══ 3. LIVE EVENT ═══
    log(`Fetching event/${gw}/live...`);
    let liveData = null;
    try {
      liveData = await fetchJSON(CONFIG.FPL_BASE + `/event/${gw}/live/`);
      log(`✅ live: ${liveData.elements.length} pemain`);
      saveJSON('live.json', liveData);
    } catch(e) { log(`⚠ live gagal: ${e.message}`); }

    // ═══ 4. PLAYERS ═══
    const teamMap = {};
    bootstrap.teams.forEach(t => { teamMap[t.id] = t; });
    const posMap = { 1:'GK', 2:'DEF', 3:'MID', 4:'FWD' };
    const players = bootstrap.elements
      .filter(p => p.status === 'a' || (p.status === 'd' && (p.chance_of_playing_next_round||0) >= 75))
      .map(p => {
        const team = teamMap[p.team] || {};
        return {
          id: p.id, Player: p.web_name, Team: team.short_name||'?',
          TeamFull: team.name||'?', Position: posMap[p.element_type]||'FWD',
          Price: (p.now_cost||0)/10, status: p.status, minutes: p.minutes||0,
          PPG: +p.points_per_game||0, Form: +p.form||0, TP: +p.total_points||0,
          EP: +p.ep_next||0, TSB: +p.selected_by_percent||0,
          xGI: +p.expected_goal_involvements||0, xGC: +p.expected_goals_conceded||0,
          Saves: +p.saves||0, ICT: +p.ict_index||0, YC: +p.yellow_cards||0,
          TIn: +p.transfers_in_event||0, TOut: +p.transfers_out_event||0,
        };
      });
    result.players = players;
    result.scoutScoring = players;
    log(`✅ ${players.length} players computed`);

    // ═══ 5. EPL TABLE ═══
    result.eplTable = buildEPLTable(fixtures, bootstrap.teams);
    log(`✅ eplTable: ${result.eplTable.length} tim`);

    // ═══ 6. FDR MATRIX ═══
    result.fdr = buildFDR(fixtures, bootstrap.teams);
    log(`✅ fdr: ${result.fdr.gwLabels.length} GW`);

    // ═══ 7. LEAGUE DATA (standings + history + transfers + picks) ═══
    const leagueData = await fetchLeagueData(gw);
    result.league = leagueData;

    // ═══ 8. MY PICKS & INFO ═══
    try {
      const picks = await fetchJSON(`${CONFIG.FPL_BASE}/entry/${CONFIG.MY_ENTRY_ID}/event/${gw}/picks/`);
      saveJSON('picks.json', picks);
      log('✅ my picks');
    } catch(e) { log(`⚠ my picks: ${e.message}`); }

    try {
      const info = await fetchJSON(`${CONFIG.FPL_BASE}/entry/${CONFIG.MY_ENTRY_ID}/`);
      saveJSON('manager.json', info);
      log('✅ my manager info');
    } catch(e) { log(`⚠ manager info: ${e.message}`); }

    // ═══ SAVE ALL ═══
    saveJSON('all.json', result);
    log(`■ SELESAI — ${players.length} pemain, GW${gw}`);

  } catch(e) {
    log(`❌ FATAL: ${e.message}`);
    console.error(e);
    process.exit(1);
  }
}

// ============================================================
// EPL TABLE
// ============================================================
function buildEPLTable(fixtures, teams) {
  const teamMap = {};
  teams.forEach(t => { teamMap[t.id] = t; });
  const stats = {};
  teams.forEach(t => {
    stats[t.id] = { w:0, d:0, l:0, gf:0, ga:0, pts:0, form:[], strength: t.strength||0 };
  });
  fixtures.filter(f => f.finished && f.team_h_score != null).sort((a,b) => a.event-b.event)
    .forEach(f => {
      const hId=f.team_h, aId=f.team_a, hg=f.team_h_score||0, ag=f.team_a_score||0;
      if (!stats[hId]||!stats[aId]) return;
      stats[hId].gf+=hg; stats[hId].ga+=ag; stats[aId].gf+=ag; stats[aId].ga+=hg;
      if (hg>ag) { stats[hId].w++; stats[hId].pts+=3; stats[hId].form.push('W'); stats[aId].l++; stats[aId].form.push('L'); }
      else if (hg<ag) { stats[aId].w++; stats[aId].pts+=3; stats[aId].form.push('W'); stats[hId].l++; stats[hId].form.push('L'); }
      else { stats[hId].d++; stats[hId].pts+=1; stats[hId].form.push('D'); stats[aId].d++; stats[aId].pts+=1; stats[aId].form.push('D'); }
    });
  return Object.keys(stats).map(tid => {
    const s=stats[tid], t=teamMap[+tid]||{};
    return { club:t.name||'?', short:t.short_name||'?', p:s.w+s.d+s.l, w:s.w, d:s.d, l:s.l,
      gf:s.gf, ga:s.ga, gd:s.gf-s.ga, pts:s.pts, form:s.form.slice(-5).join(''), strength:s.strength };
  }).sort((a,b) => b.pts-a.pts||b.gd-a.gd||b.gf-a.gf);
}

// ============================================================
// FDR MATRIX
// ============================================================
function buildFDR(fixtures, teams) {
  const teamMap = {};
  teams.forEach(t => { teamMap[t.id] = t; });
  const strDef=teams.flatMap(t=>[t.strength_defence_home,t.strength_defence_away]);
  const strAtk=teams.flatMap(t=>[t.strength_attack_home,t.strength_attack_away]);
  const [mnD,mxD]=[Math.min(...strDef),Math.max(...strDef)];
  const [mnA,mxA]=[Math.min(...strAtk),Math.max(...strAtk)];
  const nFDR=(v,mn,mx)=>mn===mx?3:Math.round((1+(v-mn)/(mx-mn)*4)*10)/10;
  const upcoming=fixtures.filter(f=>!f.finished_provisional).sort((a,b)=>a.event-b.event);
  const gwRange=[...new Set(upcoming.map(f=>f.event))].sort((a,b)=>a-b).slice(0,8);
  function matrix(type) {
    return teams.map(t => {
      const fixes=gwRange.map(gw=>{
        const gwF=upcoming.filter(f=>f.event===gw&&(f.team_h===t.id||f.team_a===t.id));
        if(!gwF.length)return null;
        return gwF.map(f=>{
          const isH=f.team_h===t.id,opp=teamMap[isH?f.team_a:f.team_h];
          if(!opp)return null;
          const fdrD=nFDR(isH?opp.strength_attack_away:opp.strength_attack_home,mnD,mxD);
          const fdrA=nFDR(isH?opp.strength_defence_away:opp.strength_defence_home,mnA,mxA);
          const val=type==='def'?fdrD:type==='atk'?fdrA:Math.round((fdrD+fdrA)/2*10)/10;
          return {opp:opp.short_name,isHome:isH,val};
        }).filter(Boolean);
      });
      let tot=0,cnt=0;
      fixes.forEach(a=>{if(a)a.forEach(f=>{tot+=f.val;cnt++;});});
      return {team:t.short_name,avg:cnt?Math.round(tot/cnt*10)/10:3,fixes};
    }).sort((a,b)=>a.avg-b.avg);
  }
  return {def:matrix('def'),atk:matrix('atk'),ovr:matrix('ovr'),gwLabels:gwRange.map(g=>`GW${g}`)};
}

// ============================================================
// LEAGUE DATA — All manager data in one pass
// ============================================================
async function fetchLeagueData(gw) {
  const allEntryIDs = new Set();
  const standings = {};

  // Fetch standings per league
  for (const lid of CONFIG.LEAGUE_IDS) {
    try {
      await delay(CONFIG.DELAY_MS);
      const data = await fetchJSON(`${CONFIG.FPL_BASE}/leagues-classic/${lid}/standings/`);
      standings[lid] = data.standings.results.map(r => ({
        entry:r.entry, entry_name:r.entry_name, player_name:r.player_name,
        rank:r.rank, last_rank:r.last_rank, total:r.total, event_total:r.event_total,
      }));
      data.standings.results.forEach(r => allEntryIDs.add(r.entry));
      log(`  standings ${lid}: ${data.standings.results.length} peserta`);
    } catch(e) { log(`  ⚠ standings ${lid}: ${e.message}`); }
  }

  const managerNames = {};
  Object.values(standings).forEach(arr => arr.forEach(s => { managerNames[s.entry] = s.entry_name; }));
  const managers = Object.values(managerNames);
  const entryList = [...allEntryIDs];

  // Fetch history + transfers + picks for ALL managers
  log(`  Fetching history+transfers+picks for ${entryList.length} entries...`);
  const allHistory = [], allChips = [], allTransfers = [];
  const allPicks = {};  // {entryId: picks}

  for (let i = 0; i < entryList.length; i++) {
    const id = entryList[i];

    // History
    await delay(CONFIG.DELAY_MS);
    try {
      const h = await fetchJSON(`${CONFIG.FPL_BASE}/entry/${id}/history/`);
      h.current.forEach(row => allHistory.push({ ...row, entry_id: id }));
      if (h.chips) h.chips.forEach(row => allChips.push({ ...row, entry_id: id }));
    } catch(e) {}

    // Transfers
    await delay(CONFIG.DELAY_MS);
    try {
      const t = await fetchJSON(`${CONFIG.FPL_BASE}/entry/${id}/transfers/`);
      t.forEach(row => allTransfers.push({ ...row, entry_id: id }));
    } catch(e) {}

    // Picks for current GW
    await delay(CONFIG.DELAY_MS);
    try {
      const p = await fetchJSON(`${CONFIG.FPL_BASE}/entry/${id}/event/${gw}/picks/`);
      if (p?.picks) allPicks[id] = p;
    } catch(e) {}

    if ((i+1)%5===0 || i===entryList.length-1) {
      log(`  entries [${i+1}/${entryList.length}]`);
    }
  }

  // Build transfer heatmap
  const gwSet = new Set();
  allHistory.forEach(h => gwSet.add(h.event));
  const gwLabels = [...gwSet].sort((a,b) => a-b);
  const transferData = gwLabels.map(gwNum => {
    const row = [gwNum];
    entryList.forEach(entryId => {
      const trs = allTransfers.filter(t => t.entry_id===entryId && t.event===gwNum);
      const chip = allChips.find(c => c.entry_id===entryId && c.event===gwNum);
      if (chip) {
        const cn = (chip.name||'').toLowerCase();
        if (cn.includes('wildcard')) row.push('🃏 WC');
        else if (cn.includes('freehit')||cn.includes('free_hit')) row.push('🎯 FH');
        else if (cn.includes('bboost')||cn.includes('bench_boost')) row.push('💺 BB');
        else if (cn.includes('3xc')||cn.includes('triple_captain')) row.push('👑 TC');
        else row.push(chip.name);
      } else {
        row.push(trs.length);
      }
    });
    return row;
  });

  // Save individual data files
  saveJSON('history.json', allHistory);
  saveJSON('transfers.json', allTransfers);
  saveJSON('league-picks.json', allPicks);
  log(`  ✅ league-picks: ${Object.keys(allPicks).length} managers`);

  return { managers, rekap: standings, transfer: transferData, standings };
}

// ════════════════════════════════════════════════
main();
