// 정량목표 요약 텍스트 (봇이 링크 위에 붙일 용도) — type=week|quarter
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwBCwbum3bohh9tlRboZWJo1J1yoAXcOx_PHdmuJcmwMoLG7joTaL4DQIuEp2CP0c0KsQ/exec';
const SUPA_URL = 'https://ilppbxhigxnelbnuxwyt.supabase.co';
const SUPA_KEY = 'sb_publishable_cLR46tr3ITMdCAR7L74ROQ_JEmErvNE';
// 인사DB — 2026-10 그룹웨어 통합본. 구 'HR information'(wleudrdfy…)은 2026-07-30 갱신 중단
const HR_URL = 'https://okwhgofnketyqfoaylkx.supabase.co';
const HR_KEY = 'sb_publishable_UkhjLRJ7bLBemr2wHjZTzw_iQVJrc5z';
const HR_TABLE = 'directory_employees';
// 파트 구분이 department 단일값 → department + region 으로 바뀜. 부서명(강북A 등)은 그대로 둔다.
function hrPartOf(dept, region) {
  const r = String(region || '');
  if (/수도권A$/.test(r)) return '강북A';
  if (/수도권B$/.test(r)) return '강서B';
  if (/수도권C$/.test(r)) return '강남C';
  if (/수도권D$/.test(r)) return '경기D';
  if (/수도권E$/.test(r)) return 'CSS';
  if (dept === 'CSS') return 'CSS';
  if (dept === '운영지원') return 'CSS';
  return '';   // 수도권BCD(여러 파트 총괄) 등 → 통계 대상 제외
}
const DEPT_ORDER = ['강북A','강서B','강남C','경기D','CSS','외부인력'];
const REPORT_BASE = 'https://lee-zeta-one.vercel.app';
// 실적 환산 가중치 (2026-10-08 확정) — 오버홀 포인트 + 수리 포인트 합산
//   오버홀1~5=1~5 · 오버홀C=1 · 기기폐기=1 · 부품정리=0
//   수리1=0 · 수리2=1 · 수리3=2 · 수리4=4 · 수리5=5 · 수리B=3 · 부품제조=1 · 재수리=1
const OVERHAUL_WEIGHT = { '1':1,'2':2,'3':3,'4':4,'5':5 };
const REPAIR_WEIGHT   = { '1':0,'2':1,'3':2,'4':4,'5':5 };
function ohPart(s){
  const t=String(s||'').replace(/\s+/g,'');
  const m=/^오버홀([1-5])/.exec(t);
  if(m) return OVERHAUL_WEIGHT[m[1]];
  if(/^오버홀C/.test(t)) return 1;
  if(/^기기폐기/.test(t)) return 1;
  return 0;
}
function rpPart(s){
  const t=String(s||'').replace(/\s+/g,'');
  const m=/^수리([1-5])/.exec(t);
  if(m) return REPAIR_WEIGHT[m[1]];
  if(/^수리B/.test(t)) return 3;
  if(/^부품제조/.test(t)) return 1;
  if(/^재수리/.test(t)) return 1;
  return 0;
}

function overhaulWeight(r){ return ohPart(r && r.오버홀품목) + rpPart(r && r.수리품목); }
// 2026-11-06 확정 — 포인트를 없애고 '목표 대수'에 직접 반영한다.
// 레벨이 올라갈수록 작업 시간이 길어지는 만큼만 대수로 쳐준다(종전 1~5 포인트는 너무 컸다).
//   오버홀1·2·3 = 1대 · 오버홀4 = 2대 · 오버홀5 = 3대 · 오버홀C = 1대 · 기기폐기 = 1대 · 부품정리 = 0
//   수리1 = 0 · 수리2·3 = 1대 · 수리4 = 2대 · 수리5 = 3대 · 수리B = 1대
//   부품제조·재수리 = 0 — 기기 작업이 아니라서 목표 대수에 넣지 않는다
// 한 행에 오버홀과 수리가 같이 적혀 있으면 둘 다 더한다.
const OH_UNIT = { '1':1, '2':1, '3':1, '4':2, '5':3 };
const RP_UNIT = { '1':0, '2':1, '3':1, '4':2, '5':3 };
function ohUnit(r){
  const t=String((r && r.오버홀품목)||'').replace(/\s+/g,'');
  const m=/^오버홀([1-5])/.exec(t);
  if(m) return OH_UNIT[m[1]];
  if(/^오버홀C/.test(t)) return 1;
  if(/^기기폐기/.test(t)) return 1;
  return 0;
}
function rpUnit(r){
  const t=String((r && r.수리품목)||'').replace(/\s+/g,'');
  const m=/^수리([1-5])/.exec(t);
  if(m) return RP_UNIT[m[1]];
  if(/^수리B/.test(t)) return 1;
  return 0;
}

// 2026-11-06 기준 변경 — 목표를 '주차 수'가 아니라 '평일 수'로 잰다.
// '주 N대'는 평일 5일에 N대라는 뜻인데, 달력 주차를 그냥 세면 금·토 이틀뿐인
// 조각 주에도 N대가 통째로 붙었다 (2026년 5월: 6주 12대 → 평일로는 8대).
// 달 경계는 한 주가 양쪽 달에서 각각 1주로 세어져 목표가 두 배가 됐다.
//   11/29~12/5 한 주 → 종전 11월 2대 + 12월 2대 = 4대 / 변경 후 0.2+0.8 = 정확히 1주분
// 진행 중인 달은 오늘까지 지난 평일만 센다. 아니면 월초마다 달성률이 폭락한다.
function kstToday(){ const k=new Date(Date.now()+9*3600*1000); return {y:k.getUTCFullYear(),m:k.getUTCMonth()+1,d:k.getUTCDate()}; }
function weekdaysInWeek(year,month,weekNo){
  const fd=new Date(year,month-1,1).getDay();        // 그 달 1일의 요일 (일=0)
  const last=new Date(year,month,0).getDate();
  let from=(weekNo-1)*7-fd+1, to=weekNo*7-fd;
  if(from<1) from=1;
  if(to>last) to=last;
  const t=kstToday();
  if(year===t.y && month===t.m && to>t.d) to=t.d;    // 아직 안 지난 날은 목표에 넣지 않는다
  let n=0;
  for(let d=from; d<=to; d++){ const w=new Date(year,month-1,d).getDay(); if(w>=1&&w<=5) n++; }
  return n;
}
// '11월3주차' → 그 주의 목표 배수 (1.0 = 평일 5일이 꽉 찬 주)
function wkFactor(year,label){
  const m=/(\d+)월(\d+)주차/.exec(String(label));
  if(!m) return 1;
  return weekdaysInWeek(year, parseInt(m[1],10), parseInt(m[2],10)) / 5;
}
// 엄재현 주간/야간 분리(2026-09-09) 이전 기록은 담당자가 '엄재현'(부서 외부인력)으로 남아 있다.
// 주간은 CSS 이므로 '엄재현 + 외부인력'은 야간뿐이다. 시트 원본은 그대로, 집계할 때만 야간으로 읽는다.
function normPerson(name, dept){
  if(String(name||'').trim()==='엄재현' && String(dept||'').trim()==='외부인력') return '엄재현(야간)';
  return name;
}

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
    r._d=y+'-'+String(parseInt(dm[2])).padStart(2,'0')+'-'+String(parseInt(dm[3])).padStart(2,'0');   // 중간 점검용 일자
    // 주차 = 달력 기준(일요일 시작, 1일이 속한 주가 1주차) — 스프레드시트 '주차별' 열과 동일 규칙
    const _fd=new Date(y, parseInt(dm[2])-1, 1).getDay();
    r._wk=parseInt(dm[2])+'월'+Math.ceil((parseInt(dm[3])+_fd)/7)+'주차';
    r._ov=overhaulWeight(r)>0;   // 포인트가 붙는 작업은 모두 집계 (부품제조·수리 등급 포함)
    r.오버홀품목=(r.오버홀품목||'').replace(/\s+/g,'');
    out.push(r);
  }
  return out;
}

async function jget(url, headers){ const r=await fetch(url,{headers}); return r.ok ? r.json() : null; }

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin','*');
  const _tq = (req.query && req.query.type) || 'week';
  const type = (_tq === 'quarter' || _tq === 'midweek') ? _tq : 'week';
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
      jget(HR_URL+'/rest/v1/'+HR_TABLE+'?select=name,department,region&status=eq.재직&department=in.(CS,CSS,운영지원)',hh).catch(()=>[]),
      jget(HR_URL+'/rest/v1/'+HR_TABLE+'?select=name&status=neq.재직',hh).catch(()=>[])
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
    // 파트가 안 잡히는 인원(수도권BCD 총괄 등)은 통계 대상에서 제외
    const hrRoster = (hrRows||[]).map(r=>({name:r.name, dept:hrPartOf(r.department, r.region)})).filter(p=>p.dept);
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
    // asof=M/D — 제목에 찍히는 날짜만 바꾼다(집계 범위는 그대로).
    // 금요일 보고를 토·일에 뒤늦게 만들 때 '10/17 주간'이 아니라 '10/16 주간'으로 나가게 하려는 용도.
    const asof = (req.query && req.query.asof && /^\d{1,2}\/\d{1,2}$/.test(String(req.query.asof))) ? String(req.query.asof) : '';

    // === 중간 점검 (주 중간) ===
    // 금요일 주간보고와 별개. '이번 주 월요일 ~ 오늘' 실적만 보고,
    // 경과 근무일 비례 목표(월1/5 … 금5/5)에 못 미치는 인원만 추린다.
    if (type === 'midweek') {
      const dowK = kst.getUTCDay();                       // 0=일 … 6=토
      const backToMon = (dowK === 0) ? 6 : (dowK - 1);
      const mon = new Date(kst.getTime()); mon.setUTCDate(mon.getUTCDate() - backToMon);
      const ds = (d) => d.getUTCFullYear()+'-'+String(d.getUTCMonth()+1).padStart(2,'0')+'-'+String(d.getUTCDate()).padStart(2,'0');
      const from = ds(mon), to = ds(kst);
      const elapsed = Math.min(5, backToMon + 1);         // 경과 근무일 (월=1 … 금=5)
      const ratio = elapsed / 5;

      const got = {}, gotRp = {};
      rows.forEach(r=>{
        if(!r._ov || !r._d || r._d < from || r._d > to) return;
        const p = normPerson(r.담당자, r.부서명); if(!p) return;
        got[p]   = (got[p]||0)   + ohUnit(r) + rpUnit(r);   // 달성률 분자 = 오버홀 대수 + 수리 대수
        gotRp[p] = (gotRp[p]||0) + rpUnit(r);
      });

      const ymv = tgtY + '-' + String(tgtM).padStart(2,'0');
      const sDept = {}; hrRoster.forEach(p=>{ if(p.dept) sDept[p.name]=p.dept; });
      Object.keys(quotaConfig.persons).forEach(nm=>{ const c=quotaConfig.persons[nm]; if(c&&typeof c==='object'&&c.dept) sDept[nm]=c.dept; });

      const behind = [];
      Object.keys(quotaConfig.persons).forEach(nm=>{
        if (excluded.has(nm) || resigned.has(nm)) return;
        const goal = effQ(nm, ymv);
        if (!(goal > 0)) return;                          // 목표 없는 인원은 대상 아님
        const cur = got[nm] || 0;
        if (cur >= goal * ratio) return;                  // 페이스 유지 중
        behind.push({ name: nm, dept: sDept[nm] || '(미지정)', cur: cur, goal: goal, rp: gotRp[nm] || 0, left: Math.max(0, goal - cur) });
      });

      const mdL = (kst.getUTCMonth()+1)+'/'+kst.getUTCDate();
      const dnm = ['일','월','화','수','목','금','토'][dowK];
      res.setHeader('Cache-Control','no-store');          // 중간 점검은 캐시하지 않는다
      res.setHeader('Content-Type','text/plain; charset=utf-8');
      if (!behind.length) {
        res.status(200).send('✅ '+mdL+'('+dnm+') 중간 점검 — 전원 주간 오버홀 목표 페이스를 유지하고 있습니다.');
        return;
      }
      const byDept = {};
      behind.forEach(b=>{ (byDept[b.dept] = byDept[b.dept] || []).push(b); });
      const ord = [...DEPT_ORDER, ...Object.keys(byDept).filter(d=>!DEPT_ORDER.includes(d))];
      let mt = '⏰ '+mdL+'('+dnm+') 중간 점검 — 금요일까지 '+Math.max(0, 5-elapsed)+'일\n\n이대로면 금요일 오버홀 목표 미달이 예상됩니다.';
      ord.forEach(d=>{
        const arr = byDept[d]; if(!arr || !arr.length) return;
        let sum = 0; arr.forEach(b=>{ sum += b.left; });
        arr.sort((a,b)=> (b.left-a.left) || String(a.name).localeCompare(String(b.name),'ko'));
        mt += '\n\n['+d+'] 오버홀 '+sum+'대 더 필요';
        arr.forEach(b=>{
          mt += '\n· '+b.name+'  '+b.cur+'/'+b.goal+'대'
             + (b.cur===0 ? '   ← 이번 주 0대' : '')
             + (b.rp ? '   (수리 '+b.rp+'대 포함)' : '');
        });
      });
      mt += '\n\n나머지 인원은 주간 오버홀 목표 페이스를 지키고 있습니다.';
      mt += '\n※ 수리·부품제조는 달성률에 들어가지 않습니다. 목표는 오버홀 대수입니다.';
      mt += '\n📋 상세: '+REPORT_BASE+'/report.html?type=week';
      res.status(200).send(mt);
      return;
    }

    let periodRows, label;
    if(type==='quarter'){
      const qs = Math.floor((tgtM-1)/3)*3+1; const months=[qs,qs+1,qs+2];
      periodRows = rows.filter(r=>r._ov && r._y===tgtY && months.includes(r._m));
      label = tgtY+'년 '+(Math.floor((tgtM-1)/3)+1)+'분기('+qs+'~'+(qs+2)+'월)';
    } else {
      periodRows = rows.filter(r=>r._ov && r._y===tgtY && r._m===tgtM);
      label = ym ? (tgtM+'월 주간(월누계)') : ((asof || (curM+'/'+curD))+' 주간');
    }
    const targetWeeks = new Set(periodRows.map(r=>r._wk)).size || 1;

    // (담당자 x 기록부서) 집계
    const units = {};
    periodRows.forEach(r=>{
      if(!r.담당자) return;
      const person=normPerson(r.담당자,r.부서명);
      if(excluded.has(person) || resigned.has(person)) return;
      const dept=r.부서명||'(미지정)'; const k=person+'|'+dept;
      if(!units[k]) units[k]={person:person,dept,total:0,oh:0,rp:0,ohpt:0,ohcnt:0};
      const ou=ohUnit(r), ru=rpUnit(r), lv=ohPart(r.오버홀품목);
      units[k].total += ou + ru;                // 달성률 분자 = 오버홀 대수 + 수리 대수
      units[k].oh    += ou;
      units[k].rp    += ru;
      if(lv>0){ units[k].ohpt += lv; units[k].ohcnt++; }   // 평균 등급 = 난이도합 ÷ 오버홀 건수
    });
    const settingsDept={}; hrRoster.forEach(p=>{ if(p.dept) settingsDept[p.name]=p.dept; });
    Object.keys(quotaConfig.persons).forEach(nm=>{ const c=quotaConfig.persons[nm]; if(c&&typeof c==='object'&&c.dept) settingsDept[nm]=c.dept; });
    const hasRec=new Set(Object.values(units).map(u=>u.person));
    [...new Set([...Object.keys(quotaConfig.persons),...hrRoster.map(p=>p.name)])].forEach(nm=>{
      if(excluded.has(nm)||resigned.has(nm)||hasRec.has(nm)) return;
      const dept=settingsDept[nm]||'(미지정)'; const k=nm+'|'+dept;
      if(!units[k]) units[k]={person:nm,dept,total:0,oh:0,rp:0,ohpt:0,ohcnt:0};
    });

    // 효력 시작월: 각 주차의 월에 맞는 유효 목표 합산
    const wkMonths={}; periodRows.forEach(r=>{ if(r._wk && !wkMonths[r._wk]) wkMonths[r._wk]=tgtY+'-'+String(r._m).padStart(2,'0'); });
    const allWeeks=Object.keys(wkMonths); const dfltYM=tgtY+'-'+String(tgtM).padStart(2,'0');
    // 주차 수가 아니라 '그 주가 그 달에 가진 평일 수 ÷ 5' 를 곱해서 더한다.
    // 사람마다 한 번만 반올림해 목표를 정수로 둔다(화면에 0.4대 같은 숫자가 안 나오게).
    const targetOf=(person)=> allWeeks.length
      ? Math.round(allWeeks.reduce((s,w)=>s+effQ(person,wkMonths[w])*wkFactor(tgtY,w),0))
      : Math.round(effQ(person,dfltYM)*targetWeeks);
    const dTot={};
    Object.values(units).forEach(u=>{
      if(!dTot[u.dept]) dTot[u.dept]={total:0,target:0,oh:0,rp:0,ohpt:0,ohcnt:0};
      dTot[u.dept].total+=u.total; dTot[u.dept].target+=targetOf(u.person);
      dTot[u.dept].oh+=u.oh; dTot[u.dept].rp+=u.rp;
      dTot[u.dept].ohpt+=u.ohpt; dTot[u.dept].ohcnt+=u.ohcnt;
    });
    let tT=0,tA=0; Object.values(dTot).forEach(t=>{tT+=t.target;tA+=t.total;});
    const overall = tT>0 ? Math.round(tA/tT*100) : (tA>0?100+tA:0);
    // MVP도 오버홀 대수 기준. 대수가 같으면 난이도(포인트)가 높은 쪽
    let mvp=null; Object.values(units).forEach(u=>{ if(u.total>0&&(!mvp||u.total>mvp.total||(u.total===mvp.total&&u.ohpt>mvp.ohpt))) mvp={person:u.person,total:u.total,ohpt:u.ohpt}; });

    const order = [...DEPT_ORDER, ...Object.keys(dTot).filter(d=>!DEPT_ORDER.includes(d))];
    let lines = [];
    order.forEach(d=>{
      if(!dTot[d]) return; const t=dTot[d];
      const pct=t.target>0?Math.round(t.total/t.target*100):(t.total>0?100+t.total:0);
      // 대수를 오버홀/수리로 쪼개 보여주고, 난이도는 오버홀 평균 등급으로 따로 본다.
      const side = t.target>0 ? '   (오버홀 '+t.oh+'대 · 수리 '+t.rp+'대'+(t.ohcnt>0?' · 평균 '+(t.ohpt/t.ohcnt).toFixed(1)+'등급':'')+')' : '';
      lines.push('• '+d+'  '+t.total+'/'+t.target+'대  '+pct+'%'+side);
    });

    // 🗑 폐기 · 🔩 리페어 — 2026-11-13 추가.
    // report.html 은 2026-11-10 부터 이 둘을 따로 보여주는데, 카톡으로 가는 이 글에만 빠져 있었다
    // (이번 주 폐기 44대·리페어 54개가 한 글자도 안 보였다). 집계 기준을 report.html 과 똑같이 맞춘다
    // — 주간은 '기록이 있는 가장 최근 주차'만, 분기는 기간 전체. periodRows 는 포인트 붙는 작업만
    // 걸러진 것이라 여기서는 rows 에서 직접 센다.
    const wkNo = (w)=>{ const m=/(\d+)월(\d+)주차/.exec(String(w||'')); return m ? (+m[1])*100+(+m[2]) : 0; };
    const wkSeen = [...new Set(periodRows.map(r=>r._wk).filter(Boolean))].sort((a,b)=>wkNo(a)-wkNo(b));
    const wkThis = wkSeen.length ? wkSeen[wkSeen.length-1] : '';
    const inScope = (r)=> type==='quarter'
      ? (r._y===tgtY && Math.floor((r._m-1)/3)===Math.floor((tgtM-1)/3))
      : (r._y===tgtY && r._m===tgtM && r._wk===wkThis);
    const dpCnt = rows.filter(r=>inScope(r) && String(r.오버홀품목||'')==='기기폐기').length;
    const rpCnt = rows.filter(r=>inScope(r) && String(r.수리품목||'').replace(/\s+/g,'')==='부품제조').length;
    const exLine = [ dpCnt?('🗑 폐기 '+dpCnt+'대'):'', rpCnt?('🔩 리페어 '+rpCnt+'개'):'' ].filter(Boolean).join(' · ');

    const head = (type==='quarter'?'📈':'📊')+' '+label+' 오버홀 목표 달성  전체 '+overall+'% ('+tA+'/'+tT+'대)';
    const mvpLine = mvp ? '🏅 '+(type==='quarter'?'분기':'이주의')+' MVP: '+mvp.person+' ('+mvp.total+'대)' : '';
    let text = [head, exLine, '────────────', ...lines, mvpLine].filter(Boolean).join('\n');

    // === 미달성 인원 안내 (주간만) ===
    // 목표가 1 이상인데 실적이 목표에 못 미친 사람만. 원인은 쓰지 않는다(추측 금지).
    // 해당자가 없으면 이 블록 전체를 표시하지 않는다.
    if (type !== 'quarter') {
      const byPerson = {};
      Object.values(units).forEach(u=>{
        if (!byPerson[u.person]) byPerson[u.person] = { oh:0, rp:0, ohpt:0, ohcnt:0 };
        byPerson[u.person].oh    += u.total;
        byPerson[u.person].rp    += u.rp;
        byPerson[u.person].ohpt  += u.ohpt;
        byPerson[u.person].ohcnt += u.ohcnt;
      });
      const under = [];
      Object.keys(byPerson).forEach(nm=>{
        const b = byPerson[nm];
        const goal = targetOf(nm);
        if (!(goal > 0) || b.oh >= goal) return;
        under.push({ name: nm, total: b.oh, rp: b.rp, ohpt: b.ohpt, ohcnt: b.ohcnt, goal: goal, pct: Math.round(b.oh / goal * 100) });
      });
      under.sort((a,b)=> (a.pct - b.pct) || String(a.name).localeCompare(String(b.name), 'ko'));
      if (under.length) {
        text += '\n\n⚠️ 오버홀 목표 미달 인원';
        under.forEach(u=>{
          // 평균 난이도 = 난이도합 ÷ 오버홀 건수. 대수만 채우려고 오버홀1만 고르는 쏠림이 보인다.
          const avg = u.ohcnt > 0 ? (u.ohpt / u.ohcnt).toFixed(1) : null;
          const side = [avg ? '평균 '+avg+'등급' : null, u.rp ? '수리 '+u.rp+'대' : null].filter(Boolean).join(' · ');
          text += '\n' + u.name + ' ' + u.total + '/' + u.goal + '대 ' + u.pct + '%' + (side ? '  ('+side+')' : '');
        });
        text += '\n\n📋 AAR 보고 요청';
        text += '\n\n위 미달성 인원에 대해서는 해당 팀장 또는 파트장이 미달성 원인을 파악한 후 AAR 방식으로 간단히 보고해 주세요.';
      }
    }

    // 기준이 바뀐 주에 '저번 주엔 170%였는데' 가 반드시 나온다. 한 줄로 못박아 둔다.
    text += '\n\n※ 2026-11-06부터 포인트를 없애고 \'대수\'로만 집계합니다.'
          + '\n오버홀1·2·3=1대 · 오버홀4=2대 · 오버홀5=3대 · 기기폐기=1대'
          + '\n수리2·3=1대 · 수리4=2대 · 수리5=3대 (수리1·부품제조·부품정리는 0)'
          + '\n한 대에 오버홀과 수리를 같이 했으면 둘 다 더합니다.'
          + '\n평균 등급은 오버홀 난이도(1~5)입니다. 대수는 채웠는데 평균이 낮으면 쉬운 등급으로만 채운 것입니다.';

    res.setHeader('Cache-Control','s-maxage=300, stale-while-revalidate=900');
    res.setHeader('Content-Type','text/plain; charset=utf-8');
    res.status(200).send(text);
  } catch (e) {
    res.setHeader('Content-Type','text/plain; charset=utf-8');
    res.status(200).send('요약 생성 오류: '+String(e));
  }
};
