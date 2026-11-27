// 반출 기기 통계 — 백오피스 집계 창구로 넘겨서 받아온다. (2026-11-27)
//
//   GET /api/withdrawal-stats
//     → { ok:true, total:161, rows:[ { region, fault, category, model, ym } ] }
//
//   돌려받는 것은 '세는 데 필요한 값'뿐이다.
//   거래처명·시리얼·자산번호·사유 원문은 백오피스가 아예 내보내지 않는다
//   (사유 원문에는 이메일·청구 메모 같은 것이 섞여 있다).
//
//   집계 기준 (사용자 확정 2026-11-27):
//     · 고장 반출 = 사유에 '기기고장'이 들어간 건
//     · 지역      = 강원도→수도권E, 강남→수도권C, 안 적은 것→미지정
//     · 기종      = 칼러/컬러 같은 표기 흔들림을 맞춰 묶음

const BO_URL = 'https://first-as-search.vercel.app/api/withdrawal-stats';
const TOKEN = (process.env.BO_LOOKUP_TOKEN || '').trim();

module.exports = async (req, res) => {
  if (!TOKEN) {
    res.status(503).json({ error: '반출 기록 연결 설정이 없습니다 (BO_LOOKUP_TOKEN).' });
    return;
  }
  try {
    const r = await fetch(BO_URL, { headers: { 'x-lookup-token': TOKEN }, redirect: 'follow' });
    const text = await r.text();
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    // 반출은 하루 몇 건씩 늘어난다 — 잠깐만 묶어 둔다
    if (r.ok) res.setHeader('Cache-Control', 's-maxage=120, stale-while-revalidate=600');
    else res.setHeader('Cache-Control', 'no-store');
    res.status(r.status).send(text);
  } catch (e) {
    res.status(502).json({ error: '반출 기록 조회 실패: ' + String(e && e.message ? e.message : e) });
  }
};
