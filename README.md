# 상륙부대 공병단의 지뢰찾기 (Sonar Sweep)

지뢰찾기 + 상륙 작전 전투 시뮬레이션을 합친 단일 HTML 게임. 게임 정적 호스팅과 공유 랭킹 API(KV)를 Cloudflare Worker 하나로 배포한다.
배포 주소로 접속한 **모든 사람이 같은 랭킹**을 보고 등록한다.
(claude.ai 아티팩트판은 CSP로 외부 요청이 막혀 있어 자동으로 "로컬 기록" 모드로 폴백된다 — 게임 코드는 동일 파일 하나다.)

**라이브**: https://sonar-sweep-rank.dpm-plus-inc.workers.dev

## 저장소 구조

```
public/index.html   게임 본체 — 단일 HTML(SoT). 빌드 단계 없음, 이 파일을 직접 수정한다.
worker.js           랭킹 API + 정적 자산 서빙 (Cloudflare Worker)
wrangler.toml       Worker/KV 바인딩 설정
```

## 게임

- **클래식 모드** — 표준 지뢰찾기. 타일 웨이브·파편 연출, 코드(chord) 개방, 최고 기록 저장.
- **작전 모드**(기본) — 카운트다운 동안 공병이 지뢰에 깃발을 꽂아 길을 열고, 돌격이 시작되면 병사들이 깃발 칸을 피해 행군한다. 살아남은 병력이 적 벙커(◎)를 파괴하면 승리.
  - 타일을 열 때마다 돌격 시각이 늦춰진다(시작 시간이 상한).
  - 지뢰를 직접 터뜨리면 적 벙커가 최대 체력의 20%만큼 강화된다.
  - 조기 돌격 시 남은 시간 비율에 비례해 증원을 받는다.
- 난이도: 초급 9×9 / 중급 16×16 / 고급 24×16. 배속 ×1·×2·×4.

수치 튜닝은 `public/index.html` 안의 `PROTO` 상수 블록에 모여 있다.

## 배포

```bash
npm install -g wrangler
wrangler login
wrangler deploy
```

게임을 수정한 뒤에는 `wrangler deploy`만 다시 실행하면 된다.

최초 1회 KV 네임스페이스를 새로 만들 경우:

```bash
wrangler kv namespace create RANKS
```

출력된 id를 `wrangler.toml`의 `[[kv_namespaces]] id`에 넣는다.

## 랭킹 API

| 메서드 | 경로 | 설명 |
|---|---|---|
| GET | `/api/top?d=easy\|medium\|hard` | 난이도별 상위 10 `[{n,d,s,t,m,ts}]` |
| POST | `/api/score` | `{n:호출명≤12자, d:난이도, s:생존, t:초, m:오폭}` 등록 |

- 정렬: 생존자 많은 순 → 시간 짧은 순 → 오폭 적은 순. 난이도별 상위 100건 보관.
- 검증: 이름 특수문자 제거·12자 제한, 수치 범위 체크. (프로토타입 수준 — 치팅 방지 없음)
- KV 특성상 동시 등록이 겹치면 마지막 쓰기가 이긴다(소규모 트래픽 전제).

## 로컬 확인

`public/index.html`을 브라우저로 열면 게임은 그대로 돌아간다(랭킹만 로컬 폴백).
API까지 함께 확인하려면 `wrangler dev`.
