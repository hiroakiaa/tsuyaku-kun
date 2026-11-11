import { captureLiveTranslationPcm } from './live-translation-capture.js';
import { connectLiveTranslation } from './live-translation-client.js';

export function startFaceLiveTranslation(options) {
  const { languages } = options;
  if (languages.length !== 2 || !languages.includes('ja') || !languages.includes('en')) {
    throw new Error('Live translation pilot requires Japanese and English');
  }
  return startLiveTranslation(options);
}

export async function startLiveTranslation({
  apiOrigin, languages, stream, getToken, signal, onTranscript, onFallback, onFirstAudio,
  connect = connectLiveTranslation, capture = captureLiveTranslationPcm,
}) {
  if (!languages.length || new Set(languages).size !== languages.length ||
      languages.some(language => !['ja', 'en'].includes(language))) {
    throw new Error('Live translation requires distinct supported target languages');
  }

  const controller = new AbortController();
  const connections = [];
  let active = false, draining = false, receivedSubtitle = false, audioDeadline, captureDeadline, sentAudio = false;
  function stop() {
    if (controller.signal.aborted) return;
    signal?.removeEventListener('abort', stop);
    clearTimeout(audioDeadline);
    clearTimeout(captureDeadline);
    controller.abort();
    for (const connection of connections) connection.stop();
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
      connections.push(connection);
    }));

    captureDeadline = setTimeout(() => disconnected('capture timeout'), 5000);
    await capture(stream, {
      signal: controller.signal,
      onAudio: pcm => {
        if (controller.signal.aborted || draining) return;
        clearTimeout(captureDeadline);
        if (!receivedSubtitle && !audioDeadline && new Int16Array(pcm).some(sample => Math.abs(sample) >= 600)) {
          audioDeadline = setTimeout(() => disconnected('subtitle timeout'), 8000);
        }
        try {
          if (!connections.every(connection => connection.send(pcm))) {
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
      },
    });
    controller.signal.throwIfAborted();
    active = true;
    stop.finish = async () => {
      draining = true;
      clearTimeout(audioDeadline);
      const results = await Promise.all(connections.map(connection => connection.finish()));
      stop();
      return results.every(Boolean);
    };
    return stop;
  } catch (error) {
    stop();
    throw error;
  }
}
