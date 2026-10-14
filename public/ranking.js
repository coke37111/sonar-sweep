"use strict";

const portal = createSonarRanking(window.JustPortfolio);
const DIFF_LABEL = { easy: '초급', medium: '중급', hard: '고급' };
let rankResult = null, rankViewRequest = 0;

function rankMessage(reason) {
  return ({ 'not-signed-in': '랭킹등록을 위해 로그인 하세요',
    'login-unavailable': '지금은 로그인할 수 없습니다.',
    'login-cancelled': '로그인을 취소했습니다.',
    'run-unavailable': '이 판은 랭킹 등록을 할 수 없습니다. 새 게임으로 다시 시작해 주세요.',
    'out-of-range': '등록 가능한 시간 또는 점수 범위를 벗어났습니다.',
    'token-expired': '등록 시간이 만료됐습니다. 새 게임으로 다시 시작해 주세요.' })[reason]
    || '등록하지 못했습니다. 연결을 확인해 주세요.';
}

function renderRankInto(scopeEl, listEl, response, board, mine) {
  scopeEl.textContent = '플랫폼 랭킹 — ' + DIFF_LABEL[board];
  listEl.replaceChildren();
  if (!response.ok || !response.rows.length) {
    const li = document.createElement('li'); li.className = 'rank-empty';
    li.textContent = response.ok ? '아직 기록이 없습니다. 첫 기록에 도전하세요.' : '랭킹을 불러오지 못했습니다';
    listEl.append(li); return;
  }
  for (const row of response.rows) {
    const li = document.createElement('li');
    li.textContent = `${row.nick} — 생존 ${row.keys.s} · ${fmtSec(row.keys.cs)}초 · 오폭 ${row.keys.m}`;
    if (row.runId === mine) li.className = 'rank-mine';
    listEl.append(li);
  }
}

async function refreshResult(ticket, board, mine) {
  const response = await portal.top(board);
  if (portal.current(ticket)) renderRankInto($('rankScope'), $('rankList'), response, board, mine);
}

async function setRankTab(board) {
  const request = ++rankViewRequest;
  document.querySelectorAll('#rankTabs button').forEach((b) => b.classList.toggle('active', b.dataset.rd === board));
  $('rankViewList').textContent = '불러오는 중…';
  const response = await portal.top(board);
  if (request === rankViewRequest) renderRankInto($('rankViewScope'), $('rankViewList'), response, board);
}

function accountNick() {
  try {
    const nick = window.JustPortfolio?.auth.getUser().user?.nick;
    return typeof nick === 'string' && nick.trim() ? nick : null;
  } catch { return null; }
}

function currentResult(result = rankResult) {
  return result && result === rankResult && portal.current(result.ticket);
}

function showRankLogin() {
  $('rankLogin').hidden = false;
  $('rankLogin').disabled = false;
  $('rankNotice').textContent = '랭킹등록을 위해 로그인 하세요';
}

async function doSubmit() {
  const result = rankResult;
  if (!currentResult(result) || !result.win || result.saved || result.pending) return;
  if (!accountNick()) { showRankLogin(); return; }
  if (!portal.available()) {
    $('rankLogin').hidden = true;
    $('rankNotice').textContent = rankMessage('run-unavailable');
    return;
  }
  result.pending = true;
  $('rankLogin').hidden = true;
  $('rankNotice').textContent = '등록 중…';
  const reply = await portal.submit();
  if (!currentResult(result)) return;
  result.pending = false;
  if (!reply.ok) { submissionFailed(reply.reason); return; }
  result.saved = true;
  $('rankNotice').textContent = '기록을 등록했습니다.';
  await refreshResult(result.ticket, result.board, reply.runId);
}

function submissionFailed(reason) {
  if (reason === 'not-signed-in') { showRankLogin(); return; }
  $('rankNotice').textContent = rankMessage(reason);
}

async function loginForResult() {
  const result = rankResult;
  if (!currentResult(result) || !result.win || result.saved || result.pending) return;
  result.pending = true; $('rankLogin').disabled = true;
  let reply;
  try { reply = await window.JustPortfolio?.auth.requestLogin(); }
  catch { reply = { ok: false, reason: 'login-unavailable' }; }
  if (!currentResult(result)) return;
  result.pending = false; $('rankLogin').disabled = false;
  if (reply?.ok) await doSubmit();
  else $('rankNotice').textContent = '랭킹등록을 위해 로그인 하세요 · ' + rankMessage(reply?.reason);
}

function refreshResultAuth() {
  if (!currentResult() || !rankResult.win || rankResult.saved || rankResult.pending) return;
  if (accountNick()) doSubmit(); else showRankLogin();
}

function hideResult() {
  $('resultOverlay').classList.remove('show'); clearTimeout(countTimer);
}

function animateResult(win, target) {
  const count = $('resultCount'); count.className = 'result-count'; count.textContent = '';
  countTimer = setTimeout(() => {
    if (!$('resultOverlay').classList.contains('show')) return;
    count.textContent = target; count.classList.add('stamp');
    countTimer = setTimeout(() => {
      if (!$('resultOverlay').classList.contains('show')) return;
      count.classList.add('final'); if (!win) count.classList.add('lose'); SFX.stamp();
      const card = document.querySelector('.result-card'); card.classList.remove('impact');
      void card.offsetWidth; card.classList.add('impact');
    }, 390);
  }, 350);
}

function showResult(win) {
  const ticket = portal.ticket();
  if (!rankResult || rankResult.ticket !== ticket) {
    rankResult = { ticket, board: diff, win, saved: false, pending: false };
    portal.finish({ s: aliveCount, cs: timeCs, m: mistakeCount });
  }
  $('resultOverlay').classList.add('show');
  $('resultVerdict').textContent = win ? '작전 성공' : '작전 실패';
  $('resultVerdict').className = 'result-verdict ' + (win ? 'win' : 'lose');
  $('resultSub').textContent = `투입 ${troopsTotal}명 · ${fmtSec(timeCs)}초`;
  animateResult(win, aliveCount);
  $('rankLogin').hidden = true;
  if (!rankResult.saved && !rankResult.pending) {
    $('rankNotice').textContent = win ? (portal.available() ? '' : rankMessage('run-unavailable')) : '';
    if (win) { if (accountNick()) doSubmit(); else showRankLogin(); }
  }
  $('rankList').textContent = '불러오는 중…';
  refreshResult(portal.ticket(), diff);
}

$('rankBtn').addEventListener('click', () => { SFX.ensure(); $('rankOverlay').classList.add('show'); setRankTab(diff); });
$('rankTabs').addEventListener('click', (e) => { const b = e.target.closest('button[data-rd]'); if (b) setRankTab(b.dataset.rd); });
$('rankViewClose').addEventListener('click', () => { rankViewRequest++; $('rankOverlay').classList.remove('show'); });
$('rankOverlay').addEventListener('click', (e) => { if (e.target === $('rankOverlay')) { rankViewRequest++; $('rankOverlay').classList.remove('show'); } });
$('rankLogin').addEventListener('click', loginForResult);
window.addEventListener('storage', refreshResultAuth);
window.addEventListener('online', refreshResultAuth);
document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshResultAuth(); });
$('resultClose').addEventListener('click', hideResult);
$('resultOverlay').addEventListener('click', (e) => { if (e.target === $('resultOverlay')) hideResult(); });
