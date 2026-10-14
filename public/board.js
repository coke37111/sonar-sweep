  /* ---------- helpers ---------- */
  const idx = (r, c) => r * cols + c;
  const inB = (r, c) => r >= 0 && r < rows && c >= 0 && c < cols;
  function neighbors(i) {
    const r = (i / cols) | 0, c = i % cols, out = [];
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      if (!dr && !dc) continue;
      if (inB(r + dr, c + dc)) out.push(idx(r + dr, c + dc));
    }
    return out;
  }
  const pad3 = (n) => (n < 0 ? "-" + String(Math.min(99, -n)).padStart(2, "0")
                             : String(Math.min(999, n)).padStart(3, "0"));
  // HUD 타이머 — 초와 1/100초를 별도 노드로 갱신한다 (소수부만 작게 그리려고)
  function setClock(cs) {
    $("timerSec").textContent = pad3(Math.floor(cs / 100));
    $("timerCs").textContent = "." + String(cs % 100).padStart(2, "0");
  }
  const fmtSec = (cs) => (cs / 100).toFixed(2);   // 문장 표기 "57.32"

  function updateMineReadout() {
    const left = mines - flagCount - detCount;
    $("mineCount").textContent = pad3(left);
    $("mineCount").classList.toggle("alert", left < 0);
  }

  /* ---------- persistence (클래식 최고기록 UI 제거 — 랭킹으로 대체) ---------- */
  function loadBest() {}
  function saveBest() {}

  /* ---------- setup ---------- */
  function newGame() {
    portal.reset();
    ({ cols, rows, mines } = DIFFS[diff]);
    grid = Array.from({ length: cols * rows }, () => ({ mine: false, adj: 0, open: false, flag: false }));
    started = false; over = false; openCount = 0; flagCount = 0; timeCs = 0;
    timerOn = false;

    board.style.setProperty("--cols", cols);
    board.style.setProperty("--rows", rows);
    board.style.setProperty("--apr", mode === "proto" ? 3 : 0);
    board.classList.remove("shake");
    board.innerHTML = "";
    els = [];
    const frag = document.createDocumentFragment();
    for (let i = 0; i < cols * rows; i++) {
      const b = document.createElement("button");
      b.className = "cell";
      b.dataset.i = i;
      b.setAttribute("role", "gridcell");
      frag.appendChild(b);
      els.push(b);
    }
    board.appendChild(frag);

    $("mineCount").textContent = pad3(mines);
    $("mineCount").classList.remove("alert");
    setClock(0);
    $("resetBtn").textContent = "◎";
    $("resetBtn").className = "";
    setStatus(mode === "proto"
      ? '작전 대기 — 첫 스캔으로 공병 작업 개시<span class="blink">_</span>'
      : '해역 스캔 대기 중<span class="blink">_</span>', "");
    loadBest();
    fx.parts = [];
    resizeFx();
    $("apron").style.height = mode === "proto" ? els[0].offsetHeight * 3 + "px" : "0px";
    resetProto();
    setSpeed(1);                       // 새 게임은 항상 1배속으로 시작
    resizeWar();
  }

  function placeMines(safeIdx) {
    const banned = new Set([safeIdx, ...neighbors(safeIdx)]);
    let placed = 0;
    while (placed < mines) {
      const i = (Math.random() * grid.length) | 0;
      if (grid[i].mine || banned.has(i)) continue;
      grid[i].mine = true; placed++;
    }
    for (let i = 0; i < grid.length; i++) {
      if (grid[i].mine) continue;
      grid[i].adj = neighbors(i).filter((n) => grid[n].mine).length;
    }
  }

  // 마스터 루프에서 호출 — 실경과×배속 누적이라 타이머 스로틀에도 정확
  function missionTick(now) {
    timeAcc += (now - timeLastT) / 1000;
    timeLastT = now;
    const cs = Math.floor(timeAcc * 100);
    if (cs !== timeCs) { timeCs = cs; setClock(timeCs); }
  }

  function startTimer() {
    timeAcc = timeCs / 100;
    timeLastT = performance.now();
    timerOn = true;
  }

  function setStatus(html, cls) {
    const s = $("status");
    s.innerHTML = html;
    s.className = "status" + (cls ? " " + cls : "");
  }

  /* ---------- THE WAVE ---------- */
  function ripple(centerIdx, opts = {}) {
    if (reduceMotion) return;
    const cr = (centerIdx / cols) | 0, cc = centerIdx % cols;
    const radius = opts.radius || WAVE_RADIUS;
    const r0 = Math.max(0, Math.ceil(cr - radius)), r1 = Math.min(rows - 1, Math.floor(cr + radius));
    const c0 = Math.max(0, Math.ceil(cc - radius)), c1 = Math.min(cols - 1, Math.floor(cc + radius));
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
      const d = Math.hypot(r - cr, c - cc);
      if (d > radius) continue;
      const el = els[idx(r, c)];
      const amp = Math.min(1.3, (1 - d / (radius + 0.8)) * (opts.boost || 1)); // decay with distance
      el.classList.remove("wave");
      void el.offsetWidth;                            // restart if mid-animation
      el.style.setProperty("--wy", (-9 * amp).toFixed(1) + "px");
      el.style.setProperty("--ws", (1 + 0.07 * amp).toFixed(3));
      el.style.setProperty("--wb", (1.4 + 0.55 * amp).toFixed(2)); // near = brighter, far ≈ current

      el.style.animationDelay = Math.round(d * WAVE_STEP_MS) + "ms";
      el.classList.add("wave");
    }
  }

  // 클릭한 타일만 짧게 반짝 — 웨이브는 깃발·폭발 전용
  function flashCell(i) {
    if (reduceMotion) return;
    const el = els[i];
    el.classList.remove("flash");
    void el.offsetWidth;
    el.classList.add("flash");
  }

  function ping(i, color) {
    if (reduceMotion) return;
    const el = els[i];
    const p = document.createElement("div");
    p.className = "ping" + (color ? " " + color : "");
    p.style.left = el.offsetLeft + el.offsetWidth / 2 + "px";
    p.style.top = el.offsetTop + el.offsetHeight / 2 + "px";
    wrap.appendChild(p);
    p.addEventListener("animationend", () => p.remove(), { once: true });
  }

  /* ---------- debris particles (single canvas overlay) ---------- */
  const fx = { canvas: $("fx"), ctx: null, parts: [], running: false, last: 0, w: 0, h: 0 };
  try { fx.ctx = fx.canvas.getContext("2d"); } catch (e) {}

  function resizeFx() {
    if (!fx.ctx) return;
    const w = board.offsetWidth, h = board.offsetHeight;
    const dpr = window.devicePixelRatio || 1;
    fx.canvas.width = Math.round(w * dpr);
    fx.canvas.height = Math.round(h * dpr);
    fx.canvas.style.width = w + "px";
    fx.canvas.style.height = h + "px";
    fx.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    fx.w = w; fx.h = h;
  }
  window.addEventListener("resize", resizeFx);

  function spawnShards(i, cfg) {
    if (reduceMotion || !fx.ctx) return;
    if (fx.parts.length > 1000) return;                      // safety cap
    const el = els[i];
    const cx = el.offsetLeft + el.offsetWidth / 2;
    const cy = el.offsetTop + el.offsetHeight / 2;
    const n = fx.parts.length > 600 ? Math.ceil(cfg.n / 2) : cfg.n;
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2;
      const sp = cfg.speed * (0.4 + Math.random() * 0.9);
      fx.parts.push({
        x: cx, y: cy,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - cfg.up * (0.5 + Math.random()),
        rot: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 12,
        s: cfg.size[0] + Math.random() * (cfg.size[1] - cfg.size[0]),
        c: cfg.colors[(Math.random() * cfg.colors.length) | 0],
        t: 0, ttl: cfg.ttl * (0.7 + Math.random() * 0.6),
        g: cfg.g,
      });
    }
    if (!fx.running) { fx.running = true; fx.last = performance.now(); scheduleFx(); }
  }

  // rAF with a setTimeout fallback so particles still run when rAF is throttled
  function scheduleFx() {
    fx.raf = requestAnimationFrame(fxTick);
    fx.timer = setTimeout(fxTick, 40);
  }

  function fxTick() {
    cancelAnimationFrame(fx.raf);
    clearTimeout(fx.timer);
    const now = performance.now();
    const dt = Math.min(0.05, (now - fx.last) / 1000);
    fx.last = now;
    const ctx = fx.ctx;
    ctx.clearRect(0, 0, fx.w, fx.h);
    fx.parts = fx.parts.filter((p) => (p.t += dt) < p.ttl);
    for (const p of fx.parts) {
      p.vy += p.g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      ctx.globalAlpha = 1 - p.t / p.ttl;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.c;
      ctx.fillRect(-p.s / 2, -p.s / 2, p.s, p.s);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    if (fx.parts.length) scheduleFx();
    else { fx.running = false; ctx.clearRect(0, 0, fx.w, fx.h); }
  }

  board.addEventListener("animationend", (e) => {
    const el = e.target;
    if (el.classList && el.classList.contains("wave") && e.animationName === "wave") {
      el.classList.remove("wave");
      el.style.animationDelay = "";
    }
    if (e.animationName === "cellFlash") el.classList.remove("flash");
  });

  /* ---------- reveal logic ---------- */
  function paintOpen(i) {
    const cell = grid[i], el = els[i];
    el.classList.add("open");
    el.classList.remove("flagged");
    if (cell.adj > 0) {
      el.innerHTML = '<span class="n' + cell.adj + '">' + cell.adj + "</span>";
    } else {
      el.innerHTML = "";
    }
    spawnShards(i, SHARD_OPEN);                       // tile shatters as it opens
  }

  function floodReveal(startIdx) {
    // state updates immediately; visuals stagger by BFS depth
    const q = [[startIdx, 0]];
    const seen = new Set([startIdx]);
    let revealedAny = false, opened = 0;
    while (q.length) {
      const [i, d] = q.shift();
      const cell = grid[i];
      if (cell.open || cell.flag) continue;
      cell.open = true; openCount++; revealedAny = true; opened++;
      if (d === 0) paintOpen(i);
      else setTimeout(() => paintOpen(i), d * REVEAL_STEP_MS);
      if (d > 0 && d % 2 === 0 && !reduceMotion) setTimeout(() => SFX.tick(), d * REVEAL_STEP_MS);
      if (cell.adj === 0) {
        for (const n of neighbors(i)) {
          if (!seen.has(n) && !grid[n].mine) { seen.add(n); q.push([n, d + 1]); }
        }
      }
    }
    if (opened && mode === "proto" && phase === "sweep") {
      // 스캔 성과만큼 돌격이 늦춰진다 — 시작 시간을 넘지는 못한다
      prepLeft = Math.min(PROTO.prep[diff], prepLeft + opened * PROTO.openBonus);
      updatePrepBar();
      flashPrepGain();
    }
    return revealedAny;
  }

  async function reveal(i) {
    const cell = grid[i];
    if (cell.open || cell.flag) return;
    if (!started) {
      if (portal.starting()) return;
      const ticket = portal.ticket();
      await portal.begin(diff);
      if (!portal.current(ticket) || document.hidden) return;
      placeMines(i); started = true;
      startTimer();                                // 기록은 첫 클릭부터 — 공병 작업 시간도 포함된다
      if (mode === "proto") beginPrep();
      else setStatus("스캔 진행 중…", "");
    }
    if (cell.mine) {
      if (mode === "proto") { detonateMine(i, true); return; }
      explode(i); return;
    }
    floodReveal(i);
    SFX.ping();
    checkWin();
  }

  function chord(i) {
    const cell = grid[i];
    if (!cell.open || cell.adj === 0) return;
    const ns = neighbors(i);
    // 깃발 + 폭발한 크레이터 모두 "식별된 지뢰"로 센다
    const known = ns.filter((n) => grid[n].flag || grid[n].det).length;
    if (known !== cell.adj) return;
    for (const n of ns) {
      if (over) break;
      if (!grid[n].open && !grid[n].flag) {
        if (grid[n].mine) {
          if (mode === "proto") { detonateMine(n, true); continue; }
          explode(n); return;
        }
        floodReveal(n);
      }
    }
    SFX.ping();
    checkWin();
  }

  /* ---------- endings ---------- */
  function stopGame() {
    over = true;
    timerOn = false;
  }

  function explode(hitIdx) {
    stopGame();
    grid[hitIdx].open = true;
    const hr = (hitIdx / cols) | 0, hc = hitIdx % cols;
    els[hitIdx].classList.add("open", "boom");
    els[hitIdx].innerHTML = '<div class="dot"></div>';
    ping(hitIdx, "red");
    ripple(hitIdx, { radius: 6, boost: 1.3 });
    spawnShards(hitIdx, SHARD_BOOM);
    SFX.boom();

    // mines surface in a radial wave from the blast
    for (let i = 0; i < grid.length; i++) {
      const cell = grid[i], el = els[i];
      const d = Math.hypot(((i / cols) | 0) - hr, (i % cols) - hc);
      if (cell.mine && i !== hitIdx && !cell.flag) {
        setTimeout(() => {
          el.classList.add("open");
          el.innerHTML = '<div class="dot"></div>';
          spawnShards(i, SHARD_MINE);
        }, 120 + d * 30);
      } else if (!cell.mine && cell.flag) {
        setTimeout(() => el.classList.add("wrong"), 120 + d * 30);
      }
    }
    board.classList.add("shake");
    $("resetBtn").textContent = "✕";
    $("resetBtn").className = "lost";
    setStatus("기뢰 폭발 — 임무 실패. ◎ 버튼으로 재출항", "lose");
  }

  function celebrateSweep() {
    if (reduceMotion) return;
    const cr = (rows - 1) / 2, cc = (cols - 1) / 2;
    for (let i = 0; i < grid.length; i++) {
      const d = Math.hypot(((i / cols) | 0) - cr, (i % cols) - cc);
      const el = els[i];
      el.style.animationDelay = Math.round(d * 45) + "ms";
      el.classList.add("winwave");
      setTimeout(() => { el.classList.remove("winwave"); el.style.animationDelay = ""; },
        Math.round(d * 45) + 800);
    }
  }

  function checkWin() {
    if (over) return;
    if (mode === "proto") {                        // 프로토에선 전체 스캔은 정찰 완료일 뿐, 승리가 아님
      if (openCount === grid.length - mines && phase === "sweep")
        setStatus("전 해역 스캔 완료 — 돌격 준비", "win");
      return;
    }
    if (openCount !== grid.length - mines) return;
    stopGame();
    // auto-flag remaining mines
    for (let i = 0; i < grid.length; i++) {
      if (grid[i].mine && !grid[i].flag) {
        grid[i].flag = true;
        els[i].classList.add("flagged");
        els[i].innerHTML = "<span>⚑</span>";
      }
    }
    $("mineCount").textContent = pad3(0);
    $("resetBtn").textContent = "✓";
    $("resetBtn").className = "won";
    setStatus("전 해역 정리 완료 — 임무 성공 · " + fmtSec(timeCs) + "초", "win");
    saveBest(timeCs);
    SFX.win();

    // celebratory sweep from board center
    celebrateSweep();
  }

  /* ---------- flags ---------- */
  // 깃발 상한에 걸렸을 때 — 카운터를 짧게 튕겨 이유를 알린다
  function denyFlag() {
    const el = $("mineCount");
    el.classList.remove("deny");
    void el.offsetWidth;                 // restart the animation
    el.classList.add("deny");
    setTimeout(() => el.classList.remove("deny"), 300);
    SFX.unflag();
  }


  function toggleFlag(i) {
    const cell = grid[i];
    if (cell.open) return;
    // 깃발은 지뢰 수를 넘을 수 없다 (폭발한 크레이터도 식별된 지뢰로 센다)
    if (!cell.flag && flagCount + detCount >= mines) { denyFlag(); return; }
    cell.flag = !cell.flag;
    flagCount += cell.flag ? 1 : -1;
    const el = els[i];
    el.classList.toggle("flagged", cell.flag);
    el.innerHTML = cell.flag ? "<span>⚑</span>" : "";
    updateMineReadout();
    if (cell.flag) {
      // shockwave + dust fire when the falling flag actually lands;
      // if a button is still held at landing, the shockwave waits for release
      const fire = () => {
        if (grid[i] !== cell || !cell.flag) return;   // unflagged / new game meanwhile
        ping(i, "amber");                             // 충격파 링만 — 타일 꿀렁은 없음
        spawnShards(i, SHARD_FLAG);
        SFX.flag();
      };
      setTimeout(() => {
        if (anyButtonDown) pendingShock.push(fire);
        else fire();
      }, reduceMotion ? 0 : FLAG_IMPACT_MS);
    } else {
      SFX.unflag();
    }
    maybeAutoCharge();
  }

  /* ================= 작전 프로토 (operation prototype) ================= */
  const consoleEl = $("console");
  const war = { canvas: $("war"), ctx: null };
  try { war.ctx = war.canvas.getContext("2d"); } catch (e) {}

  function resizeWar() {
    if (!war.ctx) return;
    const w = consoleEl.clientWidth, h = consoleEl.clientHeight;
    const dpr = window.devicePixelRatio || 1;
    war.canvas.width = Math.round(w * dpr);
    war.canvas.height = Math.round(h * dpr);
    war.canvas.style.width = w + "px";
    war.canvas.style.height = h + "px";
    war.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (G) computeGeom();
  }

  function computeGeom() {
    const conR = consoleEl.getBoundingClientRect();
    const wrR = wrap.getBoundingClientRect();
    const btnR = $("resetBtn").getBoundingClientRect();
    const w = els[0].offsetWidth, h = els[0].offsetHeight;
    const wrapX = wrR.left - conR.left, wrapY = wrR.top - conR.top;
    G = {
      w, h, wrapX, wrapY,
      pitchX: cols > 1 ? els[1].offsetLeft - els[0].offsetLeft : w + 4,
      pitchY: rows > 1 ? els[cols].offsetTop - els[0].offsetTop : h + 4,
      colCX: Array.from({ length: cols }, (_, c) => wrapX + els[c].offsetLeft + w / 2),
      rowCY: Array.from({ length: rows }, (_, r) => wrapY + els[r * cols].offsetTop + h / 2),
      topY: wrapY + els[0].offsetTop,
      botY: wrapY + els[0].offsetTop + board.offsetHeight,
      bx: btnR.left + btnR.width / 2 - conR.left,
      by: btnR.top + btnR.height / 2 - conR.top,
    };
  }

  const rowAt = (y) => Math.floor((y - (G.rowCY[0] - G.pitchY / 2)) / G.pitchY);
  // hp(절대값)를 48짜리 겹으로 나눠 링에 칠한다 — 빨강 → 노랑 → 초록 → 파랑 순으로 쌓인다.
  // 4겹(192)을 넘는 분량은 표시하지 않는다(파랑이 가득 찬 상태로 유지)
  const ringSet = (hp) => {
    const el = $("hpRing"), u = Math.max(0, hp) / HP_UNIT;
    for (let k = 1; k <= 4; k++) {
      el.style.setProperty("--hp" + k, Math.max(0, Math.min(1, u - (k - 1))));
    }
  };

  function resetProto() {
    phase = "idle";
    detCount = 0; mistakeCount = 0;
    clearTimeout(autoChargeT); autoChargeT = 0;
    $("toasts").innerHTML = "";
    clearTimeout(resultTimer); hideResult();
    soldiers = []; warParts = []; tracers = []; spawnBag = [];
    bunker = null; G = null;
    if (war.ctx) war.ctx.clearRect(0, 0, war.canvas.width, war.canvas.height);
    $("prepBar").classList.remove("show");
    $("prepFill").style.width = "100%";
    $("hpRing").classList.remove("show");
    ringSet(bunkerHp(diff));
    $("resetBtn").classList.remove("enemy");
    $("chargeBtn").classList.remove("show");
    $("chargeBtn").textContent = "▶ 조기 돌격";
  }

