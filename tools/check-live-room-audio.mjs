import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PACKAGE || 'playwright');
const [wav, base = 'https://hiroakiaa.github.io/tsuyaku-kun/'] = process.argv.slice(2);
assert.ok(wav, 'Pass a Japanese speech WAV file as the first argument');
const audio = resolve(wav);
await access(audio);

const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream',
    '--use-file-for-fake-audio-capture=' + audio + '%noloop'],
});
const failures = [];
try {
  for (const mode of ['interpreter', 'lesson']) {
    const options = { permissions: ['microphone'], viewport: { width: 390, height: 844 } };
    const [sender, receiver] = await Promise.all([browser.newContext(options), browser.newContext(options)]);
    try {
      const [speaker, listener] = await Promise.all([sender.newPage(), receiver.newPage()]);
      for (const page of [speaker, listener]) page.setDefaultTimeout(25000);
      const setOptions = async (page, labels) => {
        await page.locator('#admin').click();
        await page.locator('#modal').getByRole('tab', { name: '設定・説明' }).click();
        for (const label of labels) await page.locator('#modal').getByLabel(label, { exact: true }).check();
        await page.locator('#modal-close').click();
      };
      await speaker.goto(base);
      await speaker.locator('#microphone:not([disabled])').waitFor();
      await speaker.locator('#tab-' + mode).click();
      if (mode === 'lesson') {
        await speaker.locator('#lesson-role-teacher').click();
        const code = speaker.locator('#lesson-room-code').filter({ hasText: /\d{4}/ });
        await code.waitFor();
        await listener.goto(base);
        await listener.locator('#tab-lesson').click();
        await listener.locator('#lesson-role-student').click();
        await listener.locator('#lesson-language').selectOption('en');
        await listener.locator('#lesson-code-input').fill((await code.innerText()).match(/\d{4}/)[0]);
        await listener.locator('#join-lesson').click();
      } else {
        const invite = speaker.locator('#call-invite-link');
        await invite.waitFor({ state: 'attached' });
        await listener.goto(await invite.inputValue());
        await listener.locator('#modal-body select').selectOption('en');
        await listener.locator('.chat-join-button').click();
        await speaker.locator('.chat-person[data-chat-side=other]').click();
        await speaker.locator('.chat-request-row [data-allow=true]').click();
        await speaker.locator('#modal-close').click();
      }
      await listener.locator('#live:not([hidden])').waitFor();
      await setOptions(listener, ['Live要約']);
      await setOptions(speaker, ['GPT Live翻訳（試験）']);
      const summaryRequest = listener.waitForRequest(request =>
        new URL(request.url()).pathname === '/live-summary' && request.method() === 'POST',
      { timeout: 100000 });
      void summaryRequest.catch(() => {});
      await speaker.locator('#microphone').click();
      const preview = speaker.locator('[aria-label="Live翻訳の試験字幕"]');
      await preview.locator('.live-caption-card p').filter({ hasText: /[a-z]{2}/i }).waitFor();
      await speaker.locator('#microphone').click();
      const caption = listener.locator('#captions .caption')
        .filter({ has: listener.locator('.caption-line-source[data-language=ja] > p', { hasText: /[ぁ-んァ-ン一-龯]/ }) })
        .filter({ has: listener.locator('.caption-line-primary.caption-line-translation[data-language=en] > p', { hasText: /[a-z]{2}/i }) })
        .first();
      await caption.waitFor();
      const original = await caption.locator('.caption-line-source > p').innerText();
      const translated = await caption.locator('.caption-line-primary > p').innerText();
      assert.notEqual(original.trim(), translated.trim());
      await listener.getByRole('button', { name: /要約を表示/ }).click();
      const request = await summaryRequest;
      const { transcript, language } = request.postDataJSON();
      assert.equal(language, 'en');
      assert.ok(transcript.includes(original.trim()) || transcript.includes(translated.trim()),
        'The receiver summary request must contain the received speech');
      const output = listener.getByRole('region', { name: 'Live要約の本文' })
        .or(listener.locator('[aria-label="Live要約の本文"]'));
      await output.locator('p, li, h3').first().waitFor();
      console.log(mode + ': paired caption and receiver summary passed');
    } catch (error) {
      failures.push(mode);
      console.error(mode + ': ' + String(error.message).split('\n').slice(0, 4).join('\n'));
    } finally {
      await Promise.all([sender.close(), receiver.close()]);
    }
  }
} finally {
  await browser.close();
}
assert.deepEqual(failures, []);
