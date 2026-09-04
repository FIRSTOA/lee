// 정량목표 요약 텍스트 (봇이 링크 위에 붙일 용도) — type=week|quarter
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwBCwbum3bohh9tlRboZWJo1J1yoAXcOx_PHdmuJcmwMoLG7joTaL4DQIuEp2CP0c0KsQ/exec';
const SUPA_URL = 'https://ilppbxhigxnelbnuxwyt.supabase.co';
const SUPA_KEY = 'sb_publishable_cLR46tr3ITMdCAR7L74ROQ_JEmErvNE';
const HR_URL = 'https://wleudrdfyprxwbpjidke.supabase.co';
const HR_KEY = 'sb_publishable_woLsDr8yxttr_6ToYdq24g_52CRi5fV';
const HR_DEPT_TO_PART = { 'CS_A':'강북A','CS_B':'강서B','CS_C':'강남C','CS_D':'경기D','CS_S':'CSS','운영지원':'CSS','CS':'' };
const DEPT_ORDER = ['강북A','강서B','강남C','경기D','CSS','외부인력'];
const OVERHAUL_WEIGHT = { '1':1,'2':2,'3':3,'4':4,'5':5 };

function overhaulWeight(품목){ const m=/오버홀\s*([1-5])/.exec(품목||''); return m?OVERHAUL_WEIGHT[m[1]]:0; }

function processRows(allRows){
  let hi=-1;
  for(let i=0;i<Math.min(10,allRows.length);i++){ const row=(allRows[i]||[]).map(c=>(c==null?'':String(c)).trim()); if(row.includes('담당자')&&row.includes('부서명')){hi=i;break;} }
  if(hi<0) return [];
  const headers=(allRows[hi]||[]).map(h=>(h==null?'':String(h)).trim());
  const iDate=headers.indexOf('날짜');
  const out=[];
  for(let i=hi+1;i<allRows.length;i++){
    const cols=allRows[i]; if(!cols) continue;
    const dateCol=(cols[iDate]==null?'':String(cols[iDate])).trim();
    if(!/^\d{2,4}[\/\-]\d{1,2}[\/\-]\d{1,2}/.test(dateCol)) continue;
    const r={}; for(let j=0;j<headers.length;j++) r[headers[j]]=(cols[j]==null?'':String(cols[j])).trim();
    if(r.부서명==='퇴사자' || r.부서명==='교육생') continue;
    const dm=/^(\d{2,4})[\/\-](\d{1,2})[\/\-](\d{1,2})/.exec(dateCol);
    if(!dm) continue;
    let y=parseInt(dm[1]); if(y<100) y+=2000;
    r._y=y; r._m=parseInt(dm[2]);
    // 주차 = 달력 기준(일요일 시작, 1일이 속한 주가 1주차) — 스프레드시트 '주차별' 열과 동일 규칙
    const _fd=new Date(y, parseInt(dm[2])-1, 1).getDay();
    r._wk=parseInt(dm[2])+'월'+Math.ceil((parseInt(dm[3])+_fd)/7)+'주차';
    r._ov=/^오버홀/.test((r.오버홀품목||'').replace(/\s+/g,''));
    r.오버홀품목=(r.오버홀품목||'').replace(/\s+/g,'');
    out.push(r);
  }
  return out;
}

async function jget(url, headers){ const r=await fetch(url,{headers}); return r.ok ? r.json() : null; }

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin','*');
  const type = (req.query && req.query.type) === 'quarter' ? 'quarter' : 'week';
  try {
    const hh = { apikey: HR_KEY, Authorization: 'Bearer '+HR_KEY };
    // 시트 조회는 간헐적으로 실패한다(구글이 오류 페이지를 돌려줌).
    // 실패한 걸 빈 데이터로 넘기면 '전체 0%' 짜리 가짜 보고서가 만들어지므로 3회까지 재시도한다.
    const fetchDash = async () => {
      for (let i = 0; i < 3; i++) {
        try {
          const r = await fetch(APPS_SCRIPT_URL,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action:'dashboardData'})});
          const j = await r.json();
          if (j && Array.isArray(j.rows) && j.rows.length) return j;
        } catch (e) { /* 다음 시도 */ }
        if (i < 2) await new Promise(rs => setTimeout(rs, 900 * (i + 1)));
      }
      return null;
    };
    const [dash, qcRows, hrRows, resignRows] = await Promise.all([
      fetchDash(),
      jget(SUPA_URL+'/rest/v1/app_config?key=eq.overhaul_quota&select=value',{apikey:SUPA_KEY,Authorization:'Bearer '+SUPA_KEY}).catch(()=>null),
      jget(HR_URL+'/rest/v1/active_employees?select=name,department&department=in.(CS,CS_A,CS_B,CS_C,CS_D,CS_S,운영지원)',hh).catch(()=>[]),
      jget(HR_URL+'/rest/v1/employees?select=name&status=eq.퇴사',hh).catch(()=>[])
    ]);
    const rows = processRows((dash&&dash.rows)||[]);
    // 데이터를 못 받았으면 보고서를 만들지 않는다 (잘못된 0% 보고 방지)
    if (!rows.length) {
      res.setHeader('Cache-Control','no-store');   // 실패 응답이 캐시에 박히지 않게
      res.setHeader('Content-Type','text/plain; charset=utf-8');
      res.status(200).send('⚠️ 작업 데이터를 가져오지 못했습니다. 잠시 후 다시 시도해주세요.');
      return;
    }
    const quotaConfig = (qcRows&&qcRows[0]&&qcRows[0].value) ? qcRows[0].value : {default:3,persons:{},excluded:[]};
    if(!quotaConfig.persons) quotaConfig.persons={}; if(!quotaConfig.excluded) quotaConfig.excluded=[];
    const hrRoster = (hrRows||[]).map(r=>({name:r.name, dept:(HR_DEPT_TO_PART[r.department]!==undefined?HR_DEPT_TO_PART[r.department]:'')}));
    const resigned = new Set((resignRows||[]).map(x=>x.name));
    const excluded = new Set(quotaConfig.excluded||[]);
    const quotaOf = (p)=>{ const c=quotaConfig.persons[p]; if(c==null) return quotaConfig.default; if(typeof c==='number') return c; return (c.target!=null?c.target:quotaConfig.default); };
    const effQ = (person, ymv) => { const p=quotaConfig.persons[person]; if(p==null) return quotaConfig.default; if(typeof p==='number') return p; const base=(p.target!=null?p.target:quotaConfig.default); const hist=Array.isArray(p.hist)?p.hist.filter(h=>h&&h.from&&h.q!=null).slice().sort((a,b)=>String(a.from).localeCompare(String(b.from))):[]; if(!hist.length||!ymv) return base; let val=null; for(let i=0;i<hist.length;i++){ if(String(hist[i].from)<=ymv) val=hist[i].q; } return val!=null?val:hist[0].q; };

    // KST 기준 현재 년/월
    const kst = new Date(Date.now() + 9*3600*1000);
    const curY = kst.getUTCFullYear(), curM = kst.getUTCMonth()+1, curD = kst.getUTCDate();
    // ym=YYYY-MM 지정 시 그 달로 (과거 주간/월 보고 재발송용)
    let tgtY = curY, tgtM = curM; const ym = req.query && req.query.ym;
    if (ym) { const mm = /^(\d{4})-(\d{1,2})$/.exec(String(ym)); if (mm) { tgtY = +mm[1]; tgtM = +mm[2]; } }

    let periodRows, label;
    if(type==='quarter'){
      const qs = Math.floor((tgtM-1)/3)*3+1; const months=[qs,qs+1,qs+2];
      periodRows = rows.filter(r=>r._ov && r._y===tgtY && months.includes(r._m));
      label = tgtY+'년 '+(Math.floor((tgtM-1)/3)+1)+'분기('+qs+'~'+(qs+2)+'월)';
    } else {
      periodRows = rows.filter(r=>r._ov && r._y===tgtY && r._m===tgtM);
      label = ym ? (tgtM+'월 주간(월누계)') : (curM+'/'+curD+' 주간');
    }
    const targetWeeks = new Set(periodRows.map(r=>r._wk)).size || 1;

    // (담당자 x 기록부서) 집계
    const units = {};
    periodRows.forEach(r=>{
      if(!r.담당자 || excluded.has(r.담당자) || resigned.has(r.담당자)) return;
      const dept=r.부서명||'(미지정)'; const k=r.담당자+'|'+dept;
      if(!units[k]) units[k]={person:r.담당자,dept,total:0};
      units[k].total += overhaulWeight(r.오버홀품목);
    });
    const settingsDept={}; hrRoster.forEach(p=>{ if(p.dept) settingsDept[p.name]=p.dept; });
    Object.keys(quotaConfig.persons).forEach(nm=>{ const c=quotaConfig.persons[nm]; if(c&&typeof c==='object'&&c.dept) settingsDept[nm]=c.dept; });
    const hasRec=new Set(Object.values(units).map(u=>u.person));
    [...new Set([...Object.keys(quotaConfig.persons),...hrRoster.map(p=>p.name)])].forEach(nm=>{
      if(excluded.has(nm)||resigned.has(nm)||hasRec.has(nm)) return;
      const dept=settingsDept[nm]||'(미지정)'; const k=nm+'|'+dept;
      if(!units[k]) units[k]={person:nm,dept,total:0};
    });

    // 효력 시작월: 각 주차의 월에 맞는 유효 목표 합산
    const wkMonths={}; periodRows.forEach(r=>{ if(r._wk && !wkMonths[r._wk]) wkMonths[r._wk]=tgtY+'-'+String(r._m).padStart(2,'0'); });
    const allWeeks=Object.keys(wkMonths); const dfltYM=tgtY+'-'+String(tgtM).padStart(2,'0');
    const targetOf=(person)=> allWeeks.length ? allWeeks.reduce((s,w)=>s+effQ(person,wkMonths[w]),0) : (effQ(person,dfltYM)*targetWeeks);
    const dTot={};
    Object.values(units).forEach(u=>{ if(!dTot[u.dept]) dTot[u.dept]={total:0,target:0}; dTot[u.dept].total+=u.total; dTot[u.dept].target+=targetOf(u.person); });
    let tT=0,tA=0; Object.values(dTot).forEach(t=>{tT+=t.target;tA+=t.total;});
    const overall = tT>0 ? Math.round(tA/tT*100) : (tA>0?100+tA:0);
    let mvp=null; Object.values(units).forEach(u=>{ if(u.total>0&&(!mvp||u.total>mvp.total)) mvp={person:u.person,total:u.total}; });

    const order = [...DEPT_ORDER, ...Object.keys(dTot).filter(d=>!DEPT_ORDER.includes(d))];
    let lines = [];
    order.forEach(d=>{ if(!dTot[d]) return; const t=dTot[d]; const pct=t.target>0?Math.round(t.total/t.target*100):(t.total>0?100+t.total:0); lines.push('• '+d+'  '+t.total+'/'+t.target+'  '+pct+'%'); });

    const head = (type==='quarter'?'📈':'📊')+' '+label+' 정량목표 달성  전체 '+overall+'% ('+tA+'/'+tT+')';
    const mvpLine = mvp ? '🏅 '+(type==='quarter'?'분기':'이주의')+' MVP: '+mvp.person+' ('+mvp.total+')' : '';
    let text = [head, '────────────', ...lines, mvpLine].filter(Boolean).join('\n');

    // === 미달성 인원 안내 (주간만) ===
    // 목표가 1 이상인데 실적이 목표에 못 미친 사람만. 원인은 쓰지 않는다(추측 금지).
    // 해당자가 없으면 이 블록 전체를 표시하지 않는다.
    if (type !== 'quarter') {
      const byPerson = {};
      Object.values(units).forEach(u=>{
        if (!byPerson[u.person]) byPerson[u.person] = 0;
        byPerson[u.person] += u.total;
      });
      const under = [];
      Object.keys(byPerson).forEach(nm=>{
        const tot = byPerson[nm];
        const goal = targetOf(nm);
        if (!(goal > 0) || tot >= goal) return;
        under.push({ name: nm, total: tot, goal: goal, pct: Math.round(tot / goal * 100) });
      });
      under.sort((a,b)=> (a.pct - b.pct) || String(a.name).localeCompare(String(b.name), 'ko'));
      if (under.length) {
        text += '\n\n⚠️ 미달성 인원';
        under.forEach(u=>{ text += '\n' + u.name + ' ' + u.total + '/' + u.goal + ' ' + u.pct + '%'; });
        text += '\n\n📋 AAR 보고 요청';
        text += '\n\n위 미달성 인원에 대해서는 해당 팀장 또는 파트장이 미달성 원인을 파악한 후 AAR 방식으로 간단히 보고해 주세요.';
      }
    }

    res.setHeader('Cache-Control','s-maxage=300, stale-while-revalidate=900');
    res.setHeader('Content-Type','text/plain; charset=utf-8');
    res.status(200).send(text);
  } catch (e) {
    res.setHeader('Content-Type','text/plain; charset=utf-8');
    res.status(200).send('요약 생성 오류: '+String(e));
  }
};
