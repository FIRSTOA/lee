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
    if(r.부서명==='퇴사자') continue;
    const dm=/^(\d{2,4})[\/\-](\d{1,2})[\/\-](\d{1,2})/.exec(dateCol);
    if(!dm) continue;
    let y=parseInt(dm[1]); if(y<100) y+=2000;
    r._y=y; r._m=parseInt(dm[2]);
    r._wk=parseInt(dm[2])+'월'+Math.ceil(parseInt(dm[3])/7)+'주차';
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
    const [dash, qcRows, hrRows, resignRows] = await Promise.all([
      fetch(APPS_SCRIPT_URL,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action:'dashboardData'})}).then(r=>r.json()).catch(()=>({rows:[]})),
      jget(SUPA_URL+'/rest/v1/app_config?key=eq.overhaul_quota&select=value',{apikey:SUPA_KEY,Authorization:'Bearer '+SUPA_KEY}).catch(()=>null),
      jget(HR_URL+'/rest/v1/active_employees?select=name,department&department=in.(CS,CS_A,CS_B,CS_C,CS_D,CS_S,운영지원)',hh).catch(()=>[]),
      jget(HR_URL+'/rest/v1/employees?select=name&status=eq.퇴사',hh).catch(()=>[])
    ]);
    const rows = processRows((dash&&dash.rows)||[]);
    const quotaConfig = (qcRows&&qcRows[0]&&qcRows[0].value) ? qcRows[0].value : {default:3,persons:{},excluded:[]};
    if(!quotaConfig.persons) quotaConfig.persons={}; if(!quotaConfig.excluded) quotaConfig.excluded=[];
    const hrRoster = (hrRows||[]).map(r=>({name:r.name, dept:(HR_DEPT_TO_PART[r.department]!==undefined?HR_DEPT_TO_PART[r.department]:'')}));
    const resigned = new Set((resignRows||[]).map(x=>x.name));
    const excluded = new Set(quotaConfig.excluded||[]);
    const quotaOf = (p)=>{ const c=quotaConfig.persons[p]; if(c==null) return quotaConfig.default; if(typeof c==='number') return c; return (c.target!=null?c.target:quotaConfig.default); };

    // KST 기준 현재 년/월
    const kst = new Date(Date.now() + 9*3600*1000);
    const curY = kst.getUTCFullYear(), curM = kst.getUTCMonth()+1, curD = kst.getUTCDate();

    let periodRows, label;
    if(type==='quarter'){
      const qs = Math.floor((curM-1)/3)*3+1; const months=[qs,qs+1,qs+2];
      periodRows = rows.filter(r=>r._ov && r._y===curY && months.includes(r._m));
      label = curY+'년 '+(Math.floor((curM-1)/3)+1)+'분기('+qs+'~'+(qs+2)+'월)';
    } else {
      periodRows = rows.filter(r=>r._ov && r._y===curY && r._m===curM);
      label = curM+'/'+curD+' 주간';
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

    const dTot={};
    Object.values(units).forEach(u=>{ if(!dTot[u.dept]) dTot[u.dept]={total:0,target:0}; dTot[u.dept].total+=u.total; dTot[u.dept].target+=quotaOf(u.person)*targetWeeks; });
    let tT=0,tA=0; Object.values(dTot).forEach(t=>{tT+=t.target;tA+=t.total;});
    const overall = tT>0 ? Math.round(tA/tT*100) : (tA>0?100+tA:0);
    let mvp=null; Object.values(units).forEach(u=>{ if(u.total>0&&(!mvp||u.total>mvp.total)) mvp={person:u.person,total:u.total}; });

    const order = [...DEPT_ORDER, ...Object.keys(dTot).filter(d=>!DEPT_ORDER.includes(d))];
    let lines = [];
    order.forEach(d=>{ if(!dTot[d]) return; const t=dTot[d]; const pct=t.target>0?Math.round(t.total/t.target*100):(t.total>0?100+t.total:0); lines.push('• '+d+'  '+t.total+'/'+t.target+'  '+pct+'%'); });

    const head = (type==='quarter'?'📈':'📊')+' '+label+' 정량목표 달성  전체 '+overall+'% ('+tA+'/'+tT+')';
    const mvpLine = mvp ? '🏅 '+(type==='quarter'?'분기':'이주의')+' MVP: '+mvp.person+' ('+mvp.total+')' : '';
    const text = [head, '────────────', ...lines, mvpLine].filter(Boolean).join('\n');

    res.setHeader('Cache-Control','s-maxage=300, stale-while-revalidate=900');
    res.setHeader('Content-Type','text/plain; charset=utf-8');
    res.status(200).send(text);
  } catch (e) {
    res.setHeader('Content-Type','text/plain; charset=utf-8');
    res.status(200).send('요약 생성 오류: '+String(e));
  }
};
