import { captureLiveTranslationPcm } from './live-translation-capture.js';
import { connectLiveTranslation } from './live-translation-client.js';

export async function startFaceLiveTranslation({
  apiOrigin, languages, stream, getToken, signal, onTranscript, onFallback,
  connect = connectLiveTranslation, capture = captureLiveTranslationPcm,
}) {
  if (languages.length !== 2 || !languages.includes('ja') || !languages.includes('en')) {
    throw new Error('Live translation pilot requires Japanese and English');
  }

  const controller = new AbortController();
  const connections = [];
  let active = false;
  function stop() {
    signal?.removeEventListener('abort', stop);
    controller.abort();
    for (const connection of connections) connection.stop();
  }
  function disconnected(reason) {
    if (controller.signal.aborted) return;
    stop();
    if (active) onFallback(reason);
  }

  try {
    signal?.throwIfAborted();
    signal?.addEventListener('abort', stop, { once: true });
    await Promise.all(languages.map(async language => {
      const connection = await connect({
        apiOrigin, language, getToken, signal: controller.signal,
        onTranscript: event => {
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

    await capture(stream, {
      signal: controller.signal,
      onAudio: pcm => {
        if (controller.signal.aborted) return;
        try {
          if (!connections.every(connection => connection.send(pcm))) disconnected('audio unavailable');
        } catch {
          disconnected('audio unavailable');
        }
      },
    });
    controller.signal.throwIfAborted();
    active = true;
    return stop;
  } catch (error) {
    stop();
    throw error;
  }
}
