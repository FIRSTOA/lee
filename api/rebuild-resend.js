// 재수리 알림 재발송 — notified 플래그를 초기화해 봇이 다시 폴링·발송하게 함
// 사용: GET /api/rebuild-resend?scope=open   (status='요청' 전부 재발송)
//       GET /api/rebuild-resend?scope=all    (취소 제외 전부)
//       GET /api/rebuild-resend?id=12345     (특정 건만)
const SUPA_URL = 'https://ilppbxhigxnelbnuxwyt.supabase.co';
const SUPA_KEY = 'sb_publishable_cLR46tr3ITMdCAR7L74ROQ_JEmErvNE';
const H = { apikey: SUPA_KEY, Authorization: 'Bearer ' + SUPA_KEY, 'Content-Type': 'application/json' };

async function loadList(){ const r = await fetch(SUPA_URL + '/rest/v1/app_config?key=eq.rebuild_list&select=value', { headers: H }); const j = await r.json(); return (j && j[0] && Array.isArray(j[0].value)) ? j[0].value : []; }
async function saveList(list){ await fetch(SUPA_URL + '/rest/v1/app_config?on_conflict=key', { method: 'POST', headers: { ...H, Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify({ key: 'rebuild_list', value: list }) }); }

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');
  try {
    const q = req.query || {};
    const id = q.id;
    const scope = q.scope || 'open';
    const list = await loadList();
    let n = 0;
    list.forEach(r => {
      if (id) {
        if (String(r.id) === String(id)) { r.notified = false; if (r.status === '완료') r.notifiedDone = false; n++; }
        return;
      }
      if (scope === 'all') {
        if (r.status !== '취소') { r.notified = false; if (r.status === '완료') r.notifiedDone = false; n++; }
      } else { // open
        if (r.status === '요청') { r.notified = false; n++; }
      }
    });
    if (n) await saveList(list);
    res.status(200).json({ ok: true, requeued: n, scope: (id ? 'id:' + id : scope) });
  } catch (e) {
    res.status(200).json({ ok: false, error: String(e) });
  }
};
