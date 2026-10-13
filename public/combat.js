  // 전장 이벤트 토스트 — 위에서 떠올랐다 2초 뒤 사라진다
  function toast(msg, cls) {
    const box = $("toasts");
    const t = document.createElement("div");
    t.className = "toast" + (cls ? " " + cls : "");
    t.textContent = msg;
    box.prepend(t);                              // 새 토스트가 맨 위 — 먼저 뜬 것들이 아래로 밀린다
    t.addEventListener("animationend", (e) => { if (e.animationName === "toastOut") t.remove(); });
    setTimeout(() => t.remove(), 3200);          // reduced-motion 등 애니메이션 미발화 대비
    while (box.children.length > 3) box.lastChild.remove();
  }

  // 남은 시간에 비례한 조기 돌격 증원 (최대 병력의 10%)
  function earlyBonus() {
    const frac = Math.max(0, prepLeft) / PROTO.prep[diff];
    return Math.round(PROTO.troops[diff] * PROTO.earlyBonusMax * frac);
  }

  function updateChargeBtn() {
    const b = earlyBonus();
    $("chargeBtn").textContent = "▶ 조기 돌격" + (b > 0 ? " (+" + b + ")" : "");
  }

  function updatePrepBar() {
    $("prepFill").style.width = Math.min(100, prepLeft / PROTO.prep[diff] * 100) + "%";
    $("prepLabel").textContent = "돌격까지 " + Math.ceil(prepLeft) + "초";
  }

  function flashPrepGain() {
    const f = $("prepFill");
    f.classList.add("gain");
    clearTimeout(flashPrepGain.t);
    flashPrepGain.t = setTimeout(() => f.classList.remove("gain"), 280);
  }

  // 지뢰가 전부 식별되면(깃발 또는 폭발) 공병 작업은 끝난 것 — 남은 시간은 증원으로
  const allMinesFound = () => grid.every((c) => !c.mine || c.flag || c.det);

  function maybeAutoCharge() {
    if (mode !== "proto" || phase !== "sweep" || autoChargeT) return;
    if (!allMinesFound()) return;
    const eb = earlyBonus();
    setStatus("전 지뢰 식별 완료 — 자동 조기 돌격!", "win");
    toast(eb > 0 ? "지뢰 전량 식별 — 증원 +" + eb + "명!" : "지뢰 전량 식별 — 돌격!", "amber");
    autoChargeT = setTimeout(() => {                 // 상황을 볼 짧은 여유
      autoChargeT = 0;
      if (allMinesFound()) startAssault();           // 그새 깃발을 뽑았으면 취소
    }, AUTO_CHARGE_MS);
  }

  function beginPrep() {
    phase = "sweep";
    prepLeft = PROTO.prep[diff];
    $("chargeBtn").classList.add("show");
    $("prepBar").classList.add("show");
    $("hpRing").classList.add("show");          // 타이머 시작부터 적 벙커 HP 노출
    $("resetBtn").classList.add("enemy");
    ringSet(bunkerHp(diff) * (1 + mistakeCount * PROTO.mistakeHp));
    updateChargeBtn();
    updatePrepBar();
    setStatus("공병 작업 중 — 돌격까지 " + prepLeft + "초", "");
    prepLastT = performance.now();
  }

  function prepTick(now) {
    prepLeft -= (now - prepLastT) / 1000 * gameSpeed;
    prepLastT = now;
    if (prepLeft <= 0) { startAssault(); return; }
    updatePrepBar();
    updateChargeBtn();
    setStatus("공병 작업 중 — 돌격까지 " + Math.ceil(prepLeft) + "초", "");
  }

  function startAssault() {
    if (phase !== "sweep") return;
    phase = "assault";
    clearTimeout(autoChargeT); autoChargeT = 0;   // 수동 돌격이 자동보다 빠를 수 있다
    $("chargeBtn").classList.remove("show");
    $("prepBar").classList.remove("show");
    // 타이머는 첫 클릭부터 이미 돌고 있다 — 돌격 시점에 리셋하지 않는다
    computeGeom();
    const baseHp = bunkerHp(diff);                     // 투입 병력 × 4
    const bonus = mistakeCount * Math.round(baseHp * PROTO.mistakeHp);
    bunker = { hp: baseHp + bonus, max: baseHp, nextFire: 0, flash: 0, burst: 0 };
    ringSet(bunker.hp);
    $("hpRing").classList.add("show");
    $("resetBtn").classList.add("enemy");
    const eb = earlyBonus();
    troopsTotal = PROTO.troops[diff] + eb;             // 조기 돌격 증원 합류
    spawnLeft = troopsTotal; aliveCount = 0; spawnClock = 0.3; statusClock = 0;
    spawnBag = [];
    while (spawnBag.length < troopsTotal) {
      const cs = Array.from({ length: cols }, (_, c) => c);
      for (let k = cs.length - 1; k > 0; k--) {
        const j = (Math.random() * (k + 1)) | 0;
        [cs[k], cs[j]] = [cs[j], cs[k]];
      }
      spawnBag.push(...cs);
    }
    spawnBag.length = troopsTotal;
    SFX.horn();
    statusAssault();
    toast(eb > 0 ? "돌격 개시 — 증원 +" + eb + "명!" : "돌격 개시!", "amber");
    warNow = 0;
  }

  // rAF + setTimeout 폴백 — rAF가 스로틀돼도 전투는 계속 진행된다 (fx 파편과 동일 패턴)
  function scheduleWar() {
    warRaf = requestAnimationFrame(warTick);
    warTimer = setTimeout(warTick, 40);
  }

  function statusAssault() {
    if (phase !== "assault") return;
    setStatus("돌격 중 — 생존 " + aliveCount + "/" + troopsTotal, "");
  }

  function pushWarBurst(x, y, cfg) {
    for (let k = 0; k < cfg.n; k++) {
      const a = Math.random() * Math.PI * 2;
      const sp = cfg.speed * (0.4 + Math.random() * 0.9);
      warParts.push({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - cfg.up * (0.5 + Math.random()),
        rot: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 12,
        s: cfg.size[0] + Math.random() * (cfg.size[1] - cfg.size[0]),
        c: cfg.colors[(Math.random() * cfg.colors.length) | 0],
        t: 0, ttl: cfg.ttl * (0.7 + Math.random() * 0.6), g: cfg.g,
      });
    }
  }

  // 전투 인원에서 빠진 상태 — 시체가 아직 날아가는 중(ragdoll)이어도 표적·집계에서는 제외된다
  const isDown = (s) => s.st === "dead" || s.st === "ragdoll";

  // blast를 넘기면 일정 확률로 그 방향으로 튕겨 날아간다 (지뢰 폭발 전용)
  function killSoldier(s, blast) {
    if (isDown(s)) return;
    aliveCount--;
    pushWarBurst(s.x, s.y, SHARD_KILL);
    SFX.die();
    if (blast && !reduceMotion && Math.random() < RAGDOLL.chance) {
      const dx = s.x - blast.x, dy = s.y - blast.y;
      const d = Math.hypot(dx, dy) || 1;
      const a = Math.atan2(dy, dx) + (Math.random() - 0.5) * 0.9;   // 폭심 반대쪽 + 흔들림
      const drama = Math.random() < RAGDOLL.dramaChance;
      const sp = rnd(drama ? RAGDOLL.dramaSpeed : RAGDOLL.speed);
      s.st = "ragdoll";
      s.vx = Math.cos(a) * sp; s.vy = Math.sin(a) * sp;
      s.h = 0; s.vh = rnd(drama ? RAGDOLL.dramaLift : RAGDOLL.lift);
      s.rot = 0;
      s.vr = (Math.random() - 0.5) * 2 * (drama ? RAGDOLL.dramaSpin : RAGDOLL.spin);
      s.bounces = 0; s.fade = 0; s.life = 0;
      s.maxBounce = drama ? RAGDOLL.dramaBounce : RAGDOLL.maxBounce;
      s.zoom = drama ? RAGDOLL.dramaZoom : RAGDOLL.zoom;
      s.peak = (s.vh * s.vh) / (2 * RAGDOLL.g);   // 이 개체의 최고 높이 — 확대 보간의 기준
    } else {
      s.st = "dead";
    }
    statusAssault();
  }

  // 포물선 → 착지 → 반발 → 정지 후 페이드. h는 화면상 "떠 있는 높이"
  function stepRagdoll(s, dt) {
    // 어떤 이유로든 물리가 수렴하지 않으면 강제로 정리한다 — 시체가 맵에 눌러앉지 않게
    s.life += dt;
    if (s.life > RAGDOLL.maxLife || !Number.isFinite(s.h) || !Number.isFinite(s.fade)) {
      s.st = "dead";
      return;
    }
    s.x += s.vx * dt; s.y += s.vy * dt;
    s.vh -= RAGDOLL.g * dt;
    s.h += s.vh * dt;
    s.rot += s.vr * dt;
    if (s.h > 0) return;
    s.h = 0;
    if (s.bounces < s.maxBounce && s.vh < -40) {
      s.vh = -s.vh * RAGDOLL.bounce;                 // 튕겨 오른다
      s.vx *= RAGDOLL.friction; s.vy *= RAGDOLL.friction; s.vr *= RAGDOLL.friction;
      s.bounces++;
      pushWarBurst(s.x, s.y, SHARD_LAND);            // 착지 먼지
      return;
    }
    s.vh = 0;
    s.vx *= 0.86; s.vy *= 0.86; s.vr *= 0.8;
    s.fade += dt;
    if (s.fade >= RAGDOLL.rest) s.st = "dead";
  }

  function detonateMine(i, byPlayer) {
    const cell = grid[i];
    if (!cell.mine || cell.det || cell.flag) return;
    cell.det = true; cell.open = true;
    detCount++;
    const el = els[i];
    el.classList.add("open", "boom");
    el.innerHTML = '<div class="dot"></div>';
    ping(i, "red");
    ripple(i, { radius: 4, boost: 1.15 });
    spawnShards(i, SHARD_BOOM);
    SFX.boom();
    updateMineReadout();
    if (byPlayer && mode === "proto" && phase !== "done") {
      mistakeCount++;
      if (bunker) {                                  // 돌격 중 오폭 → 즉시 강화
        bunker.hp += Math.round(bunker.max * PROTO.mistakeHp);
        ringSet(bunker.hp);
      } else {
        ringSet(bunkerHp(diff) * (1 + mistakeCount * PROTO.mistakeHp)); // 공병 단계 — 예정 HP% 갱신
      }
      const ring = $("hpRing");                      // HP 증가 강조 — 링이 부풀며 번쩍
      ring.classList.remove("surge");
      void ring.offsetWidth;
      ring.classList.add("surge");
      setStatus("지뢰 오폭! 적 벙커 강화 +" + Math.round(PROTO.mistakeHp * 100) + "%", "lose");
      toast("적 벙커 HP +" + Math.round(PROTO.mistakeHp * 100) + "%", "red");
    }
    if (phase === "assault" && G) {
      const bx = G.wrapX + el.offsetLeft + el.offsetWidth / 2;
      const by = G.wrapY + el.offsetTop + el.offsetHeight / 2;
      const rad = PROTO.blastTiles * G.pitchX;
      let killed = 0;
      for (const s of soldiers) {
        if (!isDown(s) && Math.hypot(s.x - bx, s.y - by) < rad) { killSoldier(s, { x: bx, y: by }); killed++; }
      }
      if (killed) toast("지뢰 폭발 — 병사 " + killed + "명 전사", "red");
      checkDefeat(warNow);
    }
    maybeAutoCharge();   // 오폭도 "식별"이므로 마지막 한 발이었다면 바로 돌격
  }

  function laneFor(s) {
    const r = rowAt(s.y - G.h * 0.6);              // 반 타일쯤 앞을 보고 차선을 정한다
    if (r < 0 || r >= rows) return G.colCX[s.col];
    if (!grid[idx(r, s.col)].flag) return G.colCX[s.col];
    const rightBad = s.col + 1 < cols && grid[idx(r, s.col + 1)].flag ? 1 : 0;
    const leftBad = s.col - 1 >= 0 && grid[idx(r, s.col - 1)].flag ? 1 : 0;
    const goRight = s.col === 0 ? true : s.col === cols - 1 ? false : rightBad <= leftBad;
    return G.colCX[s.col] + (goRight ? 1 : -1) * G.pitchX / 2;
  }

  function updateSoldier(s, dt, now) {
    if (s.st === "fight") {
      if (now >= s.nextHit) {
        s.nextHit = now + PROTO.hitMs + (s.seed % 180);
        s.kick = now;
        bunker.hp--;
        ringSet(bunker.hp);
        tracers.push({ x1: s.x, y1: s.y, x2: G.bx + Math.cos(s.ang) * 26, y2: G.by + Math.sin(s.ang) * 26, until: now + 90, c: "#7FE8C0" });
        pushWarBurst(G.bx + Math.cos(s.ang) * 26, G.by + Math.sin(s.ang) * 26,
          { n: 3, speed: 70, up: 30, colors: ["#FFD27A", "#FF9B6B"], size: [1, 2.5], ttl: 0.3, g: 400 });
        SFX.thud();
        statusAssault();
        if (bunker.hp <= 0) victory(now);
      }
      return;
    }
    if (s.st !== "march") return;
    if (s.y > G.topY) {
      s.prevY = s.y;
      s.y -= PROTO.speed * dt;
      const lx = laneFor(s);
      const maxDx = PROTO.speed * 2.6 * dt;
      s.x += Math.max(-maxDx, Math.min(maxDx, lx - s.x));
      // 타일 중앙을 밟는 순간에만 지뢰가 격발된다 (틈새 통과는 안전)
      const r = rowAt(s.y);
      if (r >= 0 && r < rows && Math.abs(s.x - G.colCX[s.col]) < G.w * 0.22) {
        const cy = G.rowCY[r];
        if (s.prevY > cy && s.y <= cy) {
          const cell = grid[idx(r, s.col)];
          if (cell.mine && !cell.flag && !cell.det) detonateMine(idx(r, s.col), false);
        }
      }
    } else {
      const dx = G.bx - s.x, dy = G.by - s.y, d = Math.hypot(dx, dy) || 1;
      if (d < PROTO.attackDist + (s.seed % 10)) {
        s.st = "fight";
        s.ang = Math.atan2(s.y - G.by, s.x - G.bx);
        s.nextHit = now + 250 + (s.seed % 350);
      } else {
        const sp = PROTO.speed * PROTO.sprintMul;   // 개활지 돌격 가속
        s.x += dx / d * sp * dt;
        s.y += dy / d * sp * dt;
      }
    }
  }

  function bunkerStep(now) {
    if (now < bunker.nextFire) return;
    const range = PROTO.rangeTiles * G.pitchX;
    let best = null, bd = Infinity;
    for (const s of soldiers) {
      if (isDown(s)) continue;
      const d = Math.hypot(s.x - G.bx, s.y - G.by);
      if (d < range && d < bd) { bd = d; best = s; }
    }
    if (!best) { bunker.nextFire = now + 90; return; }
    tracers.push({ x1: G.bx, y1: G.by, x2: best.x, y2: best.y, until: now + 160 });
    bunker.flash = now;
    best.hp--;
    if (best.hp <= 0) killSoldier(best);
    else {
      best.hurt = now;                              // 첫 발은 부상 — 두 발째에 전사
      pushWarBurst(best.x, best.y, { n: 3, speed: 80, up: 35, colors: ["#FF9B6B", "#FFD27A"], size: [1, 2.5], ttl: 0.3, g: 420 });
      SFX.thud();
    }
    SFX.shot();
    bunker.burst++;
    if (bunker.burst >= PROTO.burstShots) {
      bunker.burst = 0;
      bunker.nextFire = now + PROTO.reloadMs;      // 장전
    } else {
      bunker.nextFire = now + PROTO.burstGapMs;    // 땅땅땅땅땅
    }
    checkDefeat(now);
  }

  function spawnStep(dt) {
    if (!spawnLeft) return;
    spawnClock -= dt;
    if (spawnClock > 0) return;
    spawnClock = PROTO.spawnMs / 1000 * (0.75 + Math.random() * 0.5);
    const col = spawnBag.length ? spawnBag.pop() : (Math.random() * cols) | 0;
    spawnLeft--;
    soldiers.push({
      col, x: G.colCX[col] + (Math.random() * 8 - 4), y: G.botY + G.pitchY * 3 - 6 + Math.random() * 12,
      st: "march", seed: (Math.random() * 1000) | 0, prevY: 1e9, kick: 0, ang: -Math.PI / 2, nextHit: 0,
      hp: PROTO.soldierHp, hurt: 0,
    });
    aliveCount++;
    statusAssault();
  }

  function checkDefeat(now) {
    if (phase === "assault" && spawnLeft === 0 && aliveCount <= 0) defeat(now);
  }

  function victory(now) {
    phase = "done"; doneAt = now; over = true;
    timerOn = false;
    for (const s of soldiers) if (s.st === "fight" || s.st === "march") s.st = "cheer";
    ringSet(0);
    pushWarBurst(G.bx, G.by,
      { n: 30, speed: 220, up: 110, colors: ["#FF5D5D", "#FF9B6B", "#FFD27A", "#7A1D1D"], size: [2, 5], ttl: 0.8, g: 420 });
    $("resetBtn").textContent = "✓";
    $("resetBtn").className = "won";
    setStatus("작전 성공 — 벙커 파괴 · 생존 " + aliveCount + "/" + troopsTotal + " · " + fmtSec(timeCs) + "초", "win");
    toast("벙커 파괴 — 작전 성공!", "teal");
    SFX.boom(); SFX.win();
    celebrateSweep();
    clearTimeout(resultTimer);
    resultTimer = setTimeout(() => showResult(true), 2000);
  }

  function defeat(now) {
    if (phase !== "assault") return;
    phase = "done"; doneAt = now; over = true;
    timerOn = false;
    $("resetBtn").textContent = "✕";
    $("resetBtn").className = "lost";
    setStatus("작전 실패 — 전 병력 손실. ◎ 버튼으로 재편성", "lose");
    toast("전 병력 손실 — 작전 실패", "red");
    SFX.boom();
    clearTimeout(resultTimer);
    resultTimer = setTimeout(() => showResult(false), 2000);
  }

  // 상시 구동 마스터 루프 — 카운트다운·미션 타이머·전투가 전부 여기서 진행된다
  function warTick() {
    cancelAnimationFrame(warRaf);
    clearTimeout(warTimer);
    const now = performance.now();
    if (document.hidden) { warLast = timeLastT = prepLastT = now; scheduleWar(); return; }
    const rawDt = Math.min(0.1, (now - warLast) / 1000);
    warLast = now;
    const dt = rawDt * gameSpeed;        // 가속 배율 — 전투 시뮬레이션 전체에 적용
    warNow += dt * 1000;
    if (phase === "sweep") prepTick(now);
    if (timerOn) missionTick(now);
    if (phase === "assault") {
      spawnStep(dt);
      bunkerStep(warNow);
      for (const s of soldiers) {
        if (phase !== "assault") break;
        updateSoldier(s, dt, warNow);
      }
      checkDefeat(warNow);
      statusClock += rawDt;
      if (statusClock > 1) { statusClock = 0; statusAssault(); }
    }
    // 날아가는 시체는 전투가 끝난 뒤에도 마저 착지시킨다 (승리 순간 공중에서 멎지 않게)
    for (const s of soldiers) if (s.st === "ragdoll") stepRagdoll(s, dt);
    warParts = warParts.filter((p) => (p.t += dt) < p.ttl);
    for (const p of warParts) {
      p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
    }
    drawWar(warNow);
    if (phase === "done" && warNow > doneAt + 3500) {
      soldiers.length = 0; tracers.length = 0;   // 종전 후 정리 — 루프는 계속 돈다
    }
    scheduleWar();
  }

  // 그림자는 지면(s.y)에, 몸은 높이만큼 띄워서(s.y - s.h) 그린다 — 떠 있는 게 눈에 보이도록.
  // 높이 오를수록 몸은 조금 커지고 그림자는 작고 옅어진다 (카메라에 가까워지는 느낌)
  function drawRagdoll(ctx, s) {
    const a = Math.max(0, 1 - s.fade / RAGDOLL.rest);
    const lift = Math.min(1, s.h / Math.max(1, s.peak));   // 0(지면)~1(그 개체의 최고점)
    const sc = 1 + lift * s.zoom;
    ctx.globalAlpha = a * 0.4 * (1 - lift * 0.55);
    ctx.fillStyle = "#04121C";
    ctx.beginPath(); ctx.ellipse(s.x, s.y, 6 * (1 - lift * 0.35), 2.6 * (1 - lift * 0.35), 0, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = a;
    ctx.save();
    ctx.translate(s.x, s.y - s.h); ctx.rotate(s.rot); ctx.scale(sc, sc);
    ctx.strokeStyle = "#2E8F68"; ctx.lineWidth = 2.4;      // 총도 같이 돈다
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -10); ctx.stroke();
    ctx.fillStyle = "#E8C48F";
    ctx.beginPath(); ctx.arc(0, 0, 5.2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#8A6A34";
    ctx.beginPath(); ctx.arc(0, 0, 5.2, Math.PI, Math.PI * 2); ctx.fill();
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  function drawWar(now) {
    const ctx = war.ctx;
    if (!ctx) return;
    ctx.clearRect(0, 0, consoleEl.clientWidth, consoleEl.clientHeight);
    // 예광탄 — 적탄(벙커)은 굵은 레드 2중선, 아군탄은 얇은 틸 (피아 식별)
    tracers = tracers.filter((t) => t.until > now);
    for (const t of tracers) {
      if (t.c) {                                     // 아군 사격
        ctx.globalAlpha = Math.max(0, (t.until - now) / 90);
        ctx.strokeStyle = t.c;
        ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.moveTo(t.x1, t.y1); ctx.lineTo(t.x2, t.y2); ctx.stroke();
        continue;
      }
      const a = Math.max(0, (t.until - now) / 160);  // 적 벙커 사격
      ctx.globalAlpha = a * 0.4;
      ctx.strokeStyle = "#FF5D5D";
      ctx.lineWidth = 7;
      ctx.beginPath(); ctx.moveTo(t.x1, t.y1); ctx.lineTo(t.x2, t.y2); ctx.stroke();
      ctx.globalAlpha = a;
      ctx.strokeStyle = "#FFB3A0";
      ctx.lineWidth = 3.2;
      ctx.beginPath(); ctx.moveTo(t.x1, t.y1); ctx.lineTo(t.x2, t.y2); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    // bunker muzzle flash ring
    if (bunker && now - bunker.flash < 90 && G) {
      ctx.globalAlpha = (1 - (now - bunker.flash) / 90) * 0.8;
      ctx.strokeStyle = "#FFD27A";
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(G.bx, G.by, 34, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    drawSoldiers(war.ctx, now);
    // debris
    for (const p of warParts) {
      ctx.globalAlpha = 1 - p.t / p.ttl;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
      ctx.fillStyle = p.c;
      ctx.fillRect(-p.s / 2, -p.s / 2, p.s, p.s);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }


function drawSoldiers(ctx, now) {
    // soldiers
    for (const s of soldiers) {
      if (s.st === "dead") continue;
      if (s.st === "ragdoll") { drawRagdoll(ctx, s); continue; }
      let x = s.x, y = s.y;
      if (s.st === "march") x += Math.sin(now * 0.012 + s.seed) * 1.4;
      if (s.st === "cheer") y -= Math.abs(Math.sin(now * 0.008 + s.seed)) * 5;
      if (s.st === "fight" && now - s.kick < 120) {
        const k = 1 - (now - s.kick) / 120;
        x += Math.cos(s.ang) * 3 * k; y += Math.sin(s.ang) * 3 * k;
      }
      // rifle — 병사 크기 120%
      ctx.strokeStyle = "#2E8F68"; ctx.lineWidth = 2.4;
      const gx = s.st === "fight" ? -Math.cos(s.ang) * 10 : 0;
      const gy = s.st === "fight" ? -Math.sin(s.ang) * 10 : -10;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + gx, y + gy); ctx.stroke();
      // body + helmet — 부상병은 색이 바랜다
      const wounded = s.hp === 1;
      ctx.fillStyle = wounded ? "#E8C48F" : "#8FE8C4";
      ctx.beginPath(); ctx.arc(x, y, 5.2, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = wounded ? "#8A6A34" : "#1F6B4C";
      ctx.beginPath(); ctx.arc(x, y, 5.2, Math.PI, Math.PI * 2); ctx.fill();
      // 피격 순간 플래시 링
      if (s.hurt && now - s.hurt < 150) {
        ctx.globalAlpha = 1 - (now - s.hurt) / 150;
        ctx.strokeStyle = "#FFD27A"; ctx.lineWidth = 2.4;
        ctx.beginPath(); ctx.arc(x, y, 10, 0, Math.PI * 2); ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }

}
