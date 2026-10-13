"use strict";

function createSonarRanking(sdk) {
  const unavailable = () => ({ ok: false, reason: 'sdk-offline' });
  let generation = 0, run = null, pending = null, valid = true, result = null, sending = false, saved = null;
  const initialized = sdk?.init({ game: 'sonar-sweep', rules: 'sonar-portal-v1' }).ok;
  const current = (ticket) => ticket === generation;
  function reset() {
    generation++; run = pending = result = saved = null; valid = true; sending = false;
  }
  async function begin(board) {
    if (pending) return pending;
    const ticket = generation;
    pending = (async () => {
      let reply;
      try { reply = await (initialized ? sdk.run.start({ board }) : Promise.resolve(unavailable())); }
      catch { reply = { ok: false, reason: 'network-error' }; }
      if (!current(ticket)) return { ok: false, reason: 'stale-run' };
      run = reply.ok ? { board, token: reply.token } : null;
      pending = null;
      return reply;
    })();
    return pending;
  }
  async function submit() {
    if (saved) return saved;
    if (sending) return { ok: false, reason: 'pending' };
    if (!valid || !run || !result) return { ok: false, reason: 'run-unavailable' };
    const ticket = generation, input = { ...run, keys: { ...result } };
    sending = true;
    let reply;
    try { reply = await sdk.leaderboard.submit(input); }
    catch { reply = { ok: false, reason: 'network-error' }; }
    if (!current(ticket)) return { ok: false, reason: 'stale-run' };
    sending = false;
    if (reply.ok) saved = reply;
    return reply;
  }
  return { reset, begin, submit, current, ticket: () => generation, starting: () => Boolean(pending),
    finish: (keys) => { result = Object.freeze({ ...keys }); },
    hide: () => { if ((run || pending) && !result) valid = false; },
    available: () => Boolean(run && valid && result),
    async top(board) {
      try { return initialized ? await sdk.leaderboard.top({ board, limit: 10 }) : unavailable(); }
      catch { return { ok: false, reason: 'network-error' }; }
    },
  };
}

globalThis.createSonarRanking = createSonarRanking;
