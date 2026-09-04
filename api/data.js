// 대시보드 데이터 프록시 + 캐시 (report.html 로딩 가속용)
// Apps Script 응답을 Vercel 엣지에서 일정 시간 캐시 → 반복 접속 시 즉시 응답
// ※ 시트 조회가 간헐적으로 실패한다(구글이 JSON 대신 오류 페이지를 돌려줌).
//   실패분을 그대로 캐시하면 보고서가 '전부 0'으로 그려지므로, 3회 재시도하고
//   그래도 실패하면 502로 돌려준다(호출 측이 Apps Script 직접 조회로 넘어감).
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwBCwbum3bohh9tlRboZWJo1J1yoAXcOx_PHdmuJcmwMoLG7joTaL4DQIuEp2CP0c0KsQ/exec';

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(APPS_SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'dashboardData' }),
        redirect: 'follow'
      });
      const text = await r.text();
      let j = null;
      try { j = JSON.parse(text); } catch (e) { j = null; }
      if (j && Array.isArray(j.rows) && j.rows.length) {
        // 정상 응답만 캐시: 5분 신선, 이후 15분간은 백그라운드 갱신하며 옛값 제공
        res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=900');
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.status(200).send(text);
        return;
      }
    } catch (e) { /* 다음 시도 */ }
    if (i < 2) await new Promise(rs => setTimeout(rs, 900 * (i + 1)));
  }
  // 실패는 절대 캐시하지 않는다
  res.setHeader('Cache-Control', 'no-store');
  res.status(502).json({ ok: false, error: '시트 데이터를 가져오지 못했습니다' });
};
