-- 상륙부대 공병단의 지뢰찾기 — 랭킹 스키마 (Cloudflare D1)
-- 적용:  npx wrangler d1 execute sonar-sweep-ranks --remote --file=./schema.sql
-- 로컬:  npx wrangler d1 execute sonar-sweep-ranks --local  --file=./schema.sql

-- 기록 한 줄 = 한 판. 삭제하지 않고 시즌 번호로만 구분한다.
-- s=생존 병력, cs=클리어 시간(1/100초), m=오폭 횟수, ts=등록 시각(ms)
CREATE TABLE IF NOT EXISTS scores (
  id     INTEGER PRIMARY KEY AUTOINCREMENT,
  season INTEGER NOT NULL,
  diff   TEXT    NOT NULL,
  name   TEXT    NOT NULL,
  s      INTEGER NOT NULL,
  cs     INTEGER NOT NULL,
  m      INTEGER NOT NULL,
  ts     INTEGER NOT NULL
);

-- 순위 질의(ORDER BY s DESC, cs, m, ts)를 그대로 태우는 복합 인덱스
CREATE INDEX IF NOT EXISTS idx_scores_rank
  ON scores (season, diff, s DESC, cs ASC, m ASC, ts ASC);

-- 시즌 마감 시 확정된 1~3위 스냅샷.
-- 원본 scores가 남아 있어도 따로 두는 이유: 나중에 정렬 규칙을 바꿔도 과거 순위가 흔들리지 않게 하려고.
CREATE TABLE IF NOT EXISTS hall_of_fame (
  season   INTEGER NOT NULL,
  diff     TEXT    NOT NULL,
  place    INTEGER NOT NULL,           -- 1, 2, 3
  name     TEXT    NOT NULL,
  s        INTEGER NOT NULL,
  cs       INTEGER NOT NULL,
  m        INTEGER NOT NULL,
  ts       INTEGER NOT NULL,
  closed_at INTEGER NOT NULL,          -- 시즌을 마감한 시각(ms)
  PRIMARY KEY (season, diff, place)
);

-- 단일 값 보관 (현재 시즌 번호 등)
CREATE TABLE IF NOT EXISTS meta (
  k TEXT PRIMARY KEY,
  v TEXT NOT NULL
);

INSERT OR IGNORE INTO meta (k, v) VALUES ('season', '1');
