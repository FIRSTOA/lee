// 대시보드 데이터 프록시 + 캐시 (report.html 로딩 가속용)
// Apps Script 응답을 Vercel 엣지에서 일정 시간 캐시 → 반복 접속 시 즉시 응답
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwBCwbum3bohh9tlRboZWJo1J1yoAXcOx_PHdmuJcmwMoLG7joTaL4DQIuEp2CP0c0KsQ/exec';

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  try {
    const r = await fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'dashboardData' }),
      redirect: 'follow'
    });
    const text = await r.text();
    // 엣지 캐시: 5분 신선, 이후 15분간은 백그라운드 갱신하며 옛값 제공
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=900');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.status(200).send(text);
  } catch (e) {
    res.status(502).json({ ok: false, error: String(e) });
  }
};
