// 주간보고 폴링 큐 — 봇이 GET으로 대기 메시지 받아 발송 후 POST로 ack
const SUPA_URL = 'https://ilppbxhigxnelbnuxwyt.supabase.co';
const SUPA_KEY = 'sb_publishable_cLR46tr3ITMdCAR7L74ROQ_JEmErvNE';
const H = { apikey: SUPA_KEY, Authorization: 'Bearer ' + SUPA_KEY, 'Content-Type': 'application/json' };

const BASE = 'https://lee-zeta-one.vercel.app';
function readBody(req){ return new Promise(resolve=>{ let d=''; req.on('data',c=>d+=c); req.on('end',()=>resolve(d)); req.on('error',()=>resolve('')); }); }
async function loadQ(){ const r=await fetch(SUPA_URL+'/rest/v1/app_config?key=eq.report_queue&select=value',{headers:H}); const j=await r.json(); return (j&&j[0]&&Array.isArray(j[0].value))?j[0].value:[]; }
async function saveQ(list){ await fetch(SUPA_URL+'/rest/v1/app_config?on_conflict=key',{method:'POST',headers:{...H,Prefer:'resolution=merge-duplicates'},body:JSON.stringify({key:'report_queue',value:list})}); }

const KEEP = 40;   // 큐 보관 건수 (미발송 추적에 쓰므로 넉넉히)

// 봇 폴링 시점에 주간보고 자동 생성 — 봇은 30초마다 이 API를 치므로 사실상 무제한 재시도다.
//  · 금요일 18:00 ~ 일요일 23:59 KST 사이에 '그 주 금요일분'이 없으면 만든다.
//    (금요일 저녁에 봇이 꺼져 있었어도 주말에 켜지면 복구된다)
//  · 토요일 정오를 넘겨도 못 만들었으면 '보고가 안 나갔다'는 경고를 큐에 넣는다.
//    경고도 큐를 타므로, 봇이 나중에 켜져도 반드시 전달된다.
async function maybeQueueWeekly(list){
  try {
    const k = new Date(Date.now() + 9*3600*1000);
    const dow = k.getUTCDay(), hh = k.getUTCHours();   // KST 요일/시 (금=5, 토=6, 일=0)
    let back = -1;                                     // 대상 금요일까지 거슬러 올라갈 일수
    if (dow === 5 && hh >= 18) back = 0;
    else if (dow === 6) back = 1;
    else if (dow === 0) back = 2;
    if (back < 0) return list;

    const fri = new Date(k.getTime()); fri.setUTCDate(fri.getUTCDate() - back);
    const day = fri.getUTCFullYear() + '-' + (fri.getUTCMonth()+1) + '-' + fri.getUTCDate();
    const md  = (fri.getUTCMonth()+1) + '/' + fri.getUTCDate();
    if (list.some(x => x.day === day)) return list;    // 이미 적재됐으면 skip

    let sum = '';
    // 뒤늦게 만드는 분은 제목 날짜를 금요일로 고정 (집계 범위는 동일)
    const sumQs = 'type=week' + (back ? '&asof=' + encodeURIComponent(md) : '');
    try { const r = await fetch(BASE + '/api/summary?' + sumQs); sum = await r.text(); } catch (e) {}

    // 요약을 못 받았으면 적재하지 않는다 (잘못된 0% 보고 방지) — 30초 뒤 폴링에서 재시도
    if (!/^(📊|📈)/.test(String(sum || '').trim())) {
      const late = (dow === 6 && hh >= 12) || dow === 0;   // 토요일 정오 이후
      if (late && !list.some(x => x.day === day + '-warn')) {
        const warn = '⚠️ ' + md + '(금) 주간보고가 발송되지 않았습니다.\n'
                   + '요약 자동 생성이 계속 실패하고 있습니다. 확인이 필요합니다.\n'
                   + '📋 대시보드: ' + BASE + '/report.html?type=week';
        list.push({ id: Date.now(), text: warn, sent: false, day: day + '-warn', createdAt: new Date().toISOString(), src: 'poll-warn' });
        while (list.length > KEEP) list.shift();
        await saveQ(list);
      }
      return list;
    }

    // 전문으로 보낸다 (2026-10-26) — 미달성 인원·AAR 요청이 빠지면 보고가 할 일을 못 한다
    const text = String(sum||'').trim() + '\n📋 자세히: ' + BASE + '/report.html?type=week';
    list.push({ id: Date.now(), text, sent: false, day: day, createdAt: new Date().toISOString(), src: back ? 'poll-late' : 'poll' });
    while (list.length > KEEP) list.shift();
    await saveQ(list);
  } catch (e) {}
  return list;
}

// 주 중간 점검 — 수요일 18:00 ~ 목요일 23:59 KST 사이에 그 주 수요일분이 없으면 만든다.
// 공지방 room='notice' 로 보낸다. 금요일 주간보고와는 별개 항목이다.
async function maybeQueueMidweek(list){
  try {
    const k = new Date(Date.now() + 9*3600*1000);
    const dow = k.getUTCDay(), hh = k.getUTCHours();   // 수=3, 목=4
    let back = -1;
    if (dow === 3 && hh >= 18) back = 0;
    else if (dow === 4) back = 1;
    if (back < 0) return list;

    const wed = new Date(k.getTime()); wed.setUTCDate(wed.getUTCDate() - back);
    const day = wed.getUTCFullYear() + '-' + (wed.getUTCMonth()+1) + '-' + wed.getUTCDate() + '-mid';
    if (list.some(x => x.day === day)) return list;

    let sum = '';
    try { const r = await fetch(BASE + '/api/summary?type=midweek'); sum = await r.text(); } catch (e) {}
    const t = String(sum || '').trim();

    // ✅ = 전원 페이스 유지 → 보낼 내용이 없다. 빈 항목을 sent 처리해 두어 재시도를 멈춘다.
    if (t.indexOf('✅') === 0) {
      list.push({ id: Date.now(), text: '', sent: true, day: day, createdAt: new Date().toISOString(), src: 'mid-none' });
      while (list.length > KEEP) list.shift();
      await saveQ(list);
      return list;
    }
    // ⏰ 가 아니면 조회 실패 — 적재하지 않고 다음 폴링(30초 뒤)에서 재시도
    if (t.indexOf('⏰') !== 0) return list;

    list.push({ id: Date.now(), text: t, sent: false, day: day, room: 'notice', createdAt: new Date().toISOString(), src: back ? 'mid-late' : 'mid' });
    while (list.length > KEEP) list.shift();
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
    list = await maybeQueueMidweek(list);
    // room: 'notice' = 공지방, 없으면 통계방(기본). 구버전 봇은 room 을 무시하고 통계방으로 보낸다.
    const items = list.filter(x => !x.sent).map(x => ({ id: x.id, text: x.text, room: x.room || 'main' }));
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.status(200).json({ ok: true, count: items.length, items });
  } catch (e) {
    res.status(200).json({ ok: false, error: String(e), items: [] });
  }
};
