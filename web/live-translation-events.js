const transcriptFields = new Map([
  ['session.input_transcript.delta', 'source'],
  ['session.output_transcript.delta', 'translation'],
]);

export function readLiveTranslationEvent(payload) {
  if (typeof payload !== 'string') return null;
  let event;
  try {
    event = JSON.parse(payload);
  } catch {
    return null;
  }

  const field = transcriptFields.get(event?.type);
  if (field && typeof event.delta === 'string' && event.delta.length) {
    return { type: 'transcript', field, delta: event.delta, ...(Number.isFinite(event.elapsed_ms) && event.elapsed_ms >= 0 ? { elapsedMs: event.elapsed_ms } : {}) };
  }
  if (event?.type === 'session.closed') return { type: 'closed' };
  if (event?.type === 'error') return { type: 'error' };
  return null;
}
