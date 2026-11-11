import { startBudgetedLiveTranslation } from './live-translation-budget.js';
import { LIVE_TRANSLATION_PCM_BYTES_PER_SECOND, liveTranslationAudio, liveTranslationConfiguration } from './live-translation-protocol.js';
import { isBillingAdministrator } from './billing-report.js';
import { verifyToken } from './auth.js';

export async function upgradeLiveTranslation(request, env, ctx) {
  if (request.method !== 'GET' || request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
    return new Response('WebSocket required', { status: 426 });
  }
  const language = new URL(request.url).searchParams.get('language');
  try {
    liveTranslationConfiguration(language);
  } catch {
    return new Response('Unsupported translation language', { status: 400 });
  }
  if (env.REQUEST_LIMIT && !(await env.REQUEST_LIMIT.limit({
    key: 'live-ip:' + (request.headers.get('CF-Connecting-IP') || 'local'),
  })).success) return new Response('Try later', { status: 429 });

  const [client, relay] = Object.values(new WebSocketPair());
  const lifecycle = new AbortController();
  let upstream, session;
  let sentBytes = 0;
  let readyAt = 0;
  let awaitingAuth = true, draining = false, drainTimeout;
  const authTimeout = setTimeout(() => stop(1008, 'authentication timeout'), 8000);
  function stop(code = 1000, reason = 'finished') {
    clearTimeout(authTimeout); clearTimeout(drainTimeout);
    lifecycle.abort();
    try { relay.close(code, reason); } catch {}
  }

  relay.binaryType = 'arraybuffer';
  relay.addEventListener('close', () => stop());
  relay.addEventListener('error', () => stop(1011, 'connection error'));
  relay.addEventListener('message', ({ data }) => {
    if (lifecycle.signal.aborted) return;
    if (awaitingAuth) {
      awaitingAuth = false;
      ctx.waitUntil(authenticate(data).catch(() => stop(1008, 'live translation unavailable')));
      return;
    }
    if (!upstream) return stop(1008, 'connection pending');
    if (draining) return;
    if (data === 'finish') {
      draining = true;
      try {
        upstream.send(JSON.stringify({ type: 'session.close' }));
        drainTimeout = setTimeout(() => stop(1011, 'finalization timeout'), 5000);
      } catch {
        stop(1011, 'finalization failed');
      }
      return;
    }
    try {
      const message = liveTranslationAudio(data);
      sentBytes += data.byteLength;
      if (sentBytes > session.audioLimit()) return stop(1000, 'audio limit');
      const elapsedSeconds = Math.max(0, Date.now() - readyAt) / 1000;
      if (sentBytes > (elapsedSeconds + 1) * LIVE_TRANSLATION_PCM_BYTES_PER_SECOND
        || upstream.bufferedAmount > LIVE_TRANSLATION_PCM_BYTES_PER_SECOND * 2) {
        return stop(1008, 'audio rate limit');
      }
      upstream.send(message);
    } catch {
      stop(1011, 'audio relay failed');
    }
  });

  async function authenticate(data) {
    if (typeof data !== 'string' || data.length > 10000) throw new Error('Invalid authentication');
    const auth = await verifyToken(JSON.parse(data).token, env.FIREBASE_PROJECT, true);
    if (!await isBillingAdministrator(auth, env.BILLING_ADMIN_EMAIL_HASH)) throw new Error('Administrator required');
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(auth.uid));
    const safetyIdentifier = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
    session = await startBudgetedLiveTranslation(env, {
      uid: auth.uid, language, safetyIdentifier, signal: lifecycle.signal, waitUntil: task => ctx.waitUntil(task),
    });
    upstream = session.socket;
    readyAt = Date.now();
    clearTimeout(authTimeout);
    upstream.addEventListener('close', () => stop());
    upstream.addEventListener('error', () => stop(1011, 'upstream error'));
    upstream.addEventListener('message', ({ data }) => {
      if (typeof data !== 'string' || data.length > 64000 || lifecycle.signal.aborted) return;
      try {
        const event = JSON.parse(data);
        if (event.type === 'error') return stop(1011, 'upstream error');
        if (event.type === 'session.closed') {
          relay.send(JSON.stringify({ type: 'session.closed' }));
          return stop();
        }
        if (['session.input_transcript.delta', 'session.output_transcript.delta'].includes(event.type)
          && typeof event.delta === 'string') relay.send(JSON.stringify({ type: event.type, delta: event.delta }));
      } catch {
        stop(1011, 'upstream response failed');
      }
    });
    relay.send(JSON.stringify({ type: 'ready' }));
  }

  relay.accept();
  return new Response(null, { status: 101, webSocket: client });
}
