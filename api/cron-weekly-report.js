// 매일 09:00 UTC(18:00 KST) 실행 — Vercel cron "0 9 * * *"
//  · 금요일: 주간보고 요약을 큐에 넣음 (봇이 폴링해서 발송)
//  · 토요일: 어제(금) 보고가 큐에 없으면 한 번 더 만든다 (금요일 1회 실패로 한 주가 통째로 누락되는 것 방지)
//  · 그 외 요일: 아무것도 안 함
// 수동 테스트/대시보드 버튼은 ?force=1 (오늘 날짜로 강제 적재)
const SUPA_URL = 'https://ilppbxhigxnelbnuxwyt.supabase.co';
const SUPA_KEY = 'sb_publishable_cLR46tr3ITMdCAR7L74ROQ_JEmErvNE';
const H = { apikey: SUPA_KEY, Authorization: 'Bearer ' + SUPA_KEY, 'Content-Type': 'application/json' };
const BASE = 'https://lee-zeta-one.vercel.app';
const KEEP = 40;   // 큐 보관 건수 (미발송 추적에 쓰므로 넉넉히)

function kst(){ return new Date(Date.now() + 9*3600*1000); }
async function loadQ(){ const r=await fetch(SUPA_URL+'/rest/v1/app_config?key=eq.report_queue&select=value',{headers:H}); const j=await r.json(); return (j&&j[0]&&Array.isArray(j[0].value))?j[0].value:[]; }
async function saveQ(list){ await fetch(SUPA_URL+'/rest/v1/app_config?on_conflict=key',{method:'POST',headers:{...H,Prefer:'resolution=merge-duplicates'},body:JSON.stringify({key:'report_queue',value:list})}); }

// 2026-11-06 — 카톡은 긴 글을 '전체보기'로 접고 링크 카드도 안 만든다.
// 짧은 요약 + 맨 끝 링크로 보내면 카드가 뜨고, 그 카드 그림이 report.html 실시간
// 스크린샷(og:image=thum.io)이라 부서별 표가 방에서 바로 보인다.
// 전문(미달 명단·AAR)은 카드를 눌러 들어가면 그대로 있다.
function briefOf(sum){
  const lines = String(sum || '').trim().split('\n');
  const head = lines[0] || '';
  const mvp  = lines.find(l => l.indexOf('\u{1F3C5}') === 0) || '';
  const depts = lines.map(l => {
    const m = /^\u2022\s*(\S+)\s+(\d+)\/(\d+)\uB300\s+(\d+)%/.exec(l);
    return (m && Number(m[3]) > 0) ? (m[1] + ' ' + m[4] + '%') : null;
  }).filter(Boolean);
  const warn = lines.find(l => l.indexOf('\u26A0\uFE0F') === 0);
  let under = 0;
  if (warn) { for (let i = lines.indexOf(warn) + 1; i < lines.length; i++) { const t = lines[i].trim(); if (!t || t.indexOf('\u{1F4CB}') === 0) break; under++; } }
  const l2 = [mvp, under ? '\u26A0\uFE0F \uBAA9\uD45C \uBBF8\uB2EC ' + under + '\uBA85' : ''].filter(Boolean).join('   ');
  return [head, l2, depts.length ? depts.join(' \u00B7 ') : ''].filter(Boolean).join('\n');
}
module.exports = async (req, res) => {
  try {
    const k = kst();
    const force = req.query && req.query.force === '1';
    const dow = k.getUTCDay();                          // KST 요일 (금=5, 토=6)
    if (!force && dow !== 5 && dow !== 6) { res.status(200).json({ ok: true, skipped: 'not Fri/Sat(KST)' }); return; }
    const catchup = !force && dow === 6;                // 토요일 = 어제(금)분 재시도

    // 보고 대상 날짜 — 토요일 재시도면 어제(금요일)
    const tgt = new Date(k.getTime());
    if (catchup) tgt.setUTCDate(tgt.getUTCDate() - 1);
    const md = (tgt.getUTCMonth()+1) + '/' + tgt.getUTCDate();

    const ym = req.query && req.query.ym ? String(req.query.ym) : '';
    const linkQs = 'type=week' + (ym ? '&ym=' + encodeURIComponent(ym) : '');
    // 재시도분은 제목 날짜를 금요일로 고정 (집계 범위는 동일)
    const sumQs = linkQs + (catchup ? '&asof=' + encodeURIComponent(md) : '');
    const day = (ym ? ('ym-' + ym + '-') : '') + tgt.getUTCFullYear() + '-' + (tgt.getUTCMonth()+1) + '-' + tgt.getUTCDate();

    const list = await loadQ();
    // 이미 그 날짜로 적재돼 있으면(크론이든 봇이든 수동이든) 할 일 없음
    if (!force && list.some(x => x.day === day)) { res.status(200).json({ ok: true, skipped: 'already queued ' + day }); return; }

    let sum = '';
    try { const r = await fetch(BASE + '/api/summary?' + sumQs); sum = await r.text(); } catch (e) {}
    // 요약을 못 받았으면 큐에 넣지 않는다 (예전에 '전체 0%' 잘못된 보고가 방으로 나간 적 있음)
    // 금요일에 실패해도 조용히 넘어간다 — 토요일 크론과 봇 폴링이 계속 다시 시도한다.
    if (!/^(📊|📈)/.test(String(sum || '').trim())) {
      res.status(200).json({ ok: false, skipped: 'summary unavailable', day: day, catchup: catchup, got: String(sum || '').slice(0, 120) });
      return;
    }

    // 링크에 주차(w=)를 붙여야 카톡이 지난주 카드를 재사용하지 않고 새로 읽어온다.
    const text = briefOf(sum) + '\n\n📄 부서별 표 · 미달 명단 · AAR 전문\n'
               + BASE + '/report.html?' + linkQs + '&w=' + encodeURIComponent(md);
    list.push({ id: Date.now(), text, sent: false, day: day, createdAt: new Date().toISOString(), src: force ? 'manual' : (catchup ? 'cron-sat' : 'cron-fri') });
    while (list.length > KEEP) list.shift();
    await saveQ(list);
    res.status(200).json({ ok: true, queued: true, catchup: catchup, day: day, text });
  } catch (e) {
    res.status(200).json({ ok: false, error: String(e) });
  }
};
