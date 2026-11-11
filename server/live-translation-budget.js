import { budgetError, reserveCost } from './ai-budget.js';
import { LIVE_TRANSLATION_MODEL, LIVE_TRANSLATION_PCM_BYTES_PER_SECOND } from './live-translation-protocol.js';
import { openLiveTranslation } from './live-translation-upstream.js';

const reservationSeconds = 15;

export async function startBudgetedLiveTranslation(env, options) {
  if (!env.ROOMS) throw budgetError();
  if (!env.OPENAI_API_KEY) throw new Error('OpenAI secret is not configured');
  const budget = env.ROOMS.get(env.ROOMS.idFromName('__ai_budget_v1__'));
  async function call(data) {
    const response = await budget.fetch(new Request('https://budget/budget', {
      method: 'POST',
      body: JSON.stringify(data),
    }));
    const result = await response.json();
    if (!response.ok) throw budgetError(result.reason);
    return result;
  }

  const reservation = await call({
    action: 'reserve',
    uid: options.uid,
    model: LIVE_TRANSLATION_MODEL,
    cost: reserveCost(LIVE_TRANSLATION_MODEL, { seconds: reservationSeconds }),
  });
  let settlement;
  const settle = actual => settlement ??= call({ action: 'settle', ...reservation, actual });
  if (options.signal?.aborted) {
    await settle(0);
    options.signal.throwIfAborted();
  }

  let socket;
  const handshake = new AbortController();
  const handshakeTimeout = setTimeout(() => handshake.abort(), 7000);
  try {
    socket = await openLiveTranslation(env, {
      ...options,
      signal: AbortSignal.any([handshake.signal, ...(options.signal ? [options.signal] : [])]),
    });
  } catch (error) {
    // Keep the reservation if the upstream request may have started.
    await settle();
    throw error;
  } finally {
    clearTimeout(handshakeTimeout);
  }

  let renewalInFlight, finishing;
  const finish = () => {
    if (finishing) return finishing;
    finished = true;
    clearTimeout(deadline); clearTimeout(renewal);
    options.signal?.removeEventListener('abort', stop);
    finishing = Promise.resolve(renewalInFlight).catch(() => {}).then(() => settle()).catch(() => {});
    options.waitUntil?.(finishing);
    return finishing;
  };
  const stop = () => {
    try {
      socket.close(1000, 'finished');
    } finally {
      void finish();
    }
  };
  const startedAt = Date.now();
  let reservedSeconds = reservationSeconds;
  let deadline, renewal;
  let finished = false;
  function arm() {
    clearTimeout(deadline);
    const remaining = startedAt + reservedSeconds * 1000 - Date.now();
    deadline = setTimeout(stop, Math.max(0, remaining));
    if (reservedSeconds >= 90) return;
    renewal = setTimeout(async () => {
      try {
        await (renewalInFlight = call({
          action: 'extend', ...reservation, uid: options.uid,
          cost: reserveCost(LIVE_TRANSLATION_MODEL, { seconds: reservationSeconds }),
        }));
        if (finished) return;
        reservedSeconds += reservationSeconds;
        arm();
      } catch {
        // The active deadline still closes the socket when the paid slice ends.
      }
    }, Math.max(0, remaining - 4000));
  }
  arm();
  socket.addEventListener('close', finish, { once: true });
  socket.addEventListener('error', stop, { once: true });
  options.signal?.addEventListener('abort', stop, { once: true });
  if (options.signal?.aborted) {
    stop();
    options.signal.throwIfAborted();
  }
  return { socket, stop, audioLimit: () => reservedSeconds * LIVE_TRANSLATION_PCM_BYTES_PER_SECOND };
}
