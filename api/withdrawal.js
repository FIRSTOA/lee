// 반출 기록 조회 — 백오피스(first-as-search)로 넘겨서 받아온다.
//
//   GET /api/withdrawal?serial=0A6XBJMM7000DYY
//     → { rows:[ { serial_number, asset_number, model_name, company_name,
//                  company_full, delivery_date, region, reason, created_at } ] }
//
//   왜 서버를 거치나 (2026-11-24):
//     백오피스 반출 기록은 RLS 로 로그인한 사람만 읽을 수 있다.
//     브라우저가 직접 부르려면 키가 화면에 박혀야 하므로, 서버가 토큰을 들고 대신 부른다.
//     토큰은 환경변수에만 있고 브라우저로는 내려가지 않는다.
//
//   입고처를 왜 여기서 가져오나:
//     오버홀의 '입고처'는 기기를 회수해 온 곳이다. ERP 는 '지금 임대 중인 곳'이라
//     실측 437건 중 82건(19%)만 맞았다. 반출 기록은 같은 기간 34건 중 30건(88%)이 맞았고,
//     안 맞은 4건도 3건은 오타·괄호 차이였다(실질 97%).

const BO_URL = 'https://first-as-search.vercel.app/api/withdrawal-lookup';
const TOKEN = process.env.BO_LOOKUP_TOKEN || '';

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const serial = (req.query && req.query.serial || '').trim();
  // 시리얼이 어긋나는 경우가 있어(OCR 오독 등) 자산번호로도 찾게 한다.
  const assetNo = (req.query && req.query.asset_no || '').trim();
  if (!serial && !assetNo) { res.status(400).json({ error: '시리얼 또는 자산번호를 입력하세요.' }); return; }
  if (!TOKEN) {
    // 환경변수를 아직 안 넣었을 때. 폼은 이걸 받으면 조용히 넘어간다.
    res.status(503).json({ error: '반출 기록 연결 설정이 없습니다(BO_LOOKUP_TOKEN).' });
    return;
  }
  const qs = [];
  if (serial) qs.push('serial=' + encodeURIComponent(serial));
  if (assetNo) qs.push('asset_no=' + encodeURIComponent(assetNo));
  try {
    const r = await fetch(BO_URL + '?' + qs.join('&'), {
      headers: { 'x-lookup-token': TOKEN },
      redirect: 'follow',
    });
    const text = await r.text();
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    // 반출 기록은 자주 바뀌지 않지만, 오늘 반출된 기기를 오늘 작업할 수 있어 짧게만 둔다.
    if (r.ok) res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=120');
    res.status(r.status).send(text);
  } catch (e) {
    res.status(502).json({ error: '반출 기록 조회 실패: ' + String(e && e.message ? e.message : e) });
  }
};
