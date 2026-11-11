import { connectOwner } from './billing-view.js';

let owner = null;
let activation = 0;

export function liveTranslationEnabled() { return owner !== null; }

export async function liveTranslationToken() {
  return owner ? owner.token() : null;
}

export function createLiveTranslationSetting(el) {
  const label = el('label', 'GPT Live翻訳（試験）', 'admin-check');
  const input = el('input');
  const status = el('p', '', 'admin-caption');
  status.setAttribute('role', 'status');
  input.type = 'checkbox';
  input.checked = Boolean(owner);
  input.addEventListener('change', async () => {
    const attempt = ++activation;
    if (!input.checked) {
      const previous = owner;
      owner = null;
      status.textContent = '次のマイク開始から通常翻訳を使います。';
      if (previous) await previous.close().catch(() => {});
      return;
    }
    input.disabled = true;
    status.textContent = 'Googleで管理者本人を確認しています。';
    const timeout = setTimeout(() => {
      if (attempt !== activation) return;
      activation++;
      input.checked = false;
      input.disabled = false;
      status.textContent = 'Googleの確認画面を閉じてから、もう一度お試しください。';
    }, 90000);
    try {
      const connection = await connectOwner('live-translation-admin');
      if (attempt !== activation || !label.isConnected) {
        if (attempt === activation) await connection.close();
        return;
      }
      owner = connection;
      status.textContent = '次のマイク開始から試験設定を適用します。';
    } catch {
      if (attempt !== activation) return;
      input.checked = false;
      status.textContent = '管理者認証を完了できませんでした。';
    } finally {
      clearTimeout(timeout);
      if (attempt === activation) input.disabled = false;
    }
  });
  label.prepend(input);
  const section = el('section');
  section.append(label, status);
  return section;
}
