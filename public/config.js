"use strict";

  /* ---------- config ---------- */
  const DIFFS = {
    easy:   { cols: 9,  rows: 9,  mines: 10 },
    medium: { cols: 16, rows: 16, mines: 40 },
    hard:   { cols: 24, rows: 16, mines: 99 },
  };
  const WAVE_RADIUS = 3.6;      // tiles affected by the ripple
  const WAVE_STEP_MS = 38;      // delay per tile of distance
  const REVEAL_STEP_MS = 34;    // flood-fill visual stagger per BFS depth
  const FLAG_IMPACT_MS = 195;   // when the falling flag hits the tile (64% of .3s drop)
  const AUTO_CHARGE_MS = 900;   // 지뢰 전량 식별 후 자동 돌격까지의 여유

  // debris presets: n particles, speed px/s, upward kick, palette, size range, life s, gravity
  const SHARD_OPEN = { n: 11, speed: 115, up: 95,  colors: ["#2E5070", "#1E3450", "#152840", "#3FE0B0"], size: [2, 4.5], ttl: 0.5,  g: 560 };
  const SHARD_FLAG = { n: 14, speed: 95,  up: 60,  colors: ["#FFB454", "#FFD27A", "#8A6A34"],            size: [1.5, 3.5], ttl: 0.45, g: 500 };
  const SHARD_BOOM = { n: 39, speed: 270, up: 130, colors: ["#FF5D5D", "#FF9B6B", "#FFD27A", "#7A1D1D"], size: [2, 6],   ttl: 0.8,  g: 420 };
  const SHARD_MINE = { n: 6,  speed: 75,  up: 45,  colors: ["#FF5D5D", "#7A1D1D"],                       size: [1.5, 3], ttl: 0.4,  g: 450 };

  /* ---------- 작전 프로토 config ---------- */
  const PROTO = {
    prep:   { easy: 30, medium: 80, hard: 120 },   // 공병 작업(카운트다운) 시간, 초
    troops: { easy: 12, medium: 24, hard: 36 },    // 투입 병력
    hpPerSoldier: 4,       // 벙커 내구도 = 투입 병력 × 4 (초급 48 / 중급 96 / 고급 144)
    mistakeHp: 0.2,        // 지뢰 오폭 1회마다 벙커가 최대치의 이 비율만큼 강화
    openBonus: 0.2,        // 스윕 중 타일 1칸 열 때마다 돌격이 이만큼(초) 늦춰짐 (시작 시간이 상한)
    earlyBonusMax: 0.10,   // 조기 돌격 증원 상한 — 남은 시간 비율 × 병력의 10%
    spawnMs: 440,          // 병사 스폰 간격
    speed: 18,             // 행군 속도 px/s
    sprintMul: 1.6,        // 보드를 벗어나 벙커로 달려들 때 가속 배율
    blastTiles: 0.95,      // 지뢰 폭발 반경(타일)
    burstGapMs: 200,       // 점사 내 발사 간격 — 땅땅땅땅땅 (촘촘하게)
    reloadMs: 1840,        // 장전 대기 — 평균 발사율은 기존과 동일(528ms/발)
    burstShots: 6,         // 땅땅땅땅땅땅 — 연속 6발 쏘고 장전
    rangeTiles: 2.5,       // 벙커 사거리(타일)
    hitMs: 400,            // 병사 1인당 벙커 타격 간격
    attackDist: 72,        // 벙커 공격을 시작하는 사거리 px (원거리 사격)
    soldierHp: 3,          // 벙커 총알 세 발을 맞아야 전사 (지뢰는 즉사)
  };
  const bunkerHp = (d) => PROTO.troops[d] * PROTO.hpPerSoldier;
  // 링 한 겹 = 초급 벙커 HP. 중급은 2겹, 고급은 3겹에서 시작한다
  const HP_UNIT = PROTO.troops.easy * PROTO.hpPerSoldier;
  const SHARD_KILL ={ n: 8, speed: 130, up: 55, colors: ["#FF5D5D", "#FF9B6B", "#8FE8C4"], size: [1.5, 3.5], ttl: 0.5, g: 480 };
  const SHARD_LAND = { n: 5, speed: 55, up: 18, colors: ["#2E5070", "#1E3450", "#8A6A34"], size: [1, 2.5], ttl: 0.32, g: 520 };

  // 지뢰에 당한 병사 연출 — 일부는 폭풍에 떠올라 바닥을 튕기고 사라진다
  const RAGDOLL = {
    chance: 0.55,        // 나머지는 기존처럼 파편만 남기고 즉시 소멸
    speed: [70, 190],    // 폭심에서 밀려나는 수평 속도 px/s
    lift: [90, 250],     // 보통 체공 — 초기 상승 속도 px/s
    g: 620,              // 낙하 가속
    bounce: 0.42,        // 반발 계수
    friction: 0.62,      // 착지 때 수평 감속
    spin: 9,             // 회전 rad/s
    maxBounce: 2,
    rest: 0.45,          // 구르다 멈춘 뒤 사라지기까지(초)
    zoom: 0.55,          // 최고점에서의 확대율 — 1.55배
    // 가끔 한 명씩 크게 날아오른다 — 더 높이, 더 멀리, 더 빨리 돌고, 한 번 더 튕긴다
    dramaChance: 0.16,
    dramaLift: [310, 430],
    dramaSpeed: [150, 300],
    dramaSpin: 17,
    dramaZoom: 1.15,     // 극적 발사는 정점에서 2배 이상 — 화면 앞으로 튀어나오는 느낌
    dramaBounce: 3,
    maxLife: 6,          // 어떤 경우에도 이 시간(초)을 넘겨 남아 있지 않는다
  };
  const rnd = (r) => r[0] + Math.random() * (r[1] - r[0]);

  /* ---------- state ---------- */
  let diff = "medium";
  let cols, rows, mines;
  let grid = [];        // {mine, adj, open, flag}
  let els = [];
  let started = false, over = false;
  let openCount = 0, flagCount = 0;
  let timeCs = 0, timerOn = false;   // 경과 시간은 1/100초 단위 정수로 센다
  let flagMode = false;

  /* 작전 state — 단일 모드 (클래식 통합 제거) */
  const mode = "proto";
  let phase = "idle";              // proto: idle → sweep → assault → done
  let prepLeft = 0;
  let detCount = 0;
  let soldiers = [], warParts = [], tracers = [], spawnBag = [];
  let bunker = null, G = null;
  let troopsTotal = 0, spawnLeft = 0, spawnClock = 0, aliveCount = 0;
  let warRaf = 0, warTimer = 0, warLast = 0, doneAt = 0, statusClock = 0;
  let mistakeCount = 0;            // 플레이어가 직접 터뜨린 지뢰 수 → 벙커 강화
  let gameSpeed = 1, warNow = 0;   // 가속 배율과 전투 가상 시계(ms)
  let resultTimer = 0, countTimer = 0;   // 결과 팝업 지연·카운트업 타이머
  let timeAcc = 0, timeLastT = 0;  // 미션 타이머 실경과 누적(게임초)
  let prepLastT = 0;               // 카운트다운 마지막 틱 시각
  let autoChargeT = 0;             // 지뢰 전량 식별 → 자동 돌격 대기 타이머

  const $ = (id) => document.getElementById(id);
  const board = $("board"), wrap = $("boardWrap");
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- audio ---------- */
  const SFX = {
    on: true, ctx: null,
    ensure() {
      if (!this.ctx) { try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} }
      if (this.ctx && this.ctx.state === "suspended") this.ctx.resume();
    },
    tone(f0, f1, dur, type, gain) {
      if (!this.on) return;
      this.ensure();
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      const o = this.ctx.createOscillator(), g = this.ctx.createGain();
      o.type = type; o.frequency.setValueAtTime(f0, t);
      o.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), t + dur);
      g.gain.setValueAtTime(gain, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(this.ctx.destination);
      o.start(t); o.stop(t + dur + 0.02);
    },
    ping()   { this.tone(620, 940, 0.11, "sine", 0.045); },
    tick()   { this.tone(880, 720, 0.04, "sine", 0.02); },
    flag()   { this.tone(300, 380, 0.07, "square", 0.03); },
    unflag() { this.tone(380, 260, 0.07, "square", 0.025); },
    boom()   { this.tone(160, 36, 0.55, "sawtooth", 0.12); this.tone(90, 30, 0.7, "triangle", 0.1); },
    win() {
      [523, 659, 784, 1047].forEach((f, i) =>
        setTimeout(() => this.tone(f, f * 1.01, 0.18, "sine", 0.05), i * 110));
    },
    shot()  { this.tone(1150, 320, 0.06, "square", 0.03); },
    thud()  { this.tone(190, 120, 0.07, "square", 0.045); },
    die()   { this.tone(260, 70, 0.16, "sawtooth", 0.035); },
    horn() {
      this.tone(196, 392, 0.25, "triangle", 0.06);
      setTimeout(() => this.tone(262, 523, 0.3, "triangle", 0.06), 180);
    },
    resultTick(i) { this.tone(900 + (i % 2) * 140, 950, 0.03, "square", 0.025); },
    resultDing() {
      this.tone(880, 1320, 0.12, "sine", 0.05);
      setTimeout(() => this.tone(1174, 1760, 0.18, "sine", 0.05), 90);
    },
    stamp() {
      this.tone(150, 55, 0.22, "square", 0.08);      // 쿵 — 꽂히는 임팩트
      setTimeout(() => this.tone(880, 1320, 0.14, "sine", 0.05), 110);
    },
  };

