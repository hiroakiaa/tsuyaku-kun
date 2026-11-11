import { config } from './config.js';
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
    let connection;
    try {
      connection = await connectOwner('live-translation-admin');
      clearTimeout(timeout);
      if (attempt !== activation || !label.isConnected) {
        if (attempt === activation) await connection.close();
        return;
      }
      const token = await connection.token();
      const response = await fetch(config.api + '/billing/openai-connection', {
        headers: { Authorization: 'Bearer ' + token },
        cache: 'no-store',
        signal: AbortSignal.timeout(10000),
      });
      const result = await response.json();
      if (attempt !== activation) return;
      if (!label.isConnected) {
        await connection.close();
        return;
      }
      if (!response.ok || !result.connected || !result.modelAvailable) {
        input.checked = false;
        status.textContent = 'OpenAI接続を確認できませんでした（' +
          (result.upstreamStatus ?? result.reason ?? response.status) + '）。';
        await connection.close();
        return;
      }
      owner = connection;
      status.textContent = 'OpenAI接続を確認しました。次のマイク開始からLive翻訳を使います。';
    } catch (error) {
      if (attempt !== activation) return;
      input.checked = false;
      if (connection) {
        status.textContent = 'OpenAI接続の確認に失敗しました。';
      } else if (error?.code === 'auth/popup-closed-by-user') {
        status.textContent = 'Googleの認証が完了する前に画面が閉じられました。';
      } else if (error?.code === 'auth/popup-blocked') {
        status.textContent = 'ブラウザーで通訳君のポップアップを許可して、もう一度お試しください。';
      } else if (error?.code === 'auth/network-request-failed') {
        status.textContent = 'Google認証との通信に失敗しました。';
      } else {
        status.textContent = '管理者認証を完了できませんでした。';
      }
      await connection?.close().catch(() => {});
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
