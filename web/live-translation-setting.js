let enabled = false;

export function liveTranslationEnabled() { return enabled; }

export function createLiveTranslationSetting(el) {
  const label = el('label', 'GPT Live翻訳（試験）', 'admin-check');
  const input = el('input');
  const status = el('p', '', 'admin-caption');
  status.setAttribute('role', 'status');
  input.type = 'checkbox';
  input.checked = enabled;
  input.addEventListener('change', () => {
    enabled = input.checked;
    status.textContent = enabled
      ? '次のマイク開始からLive翻訳を試します。'
      : '次のマイク開始から通常翻訳を使います。';
  });
  label.prepend(input);
  const section = el('section');
  section.append(label, status);
  return section;
}
