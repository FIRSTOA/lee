// 관리자 인증 — 회사 인증서버(firstoa-works)에 위임. 별도 환경변수 불필요.
// POST { username, password }
//  → { ok, role: 'master'|'admin'|'none', user: {username,name,department,position}, admins: [...] }
// 마스터: lee.us / lee.es (고정). 관리자: app_config key=overhaul_admins 목록에 등록된 아이디.
const WORKS_AUTH_URL = 'https://firstoa-works.vercel.app/api/auth/login';
const SUPA_URL = 'https://ilppbxhigxnelbnuxwyt.supabase.co';
const SUPA_KEY = 'sb_publishable_cLR46tr3ITMdCAR7L74ROQ_JEmErvNE';
const SUPA_H = { apikey: SUPA_KEY, Authorization: 'Bearer ' + SUPA_KEY, 'Content-Type': 'application/json' };
const MASTERS = ['lee.us', 'lee.es'];
const ADMIN_KEY = 'overhaul_admins';

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

// 아이디/비밀번호를 회사 인증서버에 확인 → 권한 판정
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

  return {
    ok: true,
    role: role,
    admins: admins,
    user: {
      username: data.username,
      name: data.name || '',
      department: data.department || '',
      position: data.position || ''
    }
  };
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (req.method !== 'POST') { res.status(405).json({ ok: false, error: 'POST만 허용' }); return; }
  try {
    const body = await readBody(req);
    const v = await verifyUser(body.username, body.password);
    if (!v.ok) { res.status(v.status || 401).json({ ok: false, error: v.error }); return; }
    if (v.role === 'none') {
      res.status(403).json({ ok: false, error: '설정 변경 권한이 없습니다. 관리자에게 문의하세요.', user: v.user });
      return;
    }
    res.status(200).json({ ok: true, role: v.role, user: v.user, admins: v.role === 'master' ? v.admins : undefined });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
};

module.exports.verifyUser = verifyUser;
module.exports.MASTERS = MASTERS;
