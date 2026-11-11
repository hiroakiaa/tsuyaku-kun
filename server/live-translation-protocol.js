export const LIVE_TRANSLATION_MODEL = 'gpt-realtime-translate';
export const LIVE_TRANSLATION_PCM_BYTES_PER_SECOND = 48000;

export function liveTranslationConfiguration(language) {
  if (!['ja', 'en'].includes(language)) {
    throw new RangeError('Unsupported pilot translation language');
  }

  return JSON.stringify({
    type: 'session.update',
    session: { audio: { output: { language } } },
  });
}

export function liveTranslationAudio(pcm) {
  if (!(pcm instanceof ArrayBuffer) || !pcm.byteLength || pcm.byteLength > 9600 || pcm.byteLength % 2) {
    throw new RangeError('Expected up to 200 ms of mono PCM16 at 24 kHz');
  }

  return JSON.stringify({
    type: 'session.input_audio_buffer.append',
    audio: btoa(String.fromCharCode(...new Uint8Array(pcm))),
  });
}
