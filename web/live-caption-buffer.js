export function createLiveCaptionBuffer(languages, limit = 1000) {
  const captions = new Map(languages.map(language => [language, '']));
  return {
    append(language, event) {
      if (event.field !== 'translation' || !captions.has(language)) return null;
      const text = (captions.get(language) + event.delta).slice(-limit);
      captions.set(language, text);
      return text;
    },
  };
}
