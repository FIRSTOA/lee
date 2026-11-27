// =============================================================================
// /api/sso-start — 그룹웨어 로그인 화면으로 보낸다 (2026-11-27)
//
//   그룹웨어가 2026-11-01 부터 '사번으로만' 로그인하도록 바뀌었다.
//   그래서 우리가 아이디·비밀번호를 받지 않고, 그룹웨어 화면에서 직접 로그인시킨다.
//   (차량관리 firstoa-car/api/auth-sso-start.js 와 같은 방식 · ESM → CommonJS 로만 옮김)
//
//   우리가 보관하는 비밀 키는 없다. state(위조 방지)만 쿠키에 잠깐 담아 두고
//   돌아왔을 때 같은 값인지 대조한다.
// =============================================================================
const crypto = require('crypto');

const DEFAULT_AUTHORIZE_URL = 'https://firstoa-groupware.vercel.app/sso/authorize';
const STATE_COOKIE = 'oh_sso_state';
const NEXT_COOKIE  = 'oh_sso_next';
const STATE_MAX_AGE = 600;   // 10분 — 그룹웨어 토큰은 5분이지만 입력 시간을 감안

function cookie(name, value, maxAge, isProd) {
  const parts = [
    name + '=' + encodeURIComponent(value),
    'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=' + maxAge,
  ];
  if (isProd) parts.push('Secure');
  return parts.join('; ');
}

// 로그인 뒤 돌아갈 곳은 우리 사이트 안쪽 경로만 허용 (엉뚱한 사이트로 끌려가지 않게)
function safeNext(raw) {
  const v = String(raw || '').trim();
  if (!v || !v.startsWith('/') || v.startsWith('//')) return '/form.html';
  return v;
}

module.exports = async (req, res) => {
  const isProd = process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production';
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const redirectUri = process.env.SSO_REDIRECT_URI || ('https://' + host + '/api/sso-callback');
  const authorizeUrl = process.env.SSO_AUTHORIZE_URL || DEFAULT_AUTHORIZE_URL;

  const state = crypto.randomBytes(16).toString('hex');
  const next = safeNext(req.query && req.query.next);

  res.setHeader('Set-Cookie', [
    cookie(STATE_COOKIE, state, STATE_MAX_AGE, isProd),
    cookie(NEXT_COOKIE, next, STATE_MAX_AGE, isProd),
  ]);

  const url = authorizeUrl
    + '?redirect_uri=' + encodeURIComponent(redirectUri)
    + '&state=' + encodeURIComponent(state);

  res.writeHead(302, { Location: url });
  res.end();
};
