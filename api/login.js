// =============================================================================
// /api/login — 그룹웨어 아이디로 로그인 (2026-11-27)
//
//   POST { id: 'hong.gd', password: '...' }
//     → { ok:true, token, id, name, dept, admin }
//
//   비밀번호는 여기서 보관하지 않는다. 그룹웨어(firstoa-works)에 그대로 넘겨
//   맞는지만 확인받고, 맞으면 우리 쪽 출입증을 만들어 준다.
//   출고준비 앱(chulgo-prep/api/login.js)이 쓰는 방식과 같다.
//
//   왜 아이디로 바꾸나 (사용자 지시 2026-11-27):
//     지금 폼은 담당자를 '이름'으로 적는다. 그래서 이호준 / 이호준1,
//     주간 엄재현 / 야간 엄재현을 사람이 눈으로 갈라야 했다.
//     아이디로 남기면 이 혼동이 사라지고, 시작한 사람과 끝낸 사람도 정확히 갈린다.
// =============================================================================
const { signToken } = require('./_auth.js');

const SSO_LOGIN = 'https://firstoa-works.vercel.app/api/auth/login';

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'POST 요청만 받습니다.' });
    return;
  }
  if (!process.env.SESSION_SECRET) {
    res.status(500).json({ error: '로그인 설정이 없습니다 (SESSION_SECRET).' });
    return;
  }

  // Vercel 이 JSON 본문을 자동으로 풀어주지만, 문자열로 올 때도 있어 둘 다 받는다.
  let body = req.body || {};
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }

  const id = String(body.id || '').trim();
  const password = body.password || '';
  if (!id || !password) {
    res.status(400).json({ error: '아이디와 비밀번호를 적어 주세요.' });
    return;
  }

  try {
    const r = await fetch(SSO_LOGIN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: id, password: password }),
    });
    if (!r.ok) {
      let m = '아이디 또는 비밀번호가 맞지 않습니다.';
      try { const e = await r.json(); if (e && e.message) m = e.message; } catch (x) {}
      res.status(401).json({ error: m });
      return;
    }
    let info = {};
    try { info = await r.json(); } catch (x) {}
    const u = (info && (info.user || info.data)) || info || {};

    const name = String(u.name || u.username || id).trim();
    const dept = String(u.dept || u.department || u.team || '').trim();

    // 관리자 판단 — 기존 폼의 관리자 명부(app_config.overhaul_admins)는 그대로 두고,
    // 여기서는 아이디만 넘긴다. 화면이 기존 방식으로 관리자 여부를 판단한다.
    const token = signToken({ sub: id, name: name, dept: dept }, 60 * 60 * 24 * 30);

    res.status(200).json({ ok: true, token: token, id: id, name: name, dept: dept });
  } catch (e) {
    res.status(502).json({ error: '로그인 확인 중 오류: ' + String(e && e.message ? e.message : e) });
  }
};
