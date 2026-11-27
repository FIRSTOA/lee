// =============================================================================
// /api/sso-callback — 그룹웨어에서 돌아왔을 때 (2026-11-27)
//
//   그룹웨어가 ?token=<5분짜리>&state=<우리가 보낸 값> 로 되돌려 보낸다.
//   ① state 가 우리가 보낸 값과 같은지 대조 (위조 방지)
//   ② token 으로 /sso/userinfo 를 불러 "누구인지" 확인 (토큰은 저장하지 않고 버린다)
//   ③ 우리 출입증을 만들어 브라우저 저장소에 넣고 폼으로 보낸다
//
//   차량관리는 쿠키 세션을 쓰지만, 오버홀 폼은 예전부터 localStorage('overhaul_session')
//   를 읽게 되어 있다. 그 모양을 그대로 맞춰야 기존 화면이 안 깨진다.
// =============================================================================
const { signToken } = require('./_auth.js');

const DEFAULT_USERINFO_URL = 'https://firstoa-groupware.vercel.app/sso/userinfo';
const GROUPWARE_HOME = 'https://firstoa-groupware.vercel.app';
const STATE_COOKIE = 'oh_sso_state';
const NEXT_COOKIE  = 'oh_sso_next';
const OH_URL = 'https://ilppbxhigxnelbnuxwyt.supabase.co';
const OH_KEY = (process.env.OH_SUPA_KEY || '').trim();

function parseCookies(header) {
  const out = {};
  if (!header) return out;
  String(header).split(';').forEach(function (part) {
    const i = part.indexOf('=');
    if (i < 0) return;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    if (k) { try { out[k] = decodeURIComponent(v); } catch (e) { out[k] = v; } }
  });
  return out;
}
function expire(name, isProd) {
  const p = [name + '=', 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0'];
  if (isProd) p.push('Secure');
  return p.join('; ');
}
function safeNext(raw) {
  const v = String(raw || '').trim();
  if (!v || !v.startsWith('/') || v.startsWith('//')) return '/form.html';
  return v;
}
function fail(res, isProd, reason) {
  res.setHeader('Set-Cookie', [expire(STATE_COOKIE, isProd), expire(NEXT_COOKIE, isProd)]);
  res.writeHead(302, { Location: '/login.html?sso_error=' + encodeURIComponent(reason) });
  res.end();
}

// 오버홀 관리자 명부 — 기존 app_config.overhaul_admins 를 그대로 본다
async function isOverhaulAdmin(id) {
  if (!OH_KEY || !id) return false;
  try {
    const r = await fetch(OH_URL + '/rest/v1/app_config?key=eq.overhaul_admins&select=value', {
      headers: { apikey: OH_KEY, Authorization: 'Bearer ' + OH_KEY },
    });
    if (!r.ok) return false;
    const j = await r.json();
    const list = (j && j[0] && j[0].value) || [];
    return Array.isArray(list) && list.indexOf(id) >= 0;
  } catch (e) { return false; }
}

module.exports = async (req, res) => {
  const isProd = process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production';
  if (!process.env.SESSION_SECRET) return fail(res, isProd, '로그인 설정이 없습니다 (SESSION_SECRET)');

  const q = req.query || {};
  const token = String(q.token || '');
  const state = String(q.state || '');
  const cookies = parseCookies(req.headers.cookie || '');

  if (!token) return fail(res, isProd, '그룹웨어에서 토큰이 오지 않았습니다');
  if (!state || !cookies[STATE_COOKIE] || state !== cookies[STATE_COOKIE]) {
    return fail(res, isProd, '로그인 요청이 일치하지 않습니다. 다시 시도해 주세요');
  }

  let user;
  try {
    const r = await fetch((process.env.SSO_USERINFO_URL || DEFAULT_USERINFO_URL)
      + '?token=' + encodeURIComponent(token), {
      headers: { Accept: 'application/json', Authorization: 'Bearer ' + token },
    });
    const data = await r.json().catch(function () { return {}; });
    if (r.status === 401 || !data || data.ok !== true || !data.user) {
      return fail(res, isProd, '로그인 정보가 만료되었습니다. 다시 로그인해 주세요');
    }
    user = data.user;
  } catch (e) {
    return fail(res, isProd, '그룹웨어 연결 실패: ' + (e && e.message ? e.message : String(e)));
  }

  if (user.mustChangePassword === true) {
    res.setHeader('Set-Cookie', [expire(STATE_COOKIE, isProd), expire(NEXT_COOKIE, isProd)]);
    res.writeHead(302, { Location: '/login.html?sso_error='
      + encodeURIComponent('그룹웨어에서 비밀번호를 먼저 설정해 주세요') + '&gw=' + encodeURIComponent(GROUPWARE_HOME) });
    res.end();
    return;
  }

  const id   = String(user.username || user.sub || '').trim();
  const name = String(user.name || id).trim();
  const dept = String(user.department || '').trim();
  // 오버홀 관리자는 오버홀 명부(app_config.overhaul_admins)로만 정한다.
  //   그룹웨어의 role=ADMIN 은 '그룹웨어 시스템 관리자'라서, 그걸 그대로 오버홀 관리자로
  //   인정하면 오버홀과 무관한 사람이 관리자 페이지에 들어간다. 권한은 좁게 잡는다.
  const admin = await isOverhaulAdmin(id);

  const ticket = signToken({ sub: id, name: name, dept: dept, admin: admin }, 60 * 60 * 24 * 30);

  // 예전 화면이 읽는 모양 그대로 ({ token, expiresAt, user })
  const session = {
    token: ticket,
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    user: {
      id: id,
      name: name,
      email: user.email || id,     // 예전 화면이 email 을 쓰므로 비어 있지 않게
      dept: dept,
      empNo: user.empNo || '',
      role: admin ? 'admin' : 'user',
      authSource: 'sso',
    },
  };

  const next = safeNext(cookies[NEXT_COOKIE]);
  // </script> 가 글 안에 섞여 화면이 깨지지 않게 < 를 막아 둔다
  const js = JSON.stringify(session).replace(/</g, '\\u003c');

  res.setHeader('Set-Cookie', [expire(STATE_COOKIE, isProd), expire(NEXT_COOKIE, isProd)]);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).send(
    '<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8">' +
    '<title>로그인 중…</title>' +
    '<style>body{font-family:-apple-system,"Malgun Gothic",sans-serif;background:#2b6cb0;color:#fff;' +
    'display:flex;align-items:center;justify-content:center;height:100vh;margin:0;font-size:15px}</style>' +
    '</head><body>로그인 중입니다…<script>' +
    'try{localStorage.setItem("overhaul_session",' + JSON.stringify(js) + ');}catch(e){}' +
    'location.replace(' + JSON.stringify(next) + ');' +
    '</script></body></html>'
  );
};
