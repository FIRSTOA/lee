// 주간보고 폴링 큐 — 봇이 GET으로 대기 메시지 받아 발송 후 POST로 ack
const SUPA_URL = 'https://ilppbxhigxnelbnuxwyt.supabase.co';
const SUPA_KEY = 'sb_publishable_cLR46tr3ITMdCAR7L74ROQ_JEmErvNE';
const H = { apikey: SUPA_KEY, Authorization: 'Bearer ' + SUPA_KEY, 'Content-Type': 'application/json' };

const BASE = 'https://lee-zeta-one.vercel.app';
function readBody(req){ return new Promise(resolve=>{ let d=''; req.on('data',c=>d+=c); req.on('end',()=>resolve(d)); req.on('error',()=>resolve('')); }); }
async function loadQ(){ const r=await fetch(SUPA_URL+'/rest/v1/app_config?key=eq.report_queue&select=value',{headers:H}); const j=await r.json(); return (j&&j[0]&&Array.isArray(j[0].value))?j[0].value:[]; }
async function saveQ(list){ await fetch(SUPA_URL+'/rest/v1/app_config?on_conflict=key',{method:'POST',headers:{...H,Prefer:'resolution=merge-duplicates'},body:JSON.stringify({key:'report_queue',value:list})}); }

// 2026-11-06 — 카톡은 긴 글을 '전체보기'로 접고 링크 카드도 안 만든다.
// 짧은 요약 + 맨 끝 링크로 보내면 카드가 뜨고, 그 카드 그림이 report.html 실시간
// 스크린샷(og:image=thum.io)이라 부서별 표가 방에서 바로 보인다.
// 2026-11-13 \u2014 \uCE74\uD1A1\uC740 '\uADF8\uB0E5 \uBE48\uCE78'\uB9CC \uBCF4\uBA74 \uAC70\uAE30\uC11C \uC904\uC744 \uBC14\uAFBC\uB2E4. \uADF8\uB798\uC11C '\uAC15\uB0A8C 100%' \uAC00
// '\uAC15\uB0A8C' / '100%' \uB85C, '\u26A0\uFE0F \uBAA9\uD45C \uBBF8\uB2EC 3\uBA85' \uC774 '\u26A0\uFE0F' / '\uBAA9\uD45C \uBBF8\uB2EC 3\uBA85' \uC73C\uB85C \uAC08\uB77C\uC84C\uB2E4.
// CSS \uBB38\uC81C\uAC00 \uC544\uB2C8\uB77C \uBCF4\uB0B4\uB294 \uAE00\uC790 \uBB38\uC81C\uB77C\uC11C, \uBD99\uC5B4 \uC788\uC5B4\uC57C \uD558\uB294 \uC790\uB9AC\uC758 \uBE48\uCE78\uC744 NB(U+00A0,
// \uC904\uBC14\uAFC8 \uAE08\uC9C0 \uBE48\uCE78)\uB85C \uBC14\uAFBC\uB2E4. \uBCF4\uAE30\uC5D0\uB294 \uB611\uAC19\uC740 \uD55C \uCE78\uC778\uB370 \uADF8 \uC790\uB9AC\uC5D0\uC11C\uB294 \uC904\uC774 \uC548 \uBC14\uB010\uB2E4.
// \uC904\uC740 \uAC00\uC6B4\uB383\uC810(\u00B7) \uB4A4\uC5D0\uC11C\uB9CC \uBC14\uB00C\uACE0, \uC810\uC740 \uC55E \uB369\uC5B4\uB9AC\uC5D0 \uBD99\uC5EC \uB46C\uC11C \uC904 \uB9E8 \uC55E\uC5D0 \uC678\uD1A8\uC774\uB85C \uB0A8\uC9C0 \uC54A\uB294\uB2E4.
const NB = '\u00A0';
function briefOf(sum){
  const lines = String(sum || '').trim().split('\n');

  // \uBA38\uB9AC\uAE00 \u2014 '11/13 \uC8FC\uAC04 \u2026 \uB2EC\uC131' \uACFC '\uC804\uCCB4 122% (110/90\uB300)' \uB97C \uAC01\uAC01 \uD55C \uB369\uC5B4\uB9AC\uB85C
  const h0 = lines[0] || '';
  const hm = /^(\S+)\s+(.+?)\s{2,}(\uC804\uCCB4\s+\d+%)\s*(\(.+\))\s*$/.exec(h0);
  const head = hm ? (hm[1] + NB + hm[2].replace(/\s+/g, NB) + '  ' + hm[3].replace(/\s+/g, NB) + NB + hm[4]) : h0;

  // \uD83D\uDDD1 \uD3D0\uAE30 N\uB300 \u00B7 \uD83D\uDD29 \uB9AC\uD398\uC5B4 N\uAC1C \u2014 summary \uAC00 \uB458\uC9F8 \uC904\uC5D0 \uB123\uC5B4 \uC900\uB2E4
  const exRaw = lines.find(l => l.indexOf('\u{1F5D1}') === 0) || '';
  const ex = exRaw ? exRaw.split(' \u00B7 ').map(s => s.replace(/\s+/g, NB)).join(NB + '\u00B7 ') : '';

  // \uD83C\uDFC5 \uC774\uC8FC\uC758 MVP: \uC5C4\uC7AC\uD604 (24\uB300) \u2014 \uC774\uB984\uACFC \uB300\uC218\uAC00 \uAC08\uB77C\uC9C0\uC9C0 \uC54A\uAC8C
  const mvpRaw = lines.find(l => l.indexOf('\u{1F3C5}') === 0) || '';
  const mm = mvpRaw ? /^(\S+)\s+(.+?):\s*(.+?)\s*\((.+?)\)\s*$/.exec(mvpRaw) : null;
  const mvp = mm ? (mm[1] + NB + mm[2].replace(/\s+/g, NB) + ': ' + mm[3].replace(/\s+/g, NB) + NB + '(' + mm[4].replace(/\s+/g, NB) + ')') : mvpRaw;

  const depts = lines.map(l => {
    const m = /^\u2022\s*(\S+)\s+(\d+)\/(\d+)\uB300\s+(\d+)%/.exec(l);
    return (m && Number(m[3]) > 0) ? (m[1] + NB + m[4] + '%') : null;
  }).filter(Boolean);
  const warn = lines.find(l => l.indexOf('\u26A0\uFE0F') === 0);
  let under = 0;
  if (warn) { for (let i = lines.indexOf(warn) + 1; i < lines.length; i++) { const t = lines[i].trim(); if (!t || t.indexOf('\u{1F4CB}') === 0) break; under++; } }
  const underTxt = under ? ['\u26A0\uFE0F', '\uBAA9\uD45C', '\uBBF8\uB2EC', under + '\uBA85'].join(NB) : '';
  const l2 = [mvp, underTxt].filter(Boolean).join('   ');
  return [head, ex, l2, depts.length ? depts.join(NB + '\u00B7 ') : ''].filter(Boolean).join('\n');
}
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

    // 링크에 주차(w=)를 붙여야 카톡이 지난주 카드를 재사용하지 않고 새로 읽어온다.
    const text = briefOf(sum) + '\n\n📄 부서별 표 · 미달 명단 · AAR 전문\n'
               + BASE + '/report.html?type=week&w=' + encodeURIComponent(md);
    list.push({ id: Date.now(), text, sent: false, day: day, createdAt: new Date().toISOString(), src: back ? 'poll-late' : 'poll' });
    while (list.length > KEEP) list.shift();
    await saveQ(list);
  } catch (e) {}
  return list;
}

// 2026-11-13 — 주 중간 점검 중단. 운영지원 팀방으로 아무것도 보내지 말라는 지시.
//
// 왜 중간 점검만 샜나:
//   봇은 통계방(main)과 공지방(notice) 두 개를 기억하는데, room='notice' 로 나가는 것은
//   이 중간 점검 하나뿐이다. 주간보고는 room 이 없어 통계방으로 간다.
//   10/16·10/23·10/30·11/6 주간보고는 4주 연속 정상이었고, 10/28·11/4·11/11 중간 점검만
//   운영지원 팀방에 도착했다 → 공지방 등록이 운영지원 팀방으로 되어 있다는 뜻이다.
//   봇은 설계대로 보낸 것이고, 봇 코드를 고쳐도 등록이 그대로면 또 간다.
//
// 그래서 서버에서 항목 자체를 만들지 않는다(폰 작업 없이 즉시 끊긴다).
// 봇에서 '통계진단' 으로 공지방이 어느 방인지 확인하고 올바른 방으로 다시 등록한 뒤
// 이 값을 true 로 되돌린다. 그때까지 중간 점검은 나가지 않는다.
const MIDWEEK_ON = false;

// 주 중간 점검 — 수요일 18:00 ~ 목요일 23:59 KST 사이에 그 주 수요일분이 없으면 만든다.
// 공지방 room='notice' 로 보낸다. 금요일 주간보고와는 별개 항목이다.
async function maybeQueueMidweek(list){
  if (!MIDWEEK_ON) return list;
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

    // 2026-11-13 — 내려보내기 전 안전장치 두 가지.
    //
    // (1) room='notice' 는 어떤 경우에도 내려보내지 않는다.
    //     공지방이 운영지원 팀방으로 등록돼 있어서, 이 값이 붙은 항목은 그리로 간다.
    //     위에서 새로 만들지 않도록 막았지만, 큐에 남아 있던 옛 항목까지 여기서 끊는다.
    //
    // (2) 같은 항목을 MAX_TRY 번 내려보내고도 ack 가 없으면 서버가 스스로 멈춘다.
    //     봇은 발송에 실패하면 ack 를 안 보내고, 서버는 그걸 '아직 안 갔다'로 보고
    //     1분마다 같은 항목을 다시 내려줬다 → 2026-11-11 중간 점검이 18번 나갔다.
    //     봇이 어떤 상태든 서버 쪽에서 끊기므로 폰을 고치지 않아도 폭주는 막힌다.
    const MAX_TRY = 3;
    let touched = false;
    const items = [];
    list.forEach(x => {
      if (x.sent) return;
      if (x.room === 'notice') {                       // (1) 공지방행은 막는다
        x.sent = true; x.stoppedBy = 'notice-blocked 2026-11-13'; touched = true;
        return;
      }
      const n = (x.tries || 0) + 1;                    // (2) 내려보낸 횟수를 센다
      x.tries = n; touched = true;
      if (n > MAX_TRY) {
        x.sent = true; x.stoppedBy = 'auto-stop after ' + MAX_TRY + ' tries';
        return;
      }
      items.push({ id: x.id, text: x.text, room: 'main' });
    });
    if (touched) await saveQ(list);

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.status(200).json({ ok: true, count: items.length, items });
  } catch (e) {
    res.status(200).json({ ok: false, error: String(e), items: [] });
  }
};
