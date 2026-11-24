// ERP(first_MPS) 자산 — 같은 시리얼/자산번호의 '모든 줄'을 돌려준다.
//
// 왜 따로 만들었나:
//   기존 /api/asset 은 s-link 로 넘겨서 받아오는데, 거기가 .limit(1) 이라 한 줄만 온다.
//   그런데 같은 시리얼이 ERP 에 2줄 이상인 경우가 3,910개나 된다(재임대 이력).
//   한 줄만 보고 "자산번호가 다르다"고 하면 멀쩡한 건에도 경고가 뜬다(실측 71건 중 64건이 헛경고).
//   모든 줄과 맞춰 보면 헛경고가 0 이 된다.
//
//   s-link(v3.3)는 2026-06 이후 손대지 않는 구버전이라 거기에 더 얹지 않는다.
//   여기서 first_MPS 를 직접 읽는다. 키는 환경변수로만 두고 브라우저로 내려보내지 않는다.
//
// GET /api/asset-rows?serial=0A6XBJMM7000DYY&asset_no=B8363
//   → { serialRows:[...], codeRows:[...] }   (없으면 빈 배열, 오류 아님)

const MPS_URL = process.env.MPS_URL || '';
const MPS_KEY = process.env.MPS_KEY || '';

const FIELDS = [
  'asset_code', 'classification_number', 'device_sn', 'model_name',
  'name', 'rental_status', 'region_area', 'contract_date', 'end_date',
].join(',');

// 대소문자가 섞여 저장된 시리얼이 413건 있어서 eq 대신 ilike 로 찾는다.
// 값 안의 % _ 는 와일드카드라 그대로 두면 엉뚱한 게 걸린다 → 막는다.
function esc(v) {
  return String(v).replace(/[%_\\]/g, '\\$&');
}

async function pull(column, value) {
  const url = MPS_URL.replace(/\/+$/, '') + '/rest/v1/assets'
    + '?select=' + encodeURIComponent(FIELDS)
    + '&' + column + '=ilike.' + encodeURIComponent(esc(value))
    + '&limit=50';
  const r = await fetch(url, { headers: { apikey: MPS_KEY, Authorization: 'Bearer ' + MPS_KEY } });
  if (!r.ok) return [];
  const j = await r.json();
  return Array.isArray(j) ? j : [];
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (!MPS_URL || !MPS_KEY) {
    // 환경변수를 아직 안 넣었을 때. 폼은 이걸 받으면 조용히 넘어간다(경고를 띄우지 않는다).
    res.status(503).json({ error: 'ERP 연결 설정이 없습니다(MPS_URL / MPS_KEY).' });
    return;
  }
  const q = req.query || {};
  const serial = String(q.serial || '').trim();
  const code = String(q.asset_no || '').trim();
  if (!serial && !code) {
    res.status(400).json({ error: '시리얼 또는 자산번호를 입력하세요.' });
    return;
  }
  try {
    const [serialRows, codeRows] = await Promise.all([
      serial ? pull('device_sn', serial) : Promise.resolve([]),
      code ? pull('asset_code', code) : Promise.resolve([]),
    ]);
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
    res.status(200).json({ serialRows, codeRows });
  } catch (e) {
    res.status(502).json({ error: 'ERP 조회 실패: ' + String(e && e.message ? e.message : e) });
  }
};
