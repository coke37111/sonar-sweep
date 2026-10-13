  /* ---------- input ---------- */
  let pressTimer = null, suppressClick = false;

  // waves fire only while no button is held — deferred shockwaves wait for release
  let anyButtonDown = false, pendingShock = [];
  window.addEventListener("pointerdown", () => { anyButtonDown = true; }, true);
  const onRelease = (e) => {
    if (e.buttons !== 0) return;
    anyButtonDown = false;
    if (pendingShock.length) { const q = pendingShock; pendingShock = []; q.forEach((fn) => fn()); }
  };
  window.addEventListener("pointerup", onRelease, true);
  window.addEventListener("pointercancel", onRelease, true);

  board.addEventListener("contextmenu", (e) => e.preventDefault());

  board.addEventListener("pointerdown", (e) => {
    const el = e.target.closest(".cell");
    if (!el) return;
    const i = +el.dataset.i;
    SFX.ensure();
    if (e.pointerType === "touch") {             // long-press = flag
      pressTimer = setTimeout(() => {
        pressTimer = null;
        if (!over) { toggleFlag(i); suppressClick = true; }
      }, 380);
    }
  });
  board.addEventListener("pointerup", () => {
    clearTimeout(pressTimer); pressTimer = null;
  });
  board.addEventListener("pointercancel", () => { clearTimeout(pressTimer); pressTimer = null; });

  board.addEventListener("click", (e) => {
    const el = e.target.closest(".cell");
    if (!el) return;
    if (suppressClick) { suppressClick = false; return; }
    const i = +el.dataset.i;
    if (over || portal.starting()) return;
    flashCell(i);
    if (flagMode && !grid[i].open) { toggleFlag(i); return; }
    if (grid[i].open) chord(i);
    else reveal(i);
  });

  board.addEventListener("contextmenu", (e) => {
    const el = e.target.closest(".cell");
    if (!el || over) return;
    toggleFlag(+el.dataset.i);                   // wave arrives with the flag, not the click
  });

  /* ---------- controls ---------- */
  $("resetBtn").addEventListener("click", () => { SFX.ensure(); newGame(); });

  $("tabs").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-d]");
    if (!b) return;
    diff = b.dataset.d;
    document.querySelectorAll("#tabs button").forEach((x) => x.classList.toggle("active", x === b));
    document.addEventListener("visibilitychange", () => {
    if (document.hidden) portal.hide();
    warLast = timeLastT = prepLastT = performance.now();
  });

  newGame();
  });

  $("soundBtn").addEventListener("click", () => {
    SFX.on = !SFX.on;
    $("soundBtn").textContent = SFX.on ? "♪ 소리 켜짐" : "♪ 소리 꺼짐";
  });

  $("flagModeBtn").addEventListener("click", () => {
    flagMode = !flagMode;
    $("flagModeBtn").classList.toggle("on", flagMode);
  });

  $("chargeBtn").addEventListener("click", () => { SFX.ensure(); startAssault(); });

  function setSpeed(x) {
    gameSpeed = x;
    document.querySelectorAll("#speedBtns button").forEach((b) => b.classList.toggle("active", +b.dataset.s === x));
  }

  $("speedBtns").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-s]");
    if (!b) return;
    setSpeed(+b.dataset.s);
  });

  window.addEventListener("resize", resizeWar);

  newGame();
  warLast = performance.now();
  scheduleWar();                     // 마스터 루프 기동 (상시)
