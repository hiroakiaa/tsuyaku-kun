import {
  LIVE_TRANSLATION_MODEL,
  liveTranslationConfiguration,
} from './live-translation-protocol.js';

export async function openLiveTranslation(env, { language, safetyIdentifier, signal }) {
  const configuration = liveTranslationConfiguration(language);
  if (!env.OPENAI_API_KEY) throw new Error('OpenAI secret is not configured');

  const response = await fetch(
    'https://api.openai.com/v1/realtime/translations?model=' + LIVE_TRANSLATION_MODEL,
    {
      headers: {
        Upgrade: 'websocket',
        Authorization: 'Bearer ' + env.OPENAI_API_KEY,
        'OpenAI-Safety-Identifier': safetyIdentifier,
      },
      signal,
    },
  );
  const socket = response.webSocket;
  if (!socket) {
    await response.body?.cancel();
    throw new Error('OpenAI translation connection failed: HTTP ' + response.status);
  }

  socket.accept();
  try {
    signal?.throwIfAborted();
    socket.send(configuration);
    return socket;
  } catch (error) {
    socket.close(1000, 'cancelled');
    throw error;
  }
}
