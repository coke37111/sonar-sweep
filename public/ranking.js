"use strict";

const portal = createSonarRanking(window.JustPortfolio);
const DIFF_LABEL = { easy: '초급', medium: '중급', hard: '고급' };
let rankSubmitted = false, rankViewRequest = 0;

function rankMessage(reason) {
  return ({ 'not-signed-in': '로그인 후 이 판의 기록을 등록할 수 있습니다.',
    'login-unavailable': '플랫폼에서 로그인한 뒤 다시 등록해 주세요.',
    'login-cancelled': '로그인을 취소했습니다. 다시 등록할 수 있습니다.',
    'run-unavailable': '이 판은 랭킹 등록을 할 수 없습니다. 새 게임으로 다시 시작해 주세요.',
    'out-of-range': '등록 가능한 시간 또는 점수 범위를 벗어났습니다.',
    'token-expired': '등록 시간이 만료됐습니다. 새 게임으로 다시 시작해 주세요.' })[reason]
    || '등록하지 못했습니다. 다시 시도해 주세요.';
}

function renderRankInto(scopeEl, listEl, response, board, mine) {
  scopeEl.textContent = '플랫폼 랭킹 — ' + DIFF_LABEL[board];
  listEl.replaceChildren();
  if (!response.ok || !response.rows.length) {
    const li = document.createElement('li'); li.className = 'rank-empty';
    li.textContent = response.ok ? '아직 기록이 없습니다' : '랭킹을 불러오지 못했습니다';
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

async function doSubmit() {
  if (rankSubmitted || !portal.available()) return;
  const ticket = portal.ticket(), board = diff;
  rankSubmitted = true;
  $('rankSave').disabled = true;
  $('rankNotice').textContent = '등록 중…';
  const sdk = window.JustPortfolio;
  if (!sdk.auth.getUser().user) {
    const login = await sdk.auth.requestLogin();
    if (!portal.current(ticket)) return;
    if (!login.ok) { submissionFailed(login.reason); return; }
  }
  const reply = await portal.submit();
  if (!portal.current(ticket)) return;
  if (!reply.ok) { submissionFailed(reply.reason); return; }
  $('rankNotice').textContent = '기록을 등록했습니다.';
  $('rankSave').textContent = '등록됨';
  await refreshResult(ticket, board, reply.runId);
}

function submissionFailed(reason) {
  rankSubmitted = false;
  $('rankSave').disabled = false;
  $('rankSave').textContent = '다시 등록';
  $('rankNotice').textContent = rankMessage(reason);
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
  portal.finish({ s: aliveCount, cs: timeCs, m: mistakeCount });
  $('resultOverlay').classList.add('show');
  $('resultVerdict').textContent = win ? '작전 성공' : '작전 실패';
  $('resultVerdict').className = 'result-verdict ' + (win ? 'win' : 'lose');
  $('resultSub').textContent = `투입 ${troopsTotal}명 · ${fmtSec(timeCs)}초`;
  animateResult(win, aliveCount); rankSubmitted = false;
  $('rankNameRow').style.display = win ? '' : 'none';
  $('rankSave').disabled = !portal.available(); $('rankSave').textContent = '기록 등록';
  $('rankNotice').textContent = win ? (portal.available() ? '플랫폼 계정으로 기록을 등록합니다.' : rankMessage('run-unavailable')) : '';
  $('rankList').textContent = '불러오는 중…';
  refreshResult(portal.ticket(), diff);
}

$('rankBtn').addEventListener('click', () => { SFX.ensure(); $('rankOverlay').classList.add('show'); setRankTab(diff); });
$('rankTabs').addEventListener('click', (e) => { const b = e.target.closest('button[data-rd]'); if (b) setRankTab(b.dataset.rd); });
$('rankViewClose').addEventListener('click', () => { rankViewRequest++; $('rankOverlay').classList.remove('show'); });
$('rankOverlay').addEventListener('click', (e) => { if (e.target === $('rankOverlay')) { rankViewRequest++; $('rankOverlay').classList.remove('show'); } });
$('rankSave').addEventListener('click', doSubmit);
$('resultClose').addEventListener('click', hideResult);
$('resultOverlay').addEventListener('click', (e) => { if (e.target === $('resultOverlay')) hideResult(); });
