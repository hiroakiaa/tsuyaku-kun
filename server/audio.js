const MAX_BYTES=512044;
export function validWav(bytes) {
  if (bytes.length < 44 + 16000 || bytes.length > MAX_BYTES || bytes.length % 2) return false;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const word = (at, size) => new TextDecoder().decode(bytes.subarray(at, at + size));
  return word(0,4) === 'RIFF' && word(8,4) === 'WAVE' && word(12,4) === 'fmt ' && word(36,4) === 'data' &&
    view.getUint32(4,true) === bytes.length - 8 && view.getUint32(16,true) === 16 && view.getUint16(20,true) === 1 &&
    view.getUint16(22,true) === 1 && view.getUint32(24,true) === 16000 && view.getUint32(28,true) === 32000 &&
    view.getUint16(32,true) === 2 && view.getUint16(34,true) === 16 && view.getUint32(40,true) === bytes.length - 44;
}

export function hasSpeechEnergy(wav) {
  const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);
  const levels = []; let active = 0;
  // 20ms frames, removing DC: clicks, a steady fan or mic offset are not speech.
  for (let at = 44; at + 640 <= wav.length; at += 640) {
    let sum = 0, squares = 0;
    for (let i = 0; i < 320; i++) { const x = view.getInt16(at + i * 2, true) / 32768; sum += x; squares += x * x; }
    const rms = Math.sqrt(Math.max(0, squares / 320 - (sum / 320) ** 2));
    levels.push(rms); if (rms >= 0.004) active++;
  }
  if (active < 6) return false;
  levels.sort((a,b) => a-b);
  const low = levels[Math.floor(levels.length * .2)], high = levels[Math.floor(levels.length * .9)];
  return high >= 0.004 && high > low * 1.5;
}

export function cleanRecognition(result) {
  const text = result?.text ?? result?.transcription_info?.text;
  if (typeof text !== 'string') return null;
  const normalized = text.normalize('NFKC').replace(/[\s、。,.!！?？…]/g, '');
  // A standalone stock outro is a known silence hallucination. Preserve quotes
  // and ordinary sentences containing these words rather than rewriting speech.
  if (/^(?:ご視聴(?:どうも)?ありがとうございました|ご視聴ありがとうございます)+$/.test(normalized)) return '';
  const segments = result.segments || result.transcription_info?.segments;
  if (Array.isArray(segments) && segments.length) {
    // Never remove words solely because they repeat: confidence evidence is required.
    const unreliable = segment =>
      (Number.isFinite(segment.no_speech_prob) && segment.no_speech_prob >= .35) ||
      (Number.isFinite(segment.avg_logprob) && segment.avg_logprob < -1 &&
        Number.isFinite(segment.compression_ratio) && segment.compression_ratio > 2.4);
    const kept = segments.filter(segment => !unreliable(segment));
    if (!kept.length) return '';
    // Preserve reliable speech around rejected noise, only when complete segment text is available.
    if (kept.length !== segments.length && segments.every(segment => typeof segment.text === 'string'))
      return kept.map(segment => segment.text.trim()).filter(Boolean).join(' ').slice(0, 600);
  }
  return text.trim().slice(0, 600);
}


