// 상륙부대 공병단의 지뢰찾기 — 공유 랭킹 API + 게임 정적 호스팅 (Cloudflare Worker)
// GET  /api/top?d=easy|medium|hard  → 상위 10 기록 JSON
// POST /api/score {n,d,s,t,m}      → 기록 등록 (난이도별 상위 100 보관)
// 그 외 경로                        → public/ 정적 자산(게임 HTML)

const DIFFS = ["easy", "medium", "hard"];

export default {
  async fetch(req, env) {
    const url = new URL(req.url);

    if (url.pathname === "/api/top" && req.method === "GET") {
      const d = url.searchParams.get("d");
      if (!DIFFS.includes(d)) return json([]);
      const rows = JSON.parse((await env.RANKS.get("top:" + d)) || "[]");
      return json(rows.slice(0, 10));
    }

    if (url.pathname === "/api/score" && req.method === "POST") {
      let body;
      try { body = await req.json(); } catch (e) { return json({ ok: false }, 400); }
      const rec = sanitize(body);
      if (!rec) return json({ ok: false }, 400);
      const key = "top:" + rec.d;
      const rows = JSON.parse((await env.RANKS.get(key)) || "[]");
      rows.push(rec);
      rows.sort((a, b) => b.s - a.s || a.t - b.t || a.m - b.m); // 생존↓ 시간↑ 오폭↑
      await env.RANKS.put(key, JSON.stringify(rows.slice(0, 100)));
      return json({ ok: true });
    }

    return env.ASSETS.fetch(req);
  },
};

function sanitize(b) {
  if (!b || typeof b !== "object") return null;
  const n = String(b.n || "").replace(/[<>&"'`]/g, "").trim().slice(0, 12);
  const d = b.d, s = b.s | 0, t = b.t | 0, m = b.m | 0;
  if (!n || !DIFFS.includes(d)) return null;
  if (s < 0 || s > 60 || t < 1 || t > 5400 || m < 0 || m > 99) return null;
  return { n, d, s, t, m, ts: Date.now() };
}

function json(x, status = 200) {
  return new Response(JSON.stringify(x), {
    status,
    headers: { "content-type": "application/json" },
  });
}
