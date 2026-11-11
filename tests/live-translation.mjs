import assert from 'node:assert/strict';
import { startFaceLiveTranslation, startLiveTranslation } from '../web/live-translation-face.js';

let captureCalls = 0;
let stops = 0;
await assert.rejects(startFaceLiveTranslation({
  languages: ['ja', 'en'],
  connect: async ({ language }) => {
    if (language === 'en') throw new Error('service unavailable');
    return { stop: () => { stops++; } };
  },
  capture: async () => { captureCalls++; },
}), /service unavailable/);
assert.equal(stops, 1);
assert.equal(captureCalls, 0);

const abort = new AbortController();
stops = 0;
await assert.rejects(startFaceLiveTranslation({
  languages: ['ja', 'en'],
  signal: abort.signal,
  connect: async () => {
    abort.abort();
    return { stop: () => { stops++; } };
  },
  capture: async () => { captureCalls++; },
}), { name: 'AbortError' });
assert.equal(stops, 2);
assert.equal(captureCalls, 0);
console.log('PASS: incomplete and cancelled Live connections release sockets without starting capture');

let pushAudio;
let transcript;
let disconnect;
const sent = [];
const received = [];
const fallbacks = [];
let singleStops = 0;
const stop = await startLiveTranslation({
  languages: ['en'],
  connect: async ({ language, onTranscript, onDisconnected }) => {
    assert.equal(language, 'en');
    transcript = onTranscript;
    disconnect = onDisconnected;
    return {
      send: pcm => { sent.push(pcm); return true; },
      stop: () => { singleStops++; },
    };
  },
  capture: async (_, { onAudio }) => { pushAudio = onAudio; },
  onTranscript: (language, event) => received.push([language, event]),
  onFallback: reason => fallbacks.push(reason),
});
const pcm = new ArrayBuffer(16);
pushAudio(pcm);
assert.deepEqual(sent, [pcm]);
const event = { field: 'translation', delta: 'Hello' };
transcript(event);
assert.deepEqual(received, [['en', event]]);
disconnect('upstream closed');
disconnect('upstream closed again');
pushAudio(pcm);
transcript(event);
stop();
assert.deepEqual(fallbacks, ['upstream closed']);
assert.equal(sent.length, 1);
assert.equal(received.length, 1);
assert.equal(singleStops, 1);
console.log('PASS: single-target Live capture relays audio and falls back once');

const { startBudgetedLiveTranslation } = await import('../server/live-translation-budget.js');
const originalFetch = globalThis.fetch;
const originalTimeout = globalThis.setTimeout;
const originalClearTimeout = globalThis.clearTimeout;
const budgetActions = [];
const timers = [];
const settlements = [];
let completeExtension;
const extension = new Promise(resolve => { completeExtension = resolve; });
const upstream = new EventTarget();
upstream.accept = () => {};
upstream.send = () => {};
upstream.close = () => upstream.dispatchEvent(new Event('close'));
try {
  globalThis.fetch = async () => ({ webSocket: upstream });
  globalThis.setTimeout = (callback, delay) => {
    const timer = { callback, delay, cancelled: false };
    timers.push(timer);
    return timer;
  };
  globalThis.clearTimeout = timer => { if (timer) timer.cancelled = true; };
  const session = await startBudgetedLiveTranslation({
    OPENAI_API_KEY: 'synthetic',
    ROOMS: {
      idFromName: name => name,
      get: () => ({ fetch: async request => {
        const { action } = await request.json();
        budgetActions.push(action);
        if (action === 'extend') await extension;
        return Response.json({ id: 'test-reservation' });
      } }),
    },
  }, { language: 'en', uid: 'test', waitUntil: task => settlements.push(task) });
  const renewal = timers.find(timer => timer.delay > 10000 && timer.delay <= 11000);
  assert.ok(renewal);
  const renewing = renewal.callback();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(budgetActions, ['reserve', 'extend']);
  session.stop();
  session.stop();
  assert.equal(settlements.length, 1);
  assert.deepEqual(budgetActions, ['reserve', 'extend']);
  completeExtension();
  await Promise.all([renewing, ...settlements]);
  assert.deepEqual(budgetActions, ['reserve', 'extend', 'settle']);
  assert.ok(timers.every(timer => timer.cancelled));
} finally {
  globalThis.fetch = originalFetch;
  globalThis.setTimeout = originalTimeout;
  globalThis.clearTimeout = originalClearTimeout;
}
console.log('PASS: closing during budget extension settles exactly once after extension');
