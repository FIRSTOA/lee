// =============================================================================
// /api/wip — 오버홀 '작업 중' 목록 (2026-11-27)
//
//   GET  /api/wip?scope=mine        내가 시작해 놓고 아직 안 끝낸 것
//   GET  /api/wip?scope=all         남이 시작한 것까지 전부 (넘겨받아 끝낼 때)
//   POST { action:'start',  ... }   오버홀 시작 → 한 줄 생김
//   POST { action:'done',   id }    완료 → 그 줄 닫힘
//   POST { action:'cancel', id }    잘못 눌렀을 때 되돌림
//
//   모두 로그인(출입증) 필요. 출입증이 없으면 401.
//
//   왜 서버를 거치나:
//     폼이 쓰는 공개 열쇠로 이 표를 직접 열면 작업 기록(입고처=거래처명)이
//     브라우저만 열면 다 보인다. 그래서 표는 잠그고(RLS), 서버만 service 열쇠로 연다.
//
//   ※ 백오피스 창고 바꾸기는 다음 단계에서 붙인다.
//      지금은 bo_start_ok / bo_done_ok 를 false 로 남겨만 둔다.
// =============================================================================
const { requireAuth } = require('./_auth.js');

const OH_URL = 'https://ilppbxhigxnelbnuxwyt.supabase.co';
const OH_KEY = (process.env.OH_SUPA_KEY || '').trim();

// 백오피스 재고 창구 (2026-11-27)
//   시작 → 수리실로, 완료 → PM 대기실로, 폐기 → 재고에서 뺀다.
//   ⚠ 여기서 실패해도 폼 작업은 막지 않는다. 못 넘긴 건 bo_error 에 적어 두고
//      나중에 따로 모아 보여준다("저장은 됐는데 창고만 안 바뀐" 상태를 숨기지 않는다).
const BO_URL = 'https://first-as-search.vercel.app/api/overhaul-stock';
const BO_TOKEN = (process.env.BO_STOCK_TOKEN || '').trim();
const ROOMS = ['1수리실', '2수리실', '3수리실'];
const PM_ROOM = 'PM 대기실';

async function boApply(payload) {
  if (!BO_TOKEN) return { ok: false, error: '백오피스 연결 설정이 없습니다 (BO_STOCK_TOKEN)' };
  try {
    const r = await fetch(BO_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-overhaul-token': BO_TOKEN },
      body: JSON.stringify(payload),
    });
    let j = {};
    try { j = await r.json(); } catch (e) {}
    if (r.ok && j && j.ok) return { ok: true, data: j };
    return { ok: false, error: (j && j.error) ? j.error : ('백오피스 응답 ' + r.status) };
  } catch (e) {
    return { ok: false, error: String(e && e.message ? e.message : e) };
  }
}

const COLS = 'id,asset_no,serial_no,model,incoming,in_date,reason,room,room_etc,' +
             'started_by,started_name,started_dept,started_at,' +
             'done_by,done_name,done_at,state,bo_start_ok,bo_done_ok,bo_error,memo';

async function sb(path, init) {
  const o = init || {};
  const r = await fetch(OH_URL + '/rest/v1/' + path, {
    method: o.method || 'GET',
    headers: Object.assign({
      apikey: OH_KEY,
      Authorization: 'Bearer ' + OH_KEY,
      'Content-Type': 'application/json',
    }, o.headers || {}),
    body: o.body,
  });
  const text = await r.text();
  let data = null;
  if (text) { try { data = JSON.parse(text); } catch (e) { data = text; } }
  if (!r.ok) {
    const msg = (data && data.message) ? data.message : String(text || r.status);
    throw new Error(msg);
  }
  return data;
}

const S = (v) => { const s = String(v == null ? '' : v).trim(); return s || null; };

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!OH_KEY) { res.status(500).json({ error: '작업 목록 설정이 없습니다 (OH_SUPA_KEY).' }); return; }

  const me = requireAuth(req);
  if (!me) { res.status(401).json({ error: '로그인이 필요합니다.' }); return; }

  try {
    // ---------------------------------------------------------------- 조회
    if (req.method === 'GET') {
      const scope = String((req.query && req.query.scope) || 'mine');
      let q = 'overhaul_wip?select=' + COLS + '&state=eq.ing&order=started_at.asc&limit=200';
      if (scope !== 'all') q += '&started_by=eq.' + encodeURIComponent(me.sub);
      const rows = await sb(q);
      res.status(200).json({ ok: true, scope: scope, rows: rows || [] });
      return;
    }

    if (req.method !== 'POST') { res.status(405).json({ error: 'GET 또는 POST 만 받습니다.' }); return; }

    let body = req.body || {};
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
    const action = String(body.action || '');

    // ---------------------------------------------------------------- 시작
    if (action === 'start') {
      const room = S(body.room);
      if (!room) { res.status(400).json({ error: '수리실을 골라 주세요.' }); return; }
      const serial = S(body.serial_no);
      const asset  = S(body.asset_no);
      if (!serial && !asset) { res.status(400).json({ error: '시리얼 또는 자산번호가 있어야 합니다.' }); return; }

      // 같은 기기를 두 번 시작하지 않게 막는다 (누가 시작했든)
      const or = [];
      if (serial) or.push('serial_no.eq.' + serial);
      if (asset)  or.push('asset_no.eq.' + asset);
      const dup = await sb('overhaul_wip?select=id,started_name,room,started_at&state=eq.ing&or=(' + encodeURIComponent(or.join(',')) + ')&limit=1');
      if (dup && dup.length) {
        const d = dup[0];
        res.status(409).json({
          error: '이미 작업 중인 기기입니다 (' + (d.started_name || '') + ' · ' + (d.room || '') + ').',
          wip: d,
        });
        return;
      }

      const row = {
        asset_no: asset, serial_no: serial,
        model: S(body.model), incoming: S(body.incoming),
        in_date: S(body.in_date), reason: S(body.reason),
        room: room, room_etc: S(body.room_etc),
        started_by: me.sub, started_name: me.name || me.sub, started_dept: S(body.dept) || S(me.dept),
        state: 'ing', memo: S(body.memo),
      };
      const ins = await sb('overhaul_wip?select=' + COLS, {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify(row),
      });
      const made = (ins && ins[0]) || null;

      // 백오피스 창고를 그 수리실로 옮긴다 ('기타'는 백오피스에 없는 칸이라 건너뛴다)
      let bo = { ok: false, error: null };
      if (made && ROOMS.indexOf(room) >= 0) {
        bo = await boApply({ serial: serial, asset: asset, warehouse: room, by: me.name || me.sub });
        try {
          await sb('overhaul_wip?id=eq.' + encodeURIComponent(made.id), {
            method: 'PATCH',
            body: JSON.stringify({ bo_start_ok: bo.ok, bo_error: bo.ok ? null : bo.error, updated_at: new Date().toISOString() }),
          });
        } catch (e) {}
      } else if (made) {
        bo = { ok: false, error: '기타 위치라 백오피스 창고는 바꾸지 않았습니다' };
      }
      res.status(200).json({ ok: true, row: made, bo: bo });
      return;
    }

    // ---------------------------------------------------------------- 완료
    if (action === 'done') {
      const id = S(body.id);
      if (!id) { res.status(400).json({ error: '어느 기기인지 알 수 없습니다 (id).' }); return; }
      // 실적 pt 는 '완료한 사람' 것 (사용자 결정 2026-11-27).
      // 시작한 사람은 started_by 로 그대로 남는다.
      const patch = {
        state: 'done',
        done_by: me.sub, done_name: me.name || me.sub,
        done_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      if (S(body.memo)) patch.memo = S(body.memo);
      const up = await sb('overhaul_wip?id=eq.' + encodeURIComponent(id) + '&state=eq.ing&select=' + COLS, {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify(patch),
      });
      if (!up || !up.length) { res.status(404).json({ error: '작업 중인 기기가 아닙니다 (이미 끝났거나 취소됨).' }); return; }
      const done = up[0];

      // 작업이 끝났으니 백오피스 창고를 'PM 대기실'로 옮긴다
      let bo2 = await boApply({
        serial: done.serial_no, asset: done.asset_no,
        warehouse: PM_ROOM, by: me.name || me.sub,
      });
      try {
        await sb('overhaul_wip?id=eq.' + encodeURIComponent(id), {
          method: 'PATCH',
          body: JSON.stringify({ bo_done_ok: bo2.ok, bo_error: bo2.ok ? null : bo2.error, updated_at: new Date().toISOString() }),
        });
      } catch (e) {}
      res.status(200).json({ ok: true, row: done, bo: bo2 });
      return;
    }

    // ---------------------------------------------------------------- 폐기
    //   폐기한 내용 자체는 폼(오버홀) 쪽에 그대로 쌓고,
    //   백오피스는 재고에서 빠지게만 한다 (사용자 지시 2026-11-27).
    if (action === 'discard') {
      const serial = S(body.serial_no);
      const asset  = S(body.asset_no);
      if (!serial && !asset) { res.status(400).json({ error: '시리얼 또는 자산번호가 있어야 합니다.' }); return; }
      const bo3 = await boApply({ serial: serial, asset: asset, discard: true, by: me.name || me.sub });
      res.status(200).json({ ok: bo3.ok, error: bo3.ok ? undefined : bo3.error, bo: bo3 });
      return;
    }

    // ---------------------------------------------------------------- 취소
    if (action === 'cancel') {
      const id = S(body.id);
      if (!id) { res.status(400).json({ error: '어느 기기인지 알 수 없습니다 (id).' }); return; }
      const up = await sb('overhaul_wip?id=eq.' + encodeURIComponent(id) + '&state=eq.ing&select=id,started_by', {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ state: 'cancel', updated_at: new Date().toISOString(), memo: S(body.memo) }),
      });
      if (!up || !up.length) { res.status(404).json({ error: '작업 중인 기기가 아닙니다.' }); return; }
      res.status(200).json({ ok: true });
      return;
    }

    res.status(400).json({ error: '알 수 없는 요청입니다 (action).' });
  } catch (e) {
    res.status(500).json({ error: '작업 목록 처리 중 오류: ' + String(e && e.message ? e.message : e) });
  }
};
