export const LIVE_CAPTION_HISTORY_LIMIT = 6000;

export function createLiveCaptionBuffer(languages, limit = 1000) {
  const captions = new Map(languages.map(language => [language, { full: '', tail: '' }]));
  return {
    append(language, event) {
      if (event.field !== 'translation' || !captions.has(language)) return null;
      const caption = captions.get(language);
      caption.tail = (caption.tail + event.delta).slice(-limit);
      if (caption.full !== null) {
        const full = caption.full + event.delta;
        caption.full = full.length <= LIVE_CAPTION_HISTORY_LIMIT ? full : null;
      }
      return caption.tail;
    },
    complete(language) {
      return captions.get(language)?.full?.trim() || null;
    },
  };
}
