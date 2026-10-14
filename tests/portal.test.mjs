import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const context = vm.createContext({});
vm.runInContext(await readFile(new URL('../public/portal.js', import.meta.url), 'utf8'), context);
const create = context.createSonarRanking;
const deferred = () => { let resolve; const promise = new Promise((yes) => { resolve = yes; }); return { promise, resolve }; };
const keys = { s: 13, cs: 456, m: 0 };
function sdk(options = {}) {
  return { init: () => ({ ok: true }), run: { start: async () => ({ ok: true, token: 'opaque-token' }) },
    leaderboard: { top: async () => ({ ok: true, rows: [] }), submit: async () => ({ ok: true, runId: 'saved' }) }, ...options };
}

test('run is shared while starting, and a reset discards the old token', async () => {
  const pending = deferred(); let calls = 0;
  const ranking = create(sdk({ run: { start: () => { calls++; return pending.promise; } } }));
  const old = ranking.ticket(); const first = ranking.begin('easy'); ranking.begin('easy');
  assert.equal(calls, 1); assert.equal(ranking.starting(), true);
  ranking.reset(); pending.resolve({ ok: true, token: 'old' }); await first;
  assert.equal(ranking.current(old), false); ranking.finish(keys); assert.equal(ranking.available(), false);
});

test('offline and failed run issuance allow play without reporting a valid ranked run', async () => {
  for (const factory of [undefined, sdk({ run: { start: async () => ({ ok: false, reason: 'network-error' }) } })]) {
    const ranking = create(factory); await ranking.begin('easy');
    assert.equal(ranking.starting(), false); ranking.finish(keys); assert.equal(ranking.available(), false);
    assert.equal((await ranking.submit()).reason, 'run-unavailable');
  }
});

test('hidden active or pending runs cannot submit; login after finishing preserves eligibility', async () => {
  const ranking = create(sdk()); await ranking.begin('medium'); ranking.hide(); ranking.finish(keys);
  assert.equal(ranking.available(), false); assert.equal((await ranking.submit()).ok, false);
  ranking.reset(); await ranking.begin('hard'); ranking.finish(keys); ranking.hide();
  assert.equal(ranking.available(), true); assert.equal((await ranking.submit()).ok, true);
  const pending = deferred(), waiting = create(sdk({ run: { start: () => pending.promise } }));
  const start = waiting.begin('easy'); waiting.hide(); pending.resolve({ ok: true, token: 'x' }); await start;
  waiting.finish(keys); assert.equal(waiting.available(), false);
});

test('retry uses the same immutable score and token; successful repeat sends nothing', async () => {
  const inputs = []; let attempts = 0;
  const ranking = create(sdk({ leaderboard: { submit: async (input) => {
    inputs.push(input); return ++attempts === 1 ? { ok: false, reason: 'network-error' } : { ok: true, runId: 'saved' };
  } } }));
  await ranking.begin('hard'); const score = { ...keys }; ranking.finish(score); score.s = 999;
  assert.equal((await ranking.submit()).ok, false); assert.equal((await ranking.submit()).ok, true);
  await ranking.submit(); assert.equal(inputs.length, 2);
  assert.equal(JSON.stringify(inputs[0]), JSON.stringify({ board: 'hard', token: 'opaque-token', keys }));
  assert.equal(JSON.stringify(inputs[0]), JSON.stringify(inputs[1]));
});

test('concurrent submission and response after restarting cannot complete the new run', async () => {
  const pending = deferred();
  const ranking = create(sdk({ leaderboard: { submit: () => pending.promise } }));
  await ranking.begin('easy'); ranking.finish(keys); const submit = ranking.submit();
  assert.equal((await ranking.submit()).reason, 'pending');
  ranking.reset(); pending.resolve({ ok: true, runId: 'old' });
  assert.equal((await submit).reason, 'stale-run'); assert.equal(ranking.available(), false);
});

test('top failure remains a failure rather than showing old local records as a shared ranking', async () => {
  const ranking = create(sdk({ leaderboard: { top: async () => { throw new Error('offline'); } } }));
  assert.equal((await ranking.top('easy')).ok, false);
});
