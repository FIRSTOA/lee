// 재수리 알림 큐 — 봇이 폴링해서 "오버홀 재수리 요청방"에 전송
// GET: 대기중(미전송) 요청/완료 알림을 텍스트로 반환 + notified 표시(전송됨 처리)
const SUPA_URL = 'https://ilppbxhigxnelbnuxwyt.supabase.co';
const SUPA_KEY = 'sb_publishable_cLR46tr3ITMdCAR7L74ROQ_JEmErvNE';
const H = { apikey: SUPA_KEY, Authorization: 'Bearer ' + SUPA_KEY, 'Content-Type': 'application/json' };
const DASH = 'https://lee-zeta-one.vercel.app/';

function dev(r){ return r.serial || (r.asset_no ? '자산:' + r.asset_no : '(미상)'); }

function reqMsg(r){
  const parts = (r.parts || []).join(', ');
  return '🔧 [재수리 요청]' + (r.urgent === '긴급' ? ' 🔴긴급' : '') + '\n'
    + '모델: ' + (r.model || '-') + ' (' + dev(r) + ')\n'
    + (r.business ? '업체: ' + r.business + '\n' : '')
    + '부위: ' + (parts || '-') + '\n'
    + '증상: ' + (r.symptom || '-') + '\n'
    + '요청자: ' + (r.requester || '-') + ' → 담당: ' + (r.handler || '-') + '\n'
    + '보관: ' + (r.place || '-') + ' · 요청일 ' + (r.reqDate || '-') + '\n'
    + '📊 ' + DASH;
}
function doneMsg(r){
  return '✅ [재수리 완료]\n'
    + '모델: ' + (r.model || '-') + ' (' + dev(r) + ')\n'
    + '담당: ' + (r.completedBy || r.handler || '-') + ' · 완료일 ' + (r.completedDate || '-') + '\n'
    + '처리: ' + (r.workDone || '-') + (r.replacedParts ? '\n교체부품: ' + r.replacedParts : '') + '\n'
    + '📊 ' + DASH;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');
  try {
    const r = await fetch(SUPA_URL + '/rest/v1/app_config?key=eq.rebuild_list&select=value', { headers: H });
    const j = await r.json();
    const list = (j && j[0] && Array.isArray(j[0].value)) ? j[0].value : [];
    const messages = [];
    let changed = false;
    list.forEach(rec => {
      if (!rec.notified) { messages.push(reqMsg(rec)); rec.notified = true; changed = true; }
      if (rec.status === '완료' && !rec.notifiedDone) { messages.push(doneMsg(rec)); rec.notifiedDone = true; changed = true; }
    });
    if (changed) {
      await fetch(SUPA_URL + '/rest/v1/app_config?on_conflict=key', {
        method: 'POST', headers: { ...H, Prefer: 'resolution=merge-duplicates' },
        body: JSON.stringify({ key: 'rebuild_list', value: list })
      });
    }
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.status(200).json({ ok: true, count: messages.length, messages });
  } catch (e) {
    res.status(200).json({ ok: false, error: String(e), messages: [] });
  }
};
