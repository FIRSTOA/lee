// 매주 금요일 18:00 KST(=09:00 UTC) — 주간보고 짧은 요약을 큐에 넣음 (봇이 폴링해서 발송)
// Vercel cron: "0 9 * * 5". 수동 테스트는 ?force=1
const SUPA_URL = 'https://ilppbxhigxnelbnuxwyt.supabase.co';
const SUPA_KEY = 'sb_publishable_cLR46tr3ITMdCAR7L74ROQ_JEmErvNE';
const H = { apikey: SUPA_KEY, Authorization: 'Bearer ' + SUPA_KEY, 'Content-Type': 'application/json' };
const BASE = 'https://lee-zeta-one.vercel.app';

function kst(){ return new Date(Date.now() + 9*3600*1000); }
async function loadQ(){ const r=await fetch(SUPA_URL+'/rest/v1/app_config?key=eq.report_queue&select=value',{headers:H}); const j=await r.json(); return (j&&j[0]&&Array.isArray(j[0].value))?j[0].value:[]; }
async function saveQ(list){ await fetch(SUPA_URL+'/rest/v1/app_config?on_conflict=key',{method:'POST',headers:{...H,Prefer:'resolution=merge-duplicates'},body:JSON.stringify({key:'report_queue',value:list})}); }

// 요약 텍스트에서 헤드라인 + MVP 줄만 뽑아 짧게
function brief(summary){
  const lines = String(summary||'').split('\n').map(s=>s.trim()).filter(Boolean);
  const head = lines[0] || '📊 주간 정량목표 보고';
  const mvp = lines.find(l => l.indexOf('MVP') >= 0) || '';
  return head + (mvp ? '\n' + mvp : '');
}

module.exports = async (req, res) => {
  try {
    const k = kst();
    const force = req.query && req.query.force === '1';
    const full = req.query && req.query.full === '1';   // 대시보드 버튼: 요약 전문 발송("주간보고" 텍스트와 동일)
    if (!force && k.getUTCDay() !== 5) { res.status(200).json({ ok: true, skipped: 'not Friday(KST)' }); return; }

    const ym = req.query && req.query.ym ? String(req.query.ym) : '';
    const qs = 'type=week' + (ym ? '&ym=' + encodeURIComponent(ym) : '');
    let sum = '';
    try { const r = await fetch(BASE + '/api/summary?' + qs); sum = await r.text(); } catch (e) {}
    // 요약을 못 받았으면 큐에 넣지 않는다 (예전에 '전체 0%' 잘못된 보고가 방으로 나간 적 있음)
    if (!/^(📊|📈)/.test(String(sum || '').trim())) {
      res.status(200).json({ ok: false, skipped: 'summary unavailable', got: String(sum || '').slice(0, 120) });
      return;
    }
    const text = (full ? String(sum || '').trim() : brief(sum)) + '\n📋 자세히: ' + BASE + '/report.html?' + qs;

    const today = (ym ? ('ym-' + ym + '-') : '') + k.getUTCFullYear() + '-' + (k.getUTCMonth()+1) + '-' + k.getUTCDate();
    const list = await loadQ();
    if (!force && list.some(x => x.day === today)) { res.status(200).json({ ok: true, skipped: 'already queued today' }); return; }
    list.push({ id: Date.now(), text, sent: false, day: today, createdAt: new Date().toISOString() });
    while (list.length > 20) list.shift();
    await saveQ(list);
    res.status(200).json({ ok: true, queued: true, text });
  } catch (e) {
    res.status(200).json({ ok: false, error: String(e) });
  }
};
