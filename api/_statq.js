// 통계방 발송 큐 — 법인차량 PC 릴레이(C:\firstoa\car_relay.ps1)가 1분마다 집어서
// 카톡 '통계 영업보고 분석 예측' 방에 직접 올린다.
//
// ── 왜 이걸 쓰나 (2026-11-25) ────────────────────────────────────────────────
// 그동안 주간보고는 app_config.report_queue + 폰 메신저봇으로만 나갔다.
// 그런데 report-notify.js 는 봇이 '가져가는 순간' sent=true 를 찍고 다시는 안 내려준다
// (11/13 같은 글 18번 반복 사고를 막으려고 넣은 장치). 봇이 실제로 방에 넣었는지는
// 아무도 확인하지 않는다. 그래서 봇이 멈춰 있으면 보고가 통째로 사라진다.
//   · 11/20 실제 누락: 금 18:01 정상 생성 → 봇이 토 08:11 에야 3건을 한꺼번에 가져감
//     → 가져가는 순간 전부 sent 처리 → 통계방에는 끝내 도착 안 함.
//     같은 시각(금 18:03, 19:24) PC 릴레이는 멀쩡히 발송 중이었다 = 폰 봇만 멈춘 것.
//
// 법인차량 보고는 같은 통계방을 notification_queue + PC 릴레이로 보내고 있고
// 재시도(사실상 무제한)·실제 발송 확인·막힘 경고·늦은 도착 표시가 전부 들어 있다.
// 새로 만들지 않고 그 검증된 통로에 오버홀 보고도 태운다.
//
// ── 규칙 (car_relay.ps1 과 맞춰야 하는 값) ──────────────────────────────────
//   retry_count = 1000  : 법인차량 폰 봇은 1000 이상인 행을 집지 않는다 → PC 릴레이 전담
//   target_room 에 '통계' 가 들어 있어야 릴레이가 통계방 창을 고른다 (Pick-Room)
//   status = 'pending'  : 릴레이는 pending/failed 만 집는다 (617줄)
//
// ── 통계방은 '보고' 전용 (2026-11-26 사용자 지시) ───────────────────────────
// 「통계방으로 주간 보고나 보고 내용 아니면 어떠한 알림도 보내지 마라」
//   · queueStat  → 통계방. 주간보고·중간 점검 같은 보고 내용만.
//   · queueAlert → 「나와의 채팅」. 미발송 경고·통로 점검 등 사람이 조치할 알림.
// 경고용 방의 실제 카톡 창 이름은 릴레이의 $ROOM_ME 가 정한다. 여기서는 '나와의 채팅'이라는
// 라벨만 넣고, Pick-Room 이 target_room 에 '나와의' 가 있으면 그 방을 고른다.
// ⚠ 라벨에서 '나와의' 를 빼면 Pick-Room 의 마지막 줄에 걸려 법인차량 팀방으로 간다.
//
// 키는 환경변수로만 받는다. 차량 프로젝트 키라 이 저장소에 평문으로 두지 않는다.
//   CAR_QUEUE_URL = https://<차량 supabase>.supabase.co
//   CAR_QUEUE_KEY = sb_publishable_...
// (2026-11-25 환경변수 CAR_QUEUE_URL·CAR_QUEUE_KEY 등록 후 재배포)
const Q_URL = process.env.CAR_QUEUE_URL || '';
const Q_KEY = process.env.CAR_QUEUE_KEY || '';
const ROOM_ALERT = '나와의 채팅';   // 나와의 채팅 (경고용 — 실제 창 이름은 릴레이 $ROOM_ME)
const ROOM = '\uD1B5\uACC4 \uC601\uC5C5\uBCF4\uACE0 \uBD84\uC11D \uC608\uCE21';   // 통계 영업보고 분석 예측

// 성공하면 넣은 행의 id(숫자), 실패하면 false.
// 실패해도 예외를 던지지 않는다 — 부르는 쪽이 봇 큐로 되돌아갈 수 있게.
async function post(room, event, title, message) {
  if (!Q_URL || !Q_KEY) return false;
  try {
    const r = await fetch(Q_URL.replace(/\/+$/, '') + '/rest/v1/notification_queue', {
      method: 'POST',
      headers: {
        apikey: Q_KEY,
        Authorization: 'Bearer ' + Q_KEY,
        'Content-Type': 'application/json',
        Prefer: 'return=representation'
      },
      body: JSON.stringify({
        event: event,
        title: title,
        message: message,
        target_room: room,
        status: 'pending',
        retry_count: 1000,
        details: { event: event, by: 'overhaul' }
      })
    });
    if (!r.ok) return false;
    const j = await r.json();
    return (Array.isArray(j) && j.length && j[0].id) ? j[0].id : false;
  } catch (e) {
    return false;
  }
}

// 통계방 — 보고 내용만 (주간보고, 중간 점검)
function queueStat(event, title, message) { return post(ROOM, event, title, message); }
// 나와의 채팅 — 사람이 조치해야 하는 알림만 (미발송 경고, 통로 점검)
function queueAlert(event, title, message) { return post(ROOM_ALERT, event, title, message); }

module.exports = { queueStat: queueStat, queueAlert: queueAlert };
