// 자산번호 → ERP(임대리스트) 조회 프록시
// s-link에 이미 배포된 first_MPS 자산조회 API를 서버에서 호출(키 불필요, CORS 우회).
// GET /api/asset?asset_no=A6156  → { asset:{asset_no,model,device_sn,...}, client:{business_name,...} }
const SLINK_ASSET_URL = 'https://s-link-two.vercel.app/api/asset';

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const code = (req.query && (req.query.asset_no || req.query.q) || '').trim();
  if (!code) { res.status(400).json({ error: '자산번호를 입력하세요.' }); return; }
  try {
    const r = await fetch(SLINK_ASSET_URL + '?asset_no=' + encodeURIComponent(code), { redirect: 'follow' });
    const text = await r.text();
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.status(r.status).send(text);
  } catch (e) {
    res.status(502).json({ error: 'ERP 조회 실패: ' + String(e) });
  }
};
