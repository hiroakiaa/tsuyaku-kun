import { captureLiveTranslationPcm } from './live-translation-capture.js?v=live-tail-1';
import { connectLiveTranslation } from './live-translation-client.js?v=20261112-live-tail-2';

export function startFaceLiveTranslation(options) {
  const { languages } = options;
  if (languages.length !== 2 || !languages.includes('ja') || !languages.includes('en')) {
    throw new Error('Live translation pilot requires Japanese and English');
  }
  return startLiveTranslation(options);
}

export async function startLiveTranslation({
  apiOrigin, languages, stream, getToken, signal, onTranscript, onFallback, onFirstAudio, onLanguageState, onSubtitleDelay,
  connect = connectLiveTranslation, capture = captureLiveTranslationPcm,
}) {
  if (!languages.length || new Set(languages).size !== languages.length ||
      languages.some(language => !['ja', 'en'].includes(language))) {
    throw new Error('Live translation requires distinct supported target languages');
  }

  const controller = new AbortController();
  const connections = [];
  const sentBytes = new Map();
  let active = false, draining = false, receivedSubtitle = false, audioDeadline, captureDeadline, sentAudio = false;
  function stop() {
    if (controller.signal.aborted) return;
    signal?.removeEventListener('abort', stop);
    clearTimeout(audioDeadline);
    clearTimeout(captureDeadline);
    controller.abort();
    for (const { language, connection } of connections) {
      connection.stop();
      onLanguageState?.(language, 'closed', sentBytes.get(language) || 0);
    }
  }
  function disconnected(reason) {
    if (controller.signal.aborted) return;
    stop();
    if (active && !draining) onFallback(reason);
  }

  try {
    signal?.throwIfAborted();
    signal?.addEventListener('abort', stop, { once: true });
    await Promise.all(languages.map(async language => {
      const connection = await connect({
        apiOrigin, language, getToken, signal: controller.signal,
        onTranscript: event => {
          if (event.field === 'translation' && event.delta.trim()) {
            receivedSubtitle = true;
            clearTimeout(audioDeadline);
          }
          if (active && !controller.signal.aborted) onTranscript(language, event);
        },
        onDisconnected: disconnected,
      });
      if (controller.signal.aborted) {
        connection.stop();
        controller.signal.throwIfAborted();
      }
      connections.push({ language, connection });
      onLanguageState?.(language, 'ready');
    }));

    captureDeadline = setTimeout(() => disconnected('capture timeout'), 5000);
    function sendAudio(pcm) {
        if (controller.signal.aborted || draining) return;
        clearTimeout(captureDeadline);
        if (!receivedSubtitle && !audioDeadline && new Int16Array(pcm).some(sample => Math.abs(sample) >= 600)) {
          audioDeadline = setTimeout(() => onSubtitleDelay?.(), 8000);
        }
        try {
          if (!connections.every(({ language, connection }) => {
            if (!connection.send(pcm)) return false;
            sentBytes.set(language, (sentBytes.get(language) || 0) + pcm.byteLength);
            return true;
          })) {
            disconnected('audio unavailable');
            return;
          }
          if (!sentAudio) {
            sentAudio = true;
            onFirstAudio?.();
          }
        } catch {
          disconnected('audio unavailable');
        }
    }
    const captureStop = await capture(stream,{signal:controller.signal,onAudio:sendAudio});
    controller.signal.throwIfAborted();
    active = true;
    stop.finish = async () => {
      await captureStop?.flush?.();
      if(captureStop?.flush && sentAudio){
        const silence=new ArrayBuffer(4800);
        for(let i=0;i<8&&!controller.signal.aborted;i++){
          await new Promise(resolve=>setTimeout(resolve,100));
          sendAudio(silence);
        }
      }
      draining = true;
      for (const {language} of connections) onLanguageState?.(language, 'finishing', sentBytes.get(language) || 0);
      clearTimeout(audioDeadline);
      const results = await Promise.all(connections.map(async ({ language, connection }) => {
        const complete = await connection.finish().catch(() => false);
        onLanguageState?.(language, complete ? 'confirmed' : 'unconfirmed');
        return complete;
      }));
      stop();
      return results.every(Boolean);
    };
    return stop;
  } catch (error) {
    stop();
    throw error;
  }
}
