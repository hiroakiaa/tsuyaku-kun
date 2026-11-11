import assert from 'node:assert/strict';
import { startFaceLiveTranslation } from '../web/live-translation-face.js';

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
