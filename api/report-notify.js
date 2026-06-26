// 주간보고 폴링 큐 — 봇이 GET으로 대기 메시지 받아 발송 후 POST로 ack
const SUPA_URL = 'https://ilppbxhigxnelbnuxwyt.supabase.co';
const SUPA_KEY = 'sb_publishable_cLR46tr3ITMdCAR7L74ROQ_JEmErvNE';
const H = { apikey: SUPA_KEY, Authorization: 'Bearer ' + SUPA_KEY, 'Content-Type': 'application/json' };

const BASE = 'https://lee-zeta-one.vercel.app';
function readBody(req){ return new Promise(resolve=>{ let d=''; req.on('data',c=>d+=c); req.on('end',()=>resolve(d)); req.on('error',()=>resolve('')); }); }
async function loadQ(){ const r=await fetch(SUPA_URL+'/rest/v1/app_config?key=eq.report_queue&select=value',{headers:H}); const j=await r.json(); return (j&&j[0]&&Array.isArray(j[0].value))?j[0].value:[]; }
async function saveQ(list){ await fetch(SUPA_URL+'/rest/v1/app_config?on_conflict=key',{method:'POST',headers:{...H,Prefer:'resolution=merge-duplicates'},body:JSON.stringify({key:'report_queue',value:list})}); }

// 봇 폴링 시점에 주간보고 자동 생성 (금요일 18시 이후, 주 1회) — Vercel cron 불필요
async function maybeQueueWeekly(list){
  try {
    const k = new Date(Date.now() + 9*3600*1000);
    if (k.getUTCDay() !== 5 || k.getUTCHours() < 18) return list;     // 금요일 18:00 KST 이후만
    const today = k.getUTCFullYear() + '-' + (k.getUTCMonth()+1) + '-' + k.getUTCDate();
    if (list.some(x => x.day === today)) return list;                 // 오늘 이미 적재됐으면 skip
    let sum = '';
    try { const r = await fetch(BASE + '/api/summary?type=week'); sum = await r.text(); } catch (e) {}
    const lines = String(sum||'').split('\n').map(s=>s.trim()).filter(Boolean);
    const head = lines[0] || '📊 주간 정량목표 보고';
    const mvp = lines.find(l => l.indexOf('MVP') >= 0) || '';
    const text = head + (mvp ? '\n'+mvp : '') + '\n📋 자세히: ' + BASE + '/report.html?type=week';
    list.push({ id: Date.now(), text, sent: false, day: today });
    while (list.length > 20) list.shift();
    await saveQ(list);
  } catch (e) {}
  return list;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (req.method === 'POST') {
      let body = {}; const raw = await readBody(req); try { body = JSON.parse(raw); } catch (e) {}
      const acks = (body && body.acks) || [];
      const list = await loadQ();
      let changed = 0;
      acks.forEach(id => { const it = list.find(x => String(x.id) === String(id)); if (it && !it.sent) { it.sent = true; changed++; } });
      if (changed) await saveQ(list);
      res.status(200).json({ ok: true, acked: changed });
      return;
    }
    let list = await loadQ();
    list = await maybeQueueWeekly(list);
    const items = list.filter(x => !x.sent).map(x => ({ id: x.id, text: x.text }));
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.status(200).json({ ok: true, count: items.length, items });
  } catch (e) {
    res.status(200).json({ ok: false, error: String(e), items: [] });
  }
};
