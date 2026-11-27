// =============================================================================
// 로그인 출입증 (2026-11-27)
//   그룹웨어 아이디로 로그인한 사람에게 서명된 출입증을 준다.
//   SESSION_SECRET 으로 서명하므로 남이 위조할 수 없다. 30일 유지.
//
//   파일 이름이 _ 로 시작하면 Vercel 이 주소로 노출하지 않는다 (= 내부용).
//   만든 방식은 출고준비 앱(chulgo-prep/lib/auth.js)과 같다. 거기서는 ESM,
//   여기 오버홀 api 는 CommonJS 라 형식만 맞춰 옮겼다.
// =============================================================================
const crypto = require('crypto');

const SECRET = (process.env.SESSION_SECRET || '').trim();

function b64url(buf) {
  return Buffer.from(buf).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function unb64url(s) {
  return Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString();
}

/** 출입증 발급 — 기본 30일 */
function signToken(payload, ttlSec) {
  if (!SECRET) throw new Error('SESSION_SECRET 환경변수가 없습니다.');
  const body = Object.assign({}, payload, {
    exp: Math.floor(Date.now() / 1000) + (ttlSec || 60 * 60 * 24 * 30),
  });
  const p = b64url(JSON.stringify(body));
  const sig = b64url(crypto.createHmac('sha256', SECRET).update(p).digest());
  return p + '.' + sig;
}

/** 출입증 확인 — 맞으면 안에 든 내용, 아니면 null */
function verifyToken(token) {
  if (!token || !SECRET) return null;
  const parts = String(token).split('.');
  if (parts.length !== 2) return null;
  const expect = b64url(crypto.createHmac('sha256', SECRET).update(parts[0]).digest());
  // 길이가 다르면 timingSafeEqual 이 예외를 던진다 → try 로 감싼다
  try {
    if (!crypto.timingSafeEqual(Buffer.from(parts[1]), Buffer.from(expect))) return null;
  } catch (e) { return null; }
  let body;
  try { body = JSON.parse(unb64url(parts[0])); } catch (e) { return null; }
  if (!body.exp || body.exp < Math.floor(Date.now() / 1000)) return null;   // 기한 지남
  return body;
}

/** 요청 헤더의 Bearer 출입증을 확인 → 통과하면 내용, 아니면 null */
function requireAuth(req) {
  const h = (req.headers && (req.headers.authorization || req.headers.Authorization)) || '';
  const t = String(h).startsWith('Bearer ') ? String(h).slice(7) : '';
  return verifyToken(t);
}

module.exports = { signToken, verifyToken, requireAuth };
