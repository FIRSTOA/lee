// 주 중간 점검(수요일) 생성 — 두 곳에서 부른다. 한 곳에만 두면 경로에 따라 글이 달라진다.
//   ① api/cron-weekly-report.js : 매일 18:00 KST Vercel 크론   ← 2026-11-25 추가, 이쪽이 주 경로
//   ② api/report-notify.js      : 봇이 30초마다 폴링할 때
//
// ── 왜 크론으로 옮겼나 (2026-11-25) ─────────────────────────────────────────
// 중간 점검은 그동안 ②(봇 폴링)에서만 만들어졌다. 그런데 봇이 멈추면 report-notify.js 자체가
// 호출되지 않으므로 보고가 **아예 만들어지지 않는다**. 주간보고는 금·토 크론이 받쳐주는데
// 중간 점검은 받쳐주는 게 없었다.
//   · 2026-11-25 실측: bot_heartbeat(#1666) 가 한 번도 갱신된 적 없고(= 봇 v30 미설치로 감시도 무력),
//     bot_warmup 2건이 status=dead, car_relay 로그는 11/24~25 전부 "PC가 대신 발송" → 봇 정지 상태.
// 크론을 새로 만들지 않았다. cron-weekly-report 가 이미 **매일** 18:00 에 돌면서
// 금·토가 아니면 그냥 끝내고 있었으므로, 거기에 수·목 분기만 끼웠다.
//
// 보내는 통로는 PC 릴레이다 (api/_statq.js 머리글 참고). 봇은 PC 적재 실패 시 예비.
//
// ── 2026-11-13 메모 (그대로 유효) ───────────────────────────────────────────
// 보내는 방을 '공지방'에서 '통계방'으로 바꿨다. 봇은 통계방(main)과 공지방(notice)을 기억하는데
// room='notice' 로 나가는 건 이 중간 점검 하나뿐이었고, 그 공지방 등록이 운영지원 팀방이었다.
// 그래서 room 을 아예 붙이지 않는다(= 통계방). 중간 점검 기능 자체는 끄지 않는다.
const BASE = 'https://lee-zeta-one.vercel.app';
const KEEP = 40;   // 큐 보관 건수 (부르는 쪽과 같아야 한다)
const { queueStat } = require('./_statq.js');

// 그 주 수요일의 큐 키. 0 패딩 없는 'YYYY-M-D-mid' — 두 경로가 이 키로 중복을 막으므로 형식을 바꾸면 안 된다.
function midKey(wed) {
  return wed.getUTCFullYear() + '-' + (wed.getUTCMonth() + 1) + '-' + wed.getUTCDate() + '-mid';
}
// 지금(KST) 기준으로 만들 대상 수요일. 수 18시~목 23:59 가 아니면 null.
function targetWed() {
  const k = new Date(Date.now() + 9 * 3600 * 1000);
  const dow = k.getUTCDay(), hh = k.getUTCHours();   // 수=3, 목=4
  let back = -1;
  if (dow === 3 && hh >= 18) back = 0;
  else if (dow === 4) back = 1;
  if (back < 0) return null;
  const wed = new Date(k.getTime());
  wed.setUTCDate(wed.getUTCDate() - back);
  return { wed: wed, back: back };
}

// list 를 그 자리에서 고치고 돌려준다. saveQ 는 부르는 쪽 것을 받는다(큐 저장 방식이 한 곳에만 있게).
async function maybeQueueMidweek(list, saveQ) {
  try {
    const tg = targetWed();
    if (!tg) return list;
    const day = midKey(tg.wed);
    if (list.some(x => x.day === day)) return list;   // 이미 적재됨(크론이든 봇이든)

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
    // ⏰ 가 아니면 요약 조회 실패 — 적재하지 않는다(잘못된 보고 방지). 목요일 크론·봇 폴링이 다시 시도한다.
    if (t.indexOf('⏰') !== 0) return list;

    const wmd = (tg.wed.getUTCMonth() + 1) + '/' + tg.wed.getUTCDate();
    const pcId = await queueStat('overhaul_midweek', wmd + ' 중간 점검', t);
    list.push({
      id: Date.now(), text: t, sent: !!pcId, day: day, createdAt: new Date().toISOString(),
      src: tg.back ? 'mid-late' : 'mid', via: pcId ? 'pc' : 'bot', pcId: pcId || undefined
    });
    while (list.length > KEEP) list.shift();
    await saveQ(list);
  } catch (e) {}
  return list;
}

module.exports = { maybeQueueMidweek: maybeQueueMidweek, midKey: midKey, targetWed: targetWed };
