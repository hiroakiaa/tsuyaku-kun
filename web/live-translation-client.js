import { readLiveTranslationEvent } from './live-translation-events.js?v=20261112-summary-focus-1';

export async function connectLiveTranslation({
  apiOrigin, language, getToken, signal, onTranscript, onDisconnected,
}) {
  const token = await getToken();
  signal?.throwIfAborted();
  const url = new URL('/live-translation', apiOrigin);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.searchParams.set('language', language);

  const socket = new WebSocket(url);
  let ready = false;
  let stopped = false, drain, drainTimeout;
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => finish('timeout'), 9000);

    function finish(reason, intentional = false) {
      if (stopped) return;
      stopped = true;
      clearTimeout(timeout); clearTimeout(drainTimeout);
      signal?.removeEventListener('abort', abort);
      socket.close();
      drain?.(reason === 'closed');
      if (!ready) reject(new Error(reason));
      else if (!intentional && !drain) onDisconnected(reason);
    }

    function abort() {
      finish('cancelled', true);
    }

    signal?.addEventListener('abort', abort, { once: true });
    socket.onopen = () => socket.send(JSON.stringify({ token }));
    socket.onerror = () => finish('connection failed');
    socket.onclose = ({reason} = {}) => finish(/^live (?:busy|budget|key missing|upstream (?:401|403|404|429)|translation unavailable)$/.test(reason) ? reason : 'connection closed');
    socket.onmessage = ({ data }) => {
      if (stopped) return;
      if (!ready) {
        let message;
        try { message = JSON.parse(data); } catch { return finish('invalid response'); }
        if (message?.type !== 'ready') return finish('unexpected response');
        ready = true;
        clearTimeout(timeout);
        resolve({
          send(pcm) {
            if (stopped || drain || socket.readyState !== WebSocket.OPEN) return false;
            if (socket.bufferedAmount > 48000) {
              finish('connection overloaded');
              return false;
            }
            socket.send(pcm);
            return true;
          },
          finish() {
            if (stopped || drain) return Promise.resolve(false);
            return new Promise(resolve => {
              drain = resolve;
              drainTimeout = setTimeout(() => finish('finalization timeout'), 9500);
              try { socket.send('finish'); } catch { finish('send failed'); }
            });
          },
          stop: abort,
        });
        return;
      }
      const event = readLiveTranslationEvent(data);
      if (event?.type === 'transcript') onTranscript(event);
      else if (event?.type === 'closed' || event?.type === 'error') finish(event.type, Boolean(drain));
    };
  });
}
