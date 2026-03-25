#!/usr/bin/env node
// ============================================================
// FPL DATA FETCHER v2 — parallel + retry + incremental
// Credit: ays
// ============================================================
const fs=require('fs'),path=require('path'),https=require('https');
const CFG={LEAGUE_IDS:[24873,611927,2150310],MY_ENTRY_ID:2414649,FPL:'https://fantasy.premierleague.com/api',DIR:path.join(__dirname,'..','data'),C:10,RETRY:3,RETRY_MS:1000};
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const log=m=>console.log(`[${new Date().toISOString().slice(11,19)}] ${m}`);
function save(f,d){const p=path.join(CFG.DIR,f);fs.writeFileSync(p,JSON.stringify(d));log(`  💾 ${f} (${(fs.statSync(p).size/1024).toFixed(1)}KB)`);}
function load(f){const p=path.join(CFG.DIR,f);if(!fs.existsSync(p))return null;try{return JSON.parse(fs.readFileSync(p,'utf8'))}catch{return null}}

async function get(url,retries=CFG.RETRY){
  for(let a=1;a<=retries;a++){
    try{
      const d=await new Promise((res,rej)=>{
        https.get(url,{headers:{'User-Agent':'Mozilla/5.0','Accept':'application/json'}},r=>{
          if(r.statusCode===429){rej(new Error('RATE'));r.resume();return}
          if(r.statusCode!==200){rej(new Error(`HTTP${r.statusCode}`));r.resume();return}
          let b='';r.on('data',c=>b+=c);r.on('end',()=>{try{res(JSON.parse(b))}catch(e){rej(e)}});
        }).on('error',rej);
      });
      return d;
    }catch(e){
      if(a<retries){const w=CFG.RETRY_MS*Math.pow(2,a-1)*(e.message==='RATE'?3:1);await delay(w);}
      else throw e;
    }
  }
}

async function parallel(tasks,c=CFG.C){
  const R=new Array(tasks.length).fill(null);let i=0,done=0,err=0;const t=tasks.length,s=Date.now();
  const w=async()=>{while(i<tasks.length){const j=i++;try{R[j]=await tasks[j]();done++}catch{err++;done++}
    if(done%50===0||done===t)log(`  ...${done}/${t} (${err}err ${((Date.now()-s)/1000).toFixed(1)}s)`);}};
  await Promise.all(Array.from({length:Math.min(c,t)},w));return R;
}

async function main(){
  const T=Date.now();log('▶ FPL Fetch v2');fs.mkdirSync(CFG.DIR,{recursive:true});
  const res={meta:null,players:[],scoutScoring:[],eplTable:[],fdr:{},league:{},_updated:new Date().toISOString()};
  try{
    // 1. BOOTSTRAP + FIXTURES
    log('Fetching bootstrap+fixtures...');
    const[bs,fx]=await Promise.all([get(CFG.FPL+'/bootstrap-static/'),get(CFG.FPL+'/fixtures/')]);
    const gw=(bs.events.find(e=>e.is_current)||bs.events.find(e=>e.is_next))?.id||1;
    res.meta={gw,updated:new Date().toISOString()};
    log(`✅ bootstrap:${bs.elements.length} players GW${gw}`);
    save('bootstrap.json',bs);save('fixtures.json',fx);

    // 2. LIVE
    let live=null;
    try{live=await get(CFG.FPL+`/event/${gw}/live/`);save('live.json',live);log(`✅ live:${live.elements.length}`);}catch(e){log(`⚠ live:${e.message}`);}

    // 3. ELEMENT SUMMARIES — INCREMENTAL
    const pids=bs.elements.filter(e=>e.minutes>0).map(e=>e.id);
    const meta=load('elem-meta.json')||{};
    const cached=load('elem-hist.json')||{};
    const fresh=meta.gw<gw||Object.keys(cached).length<100;
    let hist={};
    if(!fresh){log(`⚡ Incremental: cached GW${meta.gw}, skip refetch`);hist=cached;}
    else{
      log(`🔄 Fetching ${pids.length} element-summaries (×${CFG.C} parallel)...`);
      const tasks=pids.map(id=>async()=>{const s=await get(CFG.FPL+`/element-summary/${id}/`);return{id,h:s?.history||[]};});
      const r=await parallel(tasks);
      r.forEach(x=>{if(x?.h?.length)hist[x.id]=x.h;});
      save('elem-hist.json',hist);save('elem-meta.json',{gw,at:new Date().toISOString()});
    }
    log(`✅ Histories:${Object.keys(hist).length} players`);

    // 4. SNAPSHOTS + LIVE-ALL
    log('Building snapshots...');
    const fin=bs.events.filter(e=>e.finished).map(e=>e.id).sort((a,b)=>a-b);
    const tm={};bs.teams.forEach(t=>{tm[t.id]=t;});const pm={1:'GK',2:'DEF',3:'MID',4:'FWD'};
    const snaps={},liveAll={};
    for(const g of fin){
      const gp={},gl=[];
      bs.elements.forEach(el=>{
        const h=hist[el.id];if(!h)return;
        const past=h.filter(r=>r.round<=g),cur=h.find(r=>r.round===g);
        if(!past.length)return;
        const tp=past.reduce((s,r)=>s+(r.total_points||0),0),mn=past.reduce((s,r)=>s+(r.minutes||0),0);
        const played=past.filter(r=>r.minutes>0),gms=played.length,ppg=gms?+(tp/gms).toFixed(1):0;
        const l5=played.slice(-5),form=l5.length?+(l5.reduce((s,r)=>s+(r.total_points||0),0)/l5.length).toFixed(1):0;
        const sum=(f)=>past.reduce((s,r)=>s+(+(r[f]||0)),0);
        gp[el.id]={ppg,form,tp,mn,gp:gms,xgi:+sum('expected_goal_involvements').toFixed(2),xgc:+sum('expected_goals_conceded').toFixed(2),
          sv:sum('saves'),bn:sum('bonus'),ict:+sum('ict_index').toFixed(1),gl:sum('goals_scored'),as:sum('assists'),cs:sum('clean_sheets'),yc:sum('yellow_cards'),
          pr:cur?.value||el.now_cost,pos:el.element_type,tm:el.team};
        if(cur)gl.push({id:el.id,tp:cur.total_points,bn:cur.bonus,mn:cur.minutes});
      });
      snaps[g]=gp;liveAll[g]=gl;
    }
    save('snapshots.json',snaps);save('live-all.json',liveAll);
    log(`✅ Snapshots:${Object.keys(snaps).length} GWs`);

    // 5. ADAPTIVE WEIGHTS
    log('Computing adaptive weights...');
    const wh={},ck=['ppg','form','xgi','xgc','saves','ict','bonus','goals_scored','assists','clean_sheets','yellow_cards'];
    for(const g of fin){
      if(g<=1)continue;const ps=snaps[g-1],gl=liveAll[g];if(!ps||!gl?.length)continue;
      const lm={};gl.forEach(e=>{lm[e.id]=e.tp;});
      const gw2={};
      ['GK','DEF','MID','FWD'].forEach(pos=>{
        const pc={GK:1,DEF:2,MID:3,FWD:4}[pos];
        const el=Object.entries(ps).filter(([id,s])=>s.pos===pc&&s.mn>=90&&lm[+id]!=null).map(([id,s])=>({...s,ap:lm[+id]}));
        if(el.length<5)return;
        const mp=el.reduce((s,e)=>s+e.ap,0)/el.length,co={};
        ck.forEach(k=>{
          const v=el.map(e=>{
            if(k==='ppg')return e.ppg;if(k==='form')return e.form;
            if(k==='xgi')return e.mn>0?(e.xgi||0)/(e.mn/90):0;
            if(k==='xgc')return e.mn>0?10-(e.xgc||0)/(e.mn/90)*2:5;
            if(k==='saves')return e.mn>0?(e.sv||0)/(e.mn/90):0;
            if(k==='ict')return e.ict||0;if(k==='bonus')return e.mn>0?(e.bn||0)/(e.mn/90):0;
            if(k==='goals_scored')return e.mn>0?(e.gl||0)/(e.mn/90):0;
            if(k==='assists')return e.mn>0?(e.as||0)/(e.mn/90):0;
            if(k==='clean_sheets')return e.mn>0?(e.cs||0)/(e.mn/90):0;
            if(k==='yellow_cards')return e.mn>0?10-(e.yc||0)/(e.mn/90)*5:5;
            return 0;
          });
          const mv=v.reduce((s,x)=>s+x,0)/v.length;let n=0,da=0,db=0;
          for(let i=0;i<el.length;i++){const ds=v[i]-mv,dp=el[i].ap-mp;n+=ds*dp;da+=ds*ds;db+=dp*dp;}
          co[k]=(da>0&&db>0)?Math.max(0,n/Math.sqrt(da*db)):0;
        });
        const tot=Object.values(co).reduce((s,v)=>s+v,0);
        if(tot>0){const w={};ck.forEach(k=>{w[k]=+(co[k]/tot).toFixed(4);});gw2[pos]=w;}
      });
      if(Object.keys(gw2).length)wh[g]=gw2;
    }
    save('weights-history.json',wh);log(`✅ Weights:${Object.keys(wh).length} GWs`);

    // 6. PLAYERS
    const players=bs.elements.filter(p=>p.status==='a'||(p.status==='d'&&(p.chance_of_playing_next_round||0)>=75))
      .map(p=>({id:p.id,Player:p.web_name,Team:(tm[p.team]||{}).short_name||'?',TeamFull:(tm[p.team]||{}).name||'?',
        Position:pm[p.element_type]||'FWD',Price:(p.now_cost||0)/10,status:p.status,minutes:p.minutes||0,
        PPG:+p.points_per_game||0,Form:+p.form||0,TP:+p.total_points||0,EP:+p.ep_next||0,TSB:+p.selected_by_percent||0,
        xGI:+p.expected_goal_involvements||0,xGC:+p.expected_goals_conceded||0,Saves:+p.saves||0,ICT:+p.ict_index||0,YC:+p.yellow_cards||0,
        TIn:+p.transfers_in_event||0,TOut:+p.transfers_out_event||0}));
    res.players=players;res.scoutScoring=players;log(`✅ ${players.length} players`);

    // 7. EPL + FDR
    res.eplTable=buildEPL(fx,bs.teams);res.fdr=buildFDR(fx,bs.teams);

    // 8. LEAGUE
    log('Fetching league data...');
    const mgrs=[];
    for(const lid of CFG.LEAGUE_IDS){
      try{const d=await get(CFG.FPL+`/leagues-classic/${lid}/standings/`);
        (d?.standings?.results||[]).forEach(e=>{if(!mgrs.some(m=>m.entry===e.entry))mgrs.push(e);});}catch(e){log(`⚠ league ${lid}:${e.message}`);}
    }
    log(`▸ ${mgrs.length} managers — fetching history+transfers+picks (parallel)...`);
    const mTasks=mgrs.flatMap(m=>[
      async()=>{const h=await get(CFG.FPL+`/entry/${m.entry}/history/`);return{t:'h',id:m.entry,d:h};},
      async()=>{const t=await get(CFG.FPL+`/entry/${m.entry}/transfers/`);return{t:'t',id:m.entry,d:t};}
    ]);
    const mR=await parallel(mTasks);
    const hMap={},tMap={},chips=[];
    mR.forEach(r=>{if(!r)return;if(r.t==='h'&&r.d){hMap[r.id]=r.d;(r.d.chips||[]).forEach(c=>chips.push({...c,entry_id:r.id}));}
      if(r.t==='t'&&r.d)tMap[r.id]=r.d;});
    const pTasks=mgrs.map(m=>async()=>{const p=await get(CFG.FPL+`/entry/${m.entry}/event/${gw}/picks/`);return{id:m.entry,d:p};});
    const pR=await parallel(pTasks);const pMap={};pR.forEach(r=>{if(r?.d)pMap[r.id]=r.d;});
    const fH=[],fT=[];
    Object.entries(hMap).forEach(([id,h])=>(h.current||[]).forEach(ev=>fH.push({...ev,entry_id:+id})));
    Object.entries(tMap).forEach(([id,a])=>(a||[]).forEach(t=>fT.push({...t,entry_id:+id})));
    save('history.json',fH);save('transfers.json',fT);save('chips.json',chips);save('league-picks.json',pMap);
    res.league={managers:mgrs.map(m=>m.entry_name),standings:mgrs};

    // 9. MY DATA
    try{const[pk,nf]=await Promise.all([get(CFG.FPL+`/entry/${CFG.MY_ENTRY_ID}/event/${gw}/picks/`).catch(()=>null),
      get(CFG.FPL+`/entry/${CFG.MY_ENTRY_ID}/`).catch(()=>null)]);
      if(pk)save('picks.json',pk);if(nf)save('manager.json',nf);}catch{}

    // 10. TRANSFER IMPACT
    try{
      const tr=await get(CFG.FPL+`/entry/${CFG.MY_ENTRY_ID}/transfers/`);
      if(tr?.length){
        const nm={};bs.elements.forEach(p=>{nm[p.id]=p.web_name;});
        const gpMap={};
        [...new Set(tr.flatMap(t=>[t.element_in,t.element_out]))].forEach(id=>{
          if(hist[id]){gpMap[id]={};hist[id].forEach(h=>{gpMap[id][h.round]=h.total_points||0;});}
        });
        const imp=fin.map(g=>{
          const gt=tr.filter(t=>t.event===g);if(!gt.length)return{gw:g,impact:0,transfers:[]};
          let ti=0;const det=gt.map(t=>{
            const ip=gpMap[t.element_in]?.[g]??0,op=gpMap[t.element_out]?.[g]??0,d=ip-op;ti+=d;
            return{playerIn:nm[t.element_in]||'?',playerOut:nm[t.element_out]||'?',inPts:ip,outPts:op,impact:d};
          });
          return{gw:g,impact:ti,transfers:det};
        });
        save('transfer-impact.json',{impactData:imp,totalImpact:imp.reduce((s,d)=>s+d.impact,0),generated:new Date().toISOString()});
      }
    }catch(e){log(`⚠ transfer-impact:${e.message}`);}

    save('all.json',res);
    log(`■ DONE ${players.length} players GW${gw} ${((Date.now()-T)/1000).toFixed(1)}s`);
  }catch(e){log(`❌ FATAL:${e.message}`);console.error(e);process.exit(1);}
}

function buildEPL(fx,teams){
  const tm={},st={};teams.forEach(t=>{tm[t.id]=t;st[t.id]={p:0,w:0,d:0,l:0,gf:0,ga:0,pts:0,form:''};});
  fx.filter(f=>f.finished).sort((a,b)=>a.event-b.event).forEach(f=>{
    const h=st[f.team_h],a=st[f.team_a];if(!h||!a)return;h.p++;a.p++;
    h.gf+=f.team_h_score||0;h.ga+=f.team_a_score||0;a.gf+=f.team_a_score||0;a.ga+=f.team_h_score||0;
    if(f.team_h_score>f.team_a_score){h.w++;h.pts+=3;a.l++;h.form+='W';a.form+='L';}
    else if(f.team_h_score<f.team_a_score){a.w++;a.pts+=3;h.l++;h.form+='L';a.form+='W';}
    else{h.d++;a.d++;h.pts++;a.pts++;h.form+='D';a.form+='D';}
  });
  return Object.entries(st).map(([id,s])=>{const t=tm[+id]||{};return{...s,gd:s.gf-s.ga,form:s.form.slice(-5),club:t.name,short:t.short_name,strength:t.strength};})
    .sort((a,b)=>b.pts-a.pts||b.gd-a.gd||b.gf-a.gf);
}

function buildFDR(fx,teams){
  const tm={};teams.forEach(t=>{tm[t.id]=t;});
  const up=fx.filter(f=>!f.finished_provisional).sort((a,b)=>a.event-b.event);
  const gws=[...new Set(up.map(f=>f.event))].slice(0,8);
  const sD=teams.flatMap(t=>[t.strength_defence_home,t.strength_defence_away]),sA=teams.flatMap(t=>[t.strength_attack_home,t.strength_attack_away]);
  const[nD,xD,nA,xA]=[Math.min(...sD),Math.max(...sD),Math.min(...sA),Math.max(...sA)];
  const fdr=(v,n,x)=>n===x?3:+(1+(v-n)/(x-n)*4).toFixed(1);
  const rows={def:[],atk:[],ovr:[]};
  teams.forEach(t=>{
    const fixes=gws.map(g=>{
      const fs=up.filter(f=>f.event===g&&(f.team_h===t.id||f.team_a===t.id));
      return fs.map(f=>{const h=f.team_h===t.id,o=tm[h?f.team_a:f.team_h];if(!o)return null;
        return{opp:o.short_name,isHome:h,def:fdr(h?o.strength_attack_away:o.strength_attack_home,nD,xD),
          atk:fdr(h?o.strength_defence_away:o.strength_defence_home,nA,xA)};}).filter(Boolean);
    });
    ['def','atk','ovr'].forEach(type=>{
      const v=fixes.flat().map(f=>type==='def'?f.def:type==='atk'?f.atk:+((f.def+f.atk)/2).toFixed(1));
      const avg=v.length?+(v.reduce((s,x)=>s+x,0)/v.length).toFixed(1):3;
      rows[type].push({team:t.short_name,avg,fixes:fixes.map(a=>a.length?a.map(f=>({opp:f.opp,isHome:f.isHome,val:type==='def'?f.def:type==='atk'?f.atk:+((f.def+f.atk)/2).toFixed(1)})):null)});
    });
  });
  Object.keys(rows).forEach(k=>rows[k].sort((a,b)=>a.avg-b.avg));
  return{...rows,gwLabels:gws.map(g=>`GW${g}`)};
}

main();
