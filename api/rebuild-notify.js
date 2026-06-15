// 재수리 알림 큐 — 봇이 폴링해서 "오버홀 재수리 요청방"에 전송
// GET: 대기중(미전송) 요청/완료 알림을 텍스트로 반환 + notified 표시(전송됨 처리)
const SUPA_URL = 'https://ilppbxhigxnelbnuxwyt.supabase.co';
const SUPA_KEY = 'sb_publishable_cLR46tr3ITMdCAR7L74ROQ_JEmErvNE';
const H = { apikey: SUPA_KEY, Authorization: 'Bearer ' + SUPA_KEY, 'Content-Type': 'application/json' };
const DASH = 'https://lee-zeta-one.vercel.app/';

function dev(r){ return r.serial || (r.asset_no ? '자산:' + r.asset_no : '(미상)'); }

function ymd(s){ const m=/(\d{2,4})[\/-](\d{1,2})[\/-](\d{1,2})/.exec(String(s||'')); if(!m) return ''; let y=+m[1]; if(y<100)y+=2000; return y+'-'+(+m[2])+'-'+(+m[3]); }
function findOrigPhotos(rec, rows){
  if(!rows || !rec.origPerson || !rec.model) return rec.origPhotos || [];
  const oy=ymd(rec.origDate); const out=[];
  for(let i=2;i<rows.length;i++){ const row=rows[i]; if(!row) continue;
    if((row[4]||'')===rec.origPerson && (row[6]||'')===rec.model && (!oy || ymd(row[1])===oy)){
      const u=String(row[16]||'').match(/https?:\/\/[^\s|]+/g); if(u) u.forEach(function(x){ if(out.indexOf(x)<0) out.push(x); });
    }
  }
  return out.length ? out : (rec.origPhotos || []);
}
function reqMsg(r, origPhotos){
  origPhotos = origPhotos || r.origPhotos || [];
  return '🔧 [재수리 요청]' + (r.urgent === '긴급' ? ' 🔴긴급' : '') + '\n'
    + '모델: ' + (r.model || '-') + '\n'
    + '자산번호: ' + (r.asset_no || '-') + '\n'
    + '시리얼: ' + (r.serial || '-') + '\n'
    + '부위: ' + ((r.parts || []).join(', ') || '-') + '\n'
    + '증상: ' + (r.symptom || '-') + '\n'
    + '요청자: ' + (r.requester || '-') + ' → 담당: ' + (r.handler || '-') + '\n'
    + '보관: ' + (r.place || '-') + ' · 요청일: ' + (r.reqDate || '-')
    + ((r.files && r.files.length) ? '\n📷 재수리 증상사진:\n' + r.files.map(function(f){ return f.url; }).join('\n') : '')
    + ((origPhotos && origPhotos.length) ? '\n🛠 오버홀 당시 사진:\n' + origPhotos.join('\n') : '');
}
function doneMsg(r){
  return '✅ [재수리 완료]\n'
    + '모델: ' + (r.model || '-') + '\n'
    + '자산번호: ' + (r.asset_no || '-') + '\n'
    + '시리얼: ' + (r.serial || '-') + '\n'
    + '처리자: ' + (r.completedBy || r.handler || '-') + '\n'
    + '사유: ' + (r.cause || '-') + '\n'
    + '완료일: ' + (r.completedDate || '-') + '\n'
    + '처리: ' + (r.workDone || '-')
    + (r.replacedParts ? '\n교체부품: ' + r.replacedParts : '')
    + ((r.completedFiles && r.completedFiles.length) ? '\n📷 완료사진:\n' + r.completedFiles.map(function(f){ return (f.label ? '['+f.label+'] ' : '') + f.url; }).join('\n') : '');
}
function cancelMsg(r){
  return '🗑 [재수리 취소]\n'
    + '모델: ' + (r.model || '-') + '\n'
    + '자산번호: ' + (r.asset_no || '-') + '\n'
    + '시리얼: ' + (r.serial || '-') + '\n'
    + '취소자: ' + (r.canceledBy || r.requester || '-') + '\n'
    + '원 요청일: ' + (r.reqDate || '-');
}
function remindMsg(r, ds){
  return '⏰ [재수리 미완료 ' + ds + '일째]\n'
    + '모델: ' + (r.model || '-') + '\n'
    + '시리얼: ' + (r.serial || '-') + '\n'
    + '담당: ' + (r.handler || '-') + '\n'
    + '요청자: ' + (r.requester || '-') + '\n'
    + '요청일: ' + (r.reqDate || '-') + ' (요청 ' + ds + '일 경과)\n'
    + '아직 완료 등록이 안 됐습니다. 처리 부탁드립니다.';
}
function kstToday(){ const k = new Date(Date.now() + 9*3600*1000); return k.getUTCFullYear() + '-' + String(k.getUTCMonth()+1).padStart(2,'0') + '-' + String(k.getUTCDate()).padStart(2,'0'); }
function daysSinceKst(rd){ const m=/(\d{4})-(\d{1,2})-(\d{1,2})/.exec(String(rd||'')); if(!m) return -1; const k=new Date(Date.now()+9*3600*1000); const today=Date.UTC(k.getUTCFullYear(),k.getUTCMonth(),k.getUTCDate()); return Math.floor((today - Date.UTC(+m[1],+m[2]-1,+m[3]))/86400000); }

function readBody(req){ return new Promise(resolve=>{ let d=''; req.on('data',c=>d+=c); req.on('end',()=>resolve(d)); req.on('error',()=>resolve('')); }); }
async function loadList(){ const r=await fetch(SUPA_URL+'/rest/v1/app_config?key=eq.rebuild_list&select=value',{headers:H}); const j=await r.json(); return (j&&j[0]&&Array.isArray(j[0].value))?j[0].value:[]; }
async function saveList(list){ await fetch(SUPA_URL+'/rest/v1/app_config?on_conflict=key',{method:'POST',headers:{...H,Prefer:'resolution=merge-duplicates'},body:JSON.stringify({key:'rebuild_list',value:list})}); }

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (req.method === 'POST') {
      // 전송확인(ack): 봇이 실제로 보낸 것만 '보냄' 처리 → 실패분은 다음에 재전송됨
      let body = {}; const raw = await readBody(req); try { body = JSON.parse(raw); } catch (e) {}
      const acks = (body && body.acks) || [];
      const list = await loadList();
      let changed = 0;
      acks.forEach(a => {
        const rec = list.find(x => String(x.id) === String(a.id)); if (!rec) return;
        if (a.type === 'req') { rec.notified = true; changed++; }
        else if (a.type === 'done') { rec.notifiedDone = true; changed++; }
        else if (a.type === 'cancel') { rec.notifiedCancel = true; changed++; }
        else if (a.type === 'remind') { rec.lastReminded = kstToday(); changed++; }
      });
      if (changed) await saveList(list);
      res.status(200).json({ ok: true, acked: changed });
      return;
    }
    // GET: 미전송 알림 목록 반환 (여기서는 '보냄' 표시 안 함 — 봇이 보낸 뒤 ack해야 표시됨)
    const list = await loadList();
    const items = [];
    list.forEach(rec => {
      if (rec.status !== '취소' && !rec.notified) items.push({ id: rec.id, type: 'req', text: reqMsg(rec) });
      if (rec.status === '완료' && !rec.notifiedDone) items.push({ id: rec.id, type: 'done', text: doneMsg(rec) });
      if (rec.status === '취소' && !rec.notifiedCancel) items.push({ id: rec.id, type: 'cancel', text: cancelMsg(rec) });
    });
    // 미완료 독촉: 요청 2일 경과 + 매일 오전 10시 이후, 하루 1회
    const kH = new Date(Date.now() + 9*3600*1000).getUTCHours();
    if (kH >= 10) {
      const tStr = kstToday();
      list.forEach(rec => {
        if (rec.status === '완료' || rec.status === '취소') return;
        const ds = daysSinceKst(rec.reqDate);
        if (ds >= 2 && rec.lastReminded !== tStr) items.push({ id: rec.id, type: 'remind', text: remindMsg(rec, ds) });
      });
    }
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.status(200).json({ ok: true, count: items.length, items });
  } catch (e) {
    res.status(200).json({ ok: false, error: String(e), items: [] });
  }
};
