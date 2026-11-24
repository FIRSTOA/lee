// 자산번호/시리얼 → ERP(임대리스트 first_MPS) 조회
//
// 2026-11-24 — s-link 의존을 끊었다.
//   전에는 s-link(v3.3)에 배포된 같은 API 로 넘겨서 받아왔다. 그런데 s-link 는 v4 로 넘어가며
//   2026-06 이후 손대지 않는 구버전이다. 거기가 꺼지면 오버홀 폼의 자동채움 3곳이 같이 죽는다.
//   (form.html 자동채움 / form.html 재수리탭 rbErp / rebuild.html)
//   그래서 여기서 first_MPS 를 직접 읽는다.
//
//   ★ 돌려주는 모양(JSON 구조·칸 이름·오류 문구·상태코드)은 s-link 와 똑같이 맞췄다.
//     부르는 쪽 3곳은 한 줄도 고치지 않아도 전과 똑같이 동작한다.
//
//   환경변수(MPS_URL/MPS_KEY)가 없거나 조회가 실패하면 **예전처럼 s-link 로 넘긴다**.
//   그래서 환경변수를 넣기 전까지는 지금과 100% 같게 돌아간다.
//
// GET /api/asset?asset_no=A6156  또는  ?serial=0A6X...
//   → { asset:{asset_no,model,device_sn,...}, client:{business_name,...} }

const SLINK_ASSET_URL = 'https://s-link-two.vercel.app/api/asset';
const MPS_URL = process.env.MPS_URL || '';
const MPS_KEY = process.env.MPS_KEY || '';

const SELECT = [
  'id', 'asset_code', 'name', 'sales_location', 'contact_person', 'contact_phone',
  'business_registration_number', 'manufacturer', 'model_name', 'device_sn', 'copier_ip',
  'tintec_code', 'client_grade', 'manager', 'managing_company', 'delivery_address_basic',
  'delivery_address_detail', 'contract_date', 'end_date', 'remaining_months',
  'base_amount', 'item_category', 'rental_status',
].join(',');

// 시리얼은 대소문자가 섞여 저장된 것이 413건 있어 ilike 로 찾는다(s-link 는 eq 라 못 찾던 것들이다).
// 값 안의 % _ \ 는 와일드카드이므로 막는다.
function esc(v) { return String(v).replace(/[%_\\]/g, '\\$&'); }

// 2026-11-24 — 전에는 limit=1 로 '아무 줄이나' 가져왔다.
//   실측: 자산번호 3,070개(28%)가 ERP 에 2줄 이상이고,
//   그중 임대중 줄이 있는 1,536개 가운데 1,535개는 첫 줄이 임대중이 아니었다.
//   그래서 B6980 을 치면 「캐리어 냉장고」(2016년 임대종료 줄)가 나오고,
//   정작 지금 임대중인 줄은 무시됐다.
//   → 여러 줄을 받아서 '임대중 먼저, 그 다음 계약일이 최근인 것'으로 고른다.
async function fromMps(column, value) {
  const url = MPS_URL.replace(/\/+$/, '') + '/rest/v1/assets'
    + '?select=' + encodeURIComponent(SELECT)
    + '&' + column + '=ilike.' + encodeURIComponent(esc(value))
    + '&limit=30';
  const r = await fetch(url, { headers: { apikey: MPS_KEY, Authorization: 'Bearer ' + MPS_KEY } });
  if (!r.ok) throw new Error('first_MPS HTTP ' + r.status);
  const rows = await r.json();
  return best(Array.isArray(rows) ? rows : []);
}

function best(rows) {
  if (!rows.length) return null;
  const live = rows.filter(function (r) {
    return String(r.rental_status || '').indexOf('임대중') >= 0;
  });
  const pool = (live.length ? live : rows).slice();
  pool.sort(function (a, b) {
    return String(b.contract_date || '').localeCompare(String(a.contract_date || ''));
  });
  return pool[0];
}

// s-link 가 돌려주던 모양 그대로 만든다 (칸 이름·순서·기본값까지 동일)
function shape(a) {
  const asset = {
    asset_no: a.asset_code,
    manufacturer: a.manufacturer,
    model: a.model_name,
    device_sn: a.device_sn,
    copier_ip: a.copier_ip,
    tintec_code: a.tintec_code,
    asset_type: (a.item_category || '').includes('PC') ? 'pc' : 'copier',
    item_category: a.item_category,
    rental_status: a.rental_status,
    contract_date: a.contract_date,
    end_date: a.end_date,
    remaining_months: a.remaining_months,
    base_amount: a.base_amount,
  };
  const client = {
    business_name: a.name,
    sales_location: a.sales_location,
    contact_name: a.contact_person,
    contact_phone: a.contact_phone,
    biz_no: a.business_registration_number,
    client_grade: a.client_grade,
    manager: a.manager || a.managing_company,
    delivery_address_basic: a.delivery_address_basic,
    delivery_address_detail: a.delivery_address_detail,
    outstanding_amount: 0,
    outstanding_note: null,
  };
  return { asset, client };
}

// 예전 경로 — first_MPS 를 못 쓸 때만 쓴다
async function viaSlink(qs, res) {
  const r = await fetch(SLINK_ASSET_URL + '?' + qs, { redirect: 'follow' });
  const text = await r.text();
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.status(r.status).send(text);
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const code = (req.query && (req.query.asset_no || req.query.q) || '').trim();
  const serial = (req.query && req.query.serial || '').trim();
  if (!code && !serial) { res.status(400).json({ error: '자산번호 또는 시리얼을 입력하세요.' }); return; }
  const qs = code ? ('asset_no=' + encodeURIComponent(code)) : ('serial=' + encodeURIComponent(serial));

  if (MPS_URL && MPS_KEY) {
    try {
      const row = await fromMps(code ? 'asset_code' : 'device_sn', code || serial);
      if (!row) {
        // 없음 — s-link 와 같은 문구·같은 코드
        res.status(404).json({ error: code ? '등록되지 않은 자산번호입니다.' : '등록되지 않은 시리얼입니다.' });
        return;
      }
      res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
      res.status(200).json(shape(row));
      return;
    } catch (e) {
      // first_MPS 가 말을 안 들으면 조용히 예전 경로로 — 현장에서 멈추지 않게 한다
      try { await viaSlink(qs, res); return; } catch (e2) {
        res.status(502).json({ error: 'ERP 조회 실패: ' + String(e2) });
        return;
      }
    }
  }

  // 환경변수가 없으면 예전과 완전히 같은 동작
  try { await viaSlink(qs, res); }
  catch (e) { res.status(502).json({ error: 'ERP 조회 실패: ' + String(e) }); }
};
