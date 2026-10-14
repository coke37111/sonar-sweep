import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const rankingSource = await readFile(new URL('../public/ranking.js', import.meta.url), 'utf8');
const portalSource = await readFile(new URL('../public/portal.js', import.meta.url), 'utf8');
const flush = () => new Promise(resolve => setImmediate(resolve));
function fixture(nick = null, submitResponse = { ok: true, runId: 'saved' }) {
  const elements = new Map(), posts = [], logins = [], state = { nick }, events = new Map();
  const $ = id => {
    if (!elements.has(id)) elements.set(id, { hidden: true, disabled: false, textContent: '', style: {},
      classList: { add() {}, remove() {}, contains: () => true }, replaceChildren() {}, append() {}, addEventListener() {} });
    return elements.get(id);
  };
  const auth = { getUser: () => ({ user: state.nick ? { nick: state.nick } : null }),
    requestLogin: async () => { logins.push('login'); state.nick = '가입한 사용자'; return { ok: true, user: { nick: state.nick } }; } };
  const sdk = { init: () => ({ ok: true }), auth,
    run: { start: async () => ({ ok: true, token: 'original-token' }) },
    leaderboard: { top: async () => ({ ok: true, rows: [] }), submit: async input => {
      posts.push(input); const response = typeof submitResponse === 'function' ? await submitResponse() : submitResponse;
      if (response.reason === 'not-signed-in') state.nick = null;
      return response;
    } } };
  const context = vm.createContext({ window: { JustPortfolio: sdk, addEventListener: (event, handler) => events.set(event, handler) },
    document: { hidden: false, querySelectorAll: () => [], addEventListener: (event, handler) => events.set(event, handler),
      createElement: () => ({ textContent: '', className: '' }) }, $, diff: 'easy', aliveCount: 12, timeCs: 456,
    mistakeCount: 0, troopsTotal: 12, fmtSec: cs => String(cs / 100), countTimer: 0, setTimeout: () => 0, clearTimeout() {},
    SFX: { ensure() {}, stamp() {} } });
  vm.runInContext(portalSource, context); vm.runInContext(rankingSource, context);
  return { elements, posts, logins, state, events, auth, run: code => vm.runInContext(code, context) };
}

test('guest victory shows login immediately without score writes on all three boards', async () => {
  for (const board of ['easy', 'medium', 'hard']) {
    const f = fixture(); f.run(`diff='${board}'`); await f.run(`portal.begin('${board}')`); f.run('showResult(true)'); await flush();
    assert.equal(f.posts.length, 0); assert.equal(f.elements.get('rankLogin').hidden, false);
    assert.equal(f.elements.get('rankNotice').textContent, '랭킹등록을 위해 로그인 하세요');
  }
});

test('signed-in victory auto-submits once with immutable result and original token', async () => {
  let release; const f = fixture('사장님', () => new Promise(resolve => { release = resolve; }));
  await f.run("portal.begin('easy')"); f.run('showResult(true);showResult(true);doSubmit()');
  assert.equal(f.posts.length, 1); assert.equal(f.elements.get('rankLogin').hidden, true);
  assert.equal(JSON.stringify(f.posts[0]), JSON.stringify({ board: 'easy', token: 'original-token', keys: { s: 12, cs: 456, m: 0 } }));
  release({ ok: true, runId: 'saved' }); await flush(); f.run('refreshResultAuth()');
  assert.equal(f.posts.length, 1); assert.equal(f.elements.get('rankNotice').textContent, '기록을 등록했습니다.');
});

test('guest signup/login automatically submits the original completed result', async () => {
  const f = fixture(); await f.run("portal.begin('medium')"); f.run('showResult(true)');
  await f.run('loginForResult()'); assert.equal(f.logins.length, 1); assert.equal(f.posts.length, 1);
  assert.equal(f.posts[0].token, 'original-token'); assert.equal(f.posts[0].keys.cs, 456);
  assert.equal(f.elements.get('rankLogin').hidden, true);
});

test('session rejection prompts login; network failure never claims device-save success', async () => {
  for (const reason of ['not-signed-in', 'sdk-offline']) {
    const f = fixture('Hint', { ok: false, reason }); await f.run("portal.begin('easy')"); f.run('showResult(true)'); await flush();
    assert.doesNotMatch(f.elements.get('rankNotice').textContent, /기기에|기기 기록|등록했습니다/);
    assert.equal(f.elements.get('rankLogin').hidden, reason !== 'not-signed-in');
  }
});

test('login cancellation leaves a usable login button and writes no scores', async () => {
  const f = fixture(); f.auth.requestLogin = async () => ({ ok: false, reason: 'login-cancelled' });
  await f.run("portal.begin('easy')"); f.run('showResult(true)'); await f.run('loginForResult()');
  assert.equal(f.posts.length, 0); assert.equal(f.elements.get('rankLogin').disabled, false);
  assert.match(f.elements.get('rankNotice').textContent, /랭킹등록을 위해 로그인 하세요/);
});

test('invalidated and losing runs cannot register; logging in still reports invalidated result accurately', async () => {
  const f = fixture(); await f.run("portal.begin('easy')"); f.run('portal.hide();showResult(true)');
  await f.run('loginForResult()'); assert.equal(f.posts.length, 0);
  assert.match(f.elements.get('rankNotice').textContent, /새 게임/); assert.equal(f.elements.get('rankLogin').hidden, true);
  f.run('portal.reset()'); await f.run("portal.begin('easy')"); f.run('showResult(false);refreshResultAuth()'); await flush();
  assert.equal(f.posts.length, 0); assert.equal(f.elements.get('rankLogin').hidden, true);
});

test('old submit/login responses after restarting cannot change the next result', async () => {
  for (const action of ['submit', 'login']) {
    let release; const pending = () => new Promise(resolve => { release = resolve; });
    const f = fixture(action === 'submit' ? '사장님' : null, pending);
    if (action === 'login') f.auth.requestLogin = pending;
    await f.run("portal.begin('easy')"); f.run('showResult(true)');
    if (action === 'login') f.run('loginForResult()');
    f.run('portal.reset()'); await f.run("portal.begin('hard')"); f.run('showResult(false)');
    f.elements.get('rankNotice').textContent = 'new result'; release({ ok: true, runId: 'old' }); await flush();
    assert.equal(f.elements.get('rankNotice').textContent, 'new result');
  }
});

test('markup provides only yellow login action and no editable or manual submit controls', async () => {
  const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  const css = await readFile(new URL('../public/style.css', import.meta.url), 'utf8');
  assert.match(html, /id="rankLogin" type="button" hidden>로그인/); assert.doesNotMatch(html, /id="(?:rankName|rankSave)"/);
  assert.match(css, /#rankLogin\{[^}]*background:#ffcf33/);
});
