// 상륙부대 공병단의 지뢰찾기 — 시즌제 랭킹 API + 게임 정적 호스팅 (Cloudflare Worker)
//
// GET  /api/top?d=easy|medium|hard[&season=N]  → 해당 시즌 상위 10 + 현재 시즌 번호
// GET  /api/season                             → 현재 시즌 번호, 마감된 시즌 목록
// GET  /api/hall[?season=N]                    → 명예의 전당(난이도별 1~3위)
// POST /api/score {n,d,s,cs,m}                 → 현재 시즌에 기록 등록
// POST /api/admin/close-season                 → 시즌 마감 + 번호 증가 (관리자 토큰 필요)
// POST /api/admin/migrate                      → 옛 KV 기록을 시즌 1로 이관 (관리자 토큰 필요)
// 그 외 경로                                    → public/ 정적 자산(게임 HTML)
//
// 기록은 지우지 않는다. "초기화"는 시즌 번호를 올리는 것이고, 지난 기록은 그대로 남는다.
// 정렬은 생존↓ → 시간↑ → 오폭↑ → 먼저 등록한 순. SQL ORDER BY가 그대로 이 규칙이다.

const DIFFS = ["easy", "medium", "hard"];
const ORDER = "ORDER BY s DESC, cs ASC, m ASC, ts ASC";

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const p = url.pathname;

    try {
      if (p === "/api/top" && req.method === "GET") return await getTop(url, env);
      if (p === "/api/season" && req.method === "GET") return await getSeason(env);
      if (p === "/api/hall" && req.method === "GET") return await getHall(url, env);
      if (p === "/api/score" && req.method === "POST") return await postScore(req, env);
      if (p === "/api/admin/close-season" && req.method === "POST") return await closeSeason(req, env);
      if (p === "/api/admin/migrate" && req.method === "POST") return await migrate(req, env);
    } catch (e) {
      return json({ ok: false, error: String(e && e.message || e) }, 500);
    }

    return env.ASSETS.fetch(req);
  },

  // 자동 마감 — wrangler.toml의 [triggers] crons 설정이 있을 때만 동작한다
  async scheduled(event, env) {
    await bumpSeason(env);
  },
};

/* ---------- 시즌 ---------- */

async function currentSeason(env) {
  const row = await env.DB.prepare("SELECT v FROM meta WHERE k = 'season'").first();
  return row ? parseInt(row.v, 10) || 1 : 1;
}

// 마감: 현재 시즌의 난이도별 1~3위를 명예의 전당에 확정 저장하고 번호를 올린다.
// scores는 건드리지 않으므로 지난 시즌 전체 순위도 계속 조회할 수 있다.
async function bumpSeason(env) {
  const season = await currentSeason(env);
  const closedAt = Date.now();
  const stmts = [];

  for (const d of DIFFS) {
    const { results } = await env.DB.prepare(
      `SELECT name, s, cs, m, ts FROM scores WHERE season = ? AND diff = ? ${ORDER} LIMIT 3`
    ).bind(season, d).all();
    (results || []).forEach((r, i) => {
      stmts.push(env.DB.prepare(
        `INSERT OR REPLACE INTO hall_of_fame (season, diff, place, name, s, cs, m, ts, closed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(season, d, i + 1, r.name, r.s, r.cs, r.m, r.ts, closedAt));
    });
  }
  stmts.push(env.DB.prepare("UPDATE meta SET v = ? WHERE k = 'season'").bind(String(season + 1)));
  await env.DB.batch(stmts);
  return { closed: season, next: season + 1, medals: stmts.length - 1 };
}

async function getSeason(env) {
  const season = await currentSeason(env);
  const { results } = await env.DB.prepare(
    "SELECT DISTINCT season FROM hall_of_fame ORDER BY season DESC"
  ).all();
  return json({ season, closed: (results || []).map((r) => r.season) });
}

async function closeSeason(req, env) {
  if (!authed(req, env)) return json({ ok: false }, 401);
  return json({ ok: true, ...(await bumpSeason(env)) });
}

/* ---------- 조회 ---------- */

async function getTop(url, env) {
  const d = url.searchParams.get("d");
  const season = url.searchParams.get("season")
    ? parseInt(url.searchParams.get("season"), 10)
    : await currentSeason(env);
  if (!DIFFS.includes(d) || !Number.isFinite(season)) return json({ season: 0, rows: [] });
  const { results } = await env.DB.prepare(
    `SELECT name AS n, s, cs, m, ts FROM scores WHERE season = ? AND diff = ? ${ORDER} LIMIT 10`
  ).bind(season, d).all();
  return json({ season, rows: results || [] });
}

async function getHall(url, env) {
  const q = url.searchParams.get("season");
  const stmt = q
    ? env.DB.prepare(
        "SELECT season, diff, place, name AS n, s, cs, m FROM hall_of_fame WHERE season = ? ORDER BY diff, place"
      ).bind(parseInt(q, 10) || 0)
    : env.DB.prepare(
        "SELECT season, diff, place, name AS n, s, cs, m FROM hall_of_fame ORDER BY season DESC, diff, place"
      );
  const { results } = await stmt.all();
  return json({ rows: results || [] });
}

/* ---------- 등록 ---------- */

async function postScore(req, env) {
  let body;
  try { body = await req.json(); } catch (e) { return json({ ok: false }, 400); }
  const rec = sanitize(body);
  if (!rec) return json({ ok: false }, 400);
  const season = await currentSeason(env);
  // 단순 INSERT라 동시 등록이 서로를 덮어쓸 수 없다 (KV 시절 read-modify-write 문제 해소)
  await env.DB.prepare(
    "INSERT INTO scores (season, diff, name, s, cs, m, ts) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).bind(season, rec.d, rec.n, rec.s, rec.cs, rec.m, rec.ts).run();
  return json({ ok: true, season });
}

function sanitize(b) {
  if (!b || typeof b !== "object") return null;
  const n = String(b.n || "").replace(/[<>&"'`]/g, "").trim().slice(0, 12);
  const d = b.d, s = b.s | 0, m = b.m | 0;
  // cs(1/100초)가 정식 필드. 옛 클라이언트는 t(초)만 보내므로 환산해서 받는다.
  const cs = b.cs != null ? b.cs | 0 : (b.t | 0) * 100;
  if (!n || !DIFFS.includes(d)) return null;
  if (s < 0 || s > 60 || m < 0 || m > 99) return null;
  if (cs < 1 || cs > 540000) return null;
  return { n, d, s, cs, m, ts: Date.now() };
}

/* ---------- 관리 ---------- */

// 토큰은 `npx wrangler secret put ADMIN_TOKEN`으로 등록한다. 없으면 관리 API는 전부 잠긴다.
function authed(req, env) {
  const want = env.ADMIN_TOKEN;
  if (!want) return false;
  const got = req.headers.get("authorization") || "";
  return got === "Bearer " + want;
}

// KV에 남아 있던 옛 기록을 시즌 1로 옮긴다. 한 번만 실행하면 된다.
async function migrate(req, env) {
  if (!authed(req, env)) return json({ ok: false }, 401);
  if (!env.RANKS) return json({ ok: false, error: "no KV binding" }, 400);
  const stmts = [];
  for (const d of DIFFS) {
    const rows = JSON.parse((await env.RANKS.get("top:" + d)) || "[]");
    for (const r of rows) {
      const cs = r.cs != null ? r.cs | 0 : (r.t | 0) * 100;
      if (!r.n || cs < 1) continue;
      stmts.push(env.DB.prepare(
        "INSERT INTO scores (season, diff, name, s, cs, m, ts) VALUES (1, ?, ?, ?, ?, ?, ?)"
      ).bind(d, String(r.n).slice(0, 12), r.s | 0, cs, r.m | 0, r.ts || Date.now()));
    }
  }
  if (stmts.length) await env.DB.batch(stmts);
  return json({ ok: true, moved: stmts.length });
}

function json(x, status = 200) {
  return new Response(JSON.stringify(x), {
    status,
    headers: { "content-type": "application/json" },
  });
}
