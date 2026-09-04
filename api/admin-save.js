// 설정 저장 — 저장할 때마다 아이디/비밀번호를 다시 확인한다. 별도 환경변수 불필요.
// POST { username, password, key, value }
//   key = overhaul_quota    (정량목표)      → 관리자 이상
//   key = overhaul_external (외부인력 명단)  → 관리자 이상
//   key = overhaul_admins   (관리자 목록)   → 마스터만
// 화면에서 버튼을 감추는 것과 별개로, 서버가 매번 권한을 확인하므로 우회 저장이 막힌다.
const WORKS_AUTH_URL = 'https://firstoa-works.vercel.app/api/auth/login';
const SUPA_URL = 'https://ilppbxhigxnelbnuxwyt.supabase.co';
const SUPA_KEY = 'sb_publishable_cLR46tr3ITMdCAR7L74ROQ_JEmErvNE';
const SUPA_H = { apikey: SUPA_KEY, Authorization: 'Bearer ' + SUPA_KEY, 'Content-Type': 'application/json' };
const MASTERS = ['lee.us', 'lee.es'];
const ADMIN_KEY = 'overhaul_admins';
const ALLOWED = {
  overhaul_quota: 'admin',
  overhaul_external: 'admin',
  overhaul_admins: 'master'
};

function readBody(req) {
  return new Promise(resolve => {
    if (req.body && typeof req.body === 'object') return resolve(req.body);
    let d = '';
    req.on('data', c => d += c);
    req.on('end', () => { try { resolve(JSON.parse(d || '{}')); } catch (e) { resolve({}); } });
    req.on('error', () => resolve({}));
  });
}

async function loadAdmins() {
  try {
    const r = await fetch(SUPA_URL + '/rest/v1/app_config?key=eq.' + ADMIN_KEY + '&select=value', { headers: SUPA_H });
    if (!r.ok) return [];
    const j = await r.json();
    const v = (j && j[0] && j[0].value) ? j[0].value : [];
    return Array.isArray(v) ? v.map(x => String(x).trim().toLowerCase()).filter(Boolean) : [];
  } catch (e) { return []; }
}

async function verifyUser(username, password) {
  const id = String(username || '').trim();
  const pw = String(password || '');
  if (!id || !pw) return { ok: false, status: 400, error: '아이디와 비밀번호를 입력하세요.' };
  let r, data;
  try {
    r = await fetch(WORKS_AUTH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ username: id, password: pw })
    });
    data = await r.json().catch(() => ({}));
  } catch (e) {
    return { ok: false, status: 502, error: '인증 서버 연결 실패: ' + (e.message || String(e)) };
  }
  if (r.status === 401) return { ok: false, status: 401, error: (data && data.message) || '아이디 또는 비밀번호가 올바르지 않습니다.' };
  if (!r.ok) return { ok: false, status: 502, error: (data && data.message) || ('인증 서버 오류 (' + r.status + ')') };
  if (!data || !data.username) return { ok: false, status: 502, error: '인증 응답 형식 오류' };
  const uname = String(data.username).trim().toLowerCase();
  const admins = await loadAdmins();
  let role = 'none';
  if (MASTERS.indexOf(uname) >= 0) role = 'master';
  else if (admins.indexOf(uname) >= 0) role = 'admin';
  return { ok: true, role: role, user: { username: data.username, name: data.name || '' } };
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (req.method !== 'POST') { res.status(405).json({ ok: false, error: 'POST만 허용' }); return; }
  try {
    const body = await readBody(req);
    const key = String(body.key || '').trim();
    const need = ALLOWED[key];
    if (!need) { res.status(400).json({ ok: false, error: '허용되지 않은 설정 항목입니다: ' + key }); return; }
    if (body.value === undefined || body.value === null) { res.status(400).json({ ok: false, error: '저장할 내용이 없습니다.' }); return; }

    const v = await verifyUser(body.username, body.password);
    if (!v.ok) { res.status(v.status || 401).json({ ok: false, error: v.error }); return; }
    if (v.role === 'none') { res.status(403).json({ ok: false, error: '설정 변경 권한이 없습니다.' }); return; }
    if (need === 'master' && v.role !== 'master') { res.status(403).json({ ok: false, error: '관리자 목록은 마스터만 변경할 수 있습니다.' }); return; }

    // 관리자 목록은 형식 검증 (아이디 문자열 배열)
    let value = body.value;
    if (key === ADMIN_KEY) {
      if (!Array.isArray(value)) { res.status(400).json({ ok: false, error: '관리자 목록 형식 오류' }); return; }
      value = value.map(x => String(x).trim().toLowerCase()).filter(Boolean);
      value = value.filter((x, i) => value.indexOf(x) === i);
    }

    const pr = await fetch(SUPA_URL + '/rest/v1/app_config?on_conflict=key', {
      method: 'POST',
      headers: Object.assign({}, SUPA_H, { Prefer: 'resolution=merge-duplicates' }),
      body: JSON.stringify({ key: key, value: value })
    });
    if (!pr.ok) {
      const t = await pr.text().catch(() => '');
      res.status(502).json({ ok: false, error: '저장 실패 (' + pr.status + ') ' + t.slice(0, 200) });
      return;
    }
    res.status(200).json({ ok: true, key: key, by: v.user.username, role: v.role });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
};
