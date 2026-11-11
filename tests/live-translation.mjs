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

const { connectLiveTranslation } = await import('../web/live-translation-client.js');
const originalSocket = globalThis.WebSocket;
let fakeSocket;
class LiveSocket {
  static OPEN = 1;
  readyState = LiveSocket.OPEN;
  bufferedAmount = 0;
  sent = [];
  constructor() { fakeSocket = this; }
  send(data) { this.sent.push(data); }
  close() { this.readyState = 3; }
  receive(data) { this.onmessage({ data: JSON.stringify(data) }); }
}
try {
  globalThis.WebSocket = LiveSocket;
  for (const cleanClose of [true, false]) {
    const subtitles = [], disconnects = [];
    const connecting = connectLiveTranslation({
      apiOrigin: 'https://example.invalid', language: 'en', getToken: async () => 'synthetic',
      onTranscript: event => subtitles.push(event.delta),
      onDisconnected: reason => disconnects.push(reason),
    });
    await new Promise(resolve => setImmediate(resolve));
    fakeSocket.onopen();
    fakeSocket.receive({ type: 'ready' });
    const client = await connecting;
    const finished = client.finish();
    assert.equal(fakeSocket.sent.at(-1), 'finish');
    assert.equal(client.send(new ArrayBuffer(16)), false);
    fakeSocket.receive({ type: 'session.output_transcript.delta', delta: 'Last words.' });
    if (cleanClose) fakeSocket.receive({ type: 'session.closed' });
    else fakeSocket.onclose();
    assert.equal(await finished, cleanClose);
    assert.deepEqual(subtitles, ['Last words.']);
    assert.deepEqual(disconnects, []);
  }
} finally {
  globalThis.WebSocket = originalSocket;
}
console.log('PASS: graceful stop drains transcript and distinguishes upstream confirmation from disconnect');

const { createLiveCaptionBuffer } = await import('../web/live-caption-buffer.js');
const captionBuffer = createLiveCaptionBuffer(['en']);
const longText = 'First sentence. ' + 'word '.repeat(500);
assert.equal(captionBuffer.append('en', { field: 'translation', delta: longText }), longText.slice(-1000));
assert.equal(captionBuffer.complete('en'), longText.trim());
captionBuffer.append('en', { field: 'translation', delta: 'x'.repeat(6000) });
assert.equal(captionBuffer.complete('en'), null);
assert.equal(captionBuffer.append('en', { field: 'translation', delta: 'last' }), 'x'.repeat(996) + 'last');
