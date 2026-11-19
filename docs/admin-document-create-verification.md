# Public administrator document-creation verification — 2026-11-19

UI tested: document-library-274, documents.js v255 / CSS v102. Existing implementation required no further application fix.

Actual route in both independent browser contexts:
1. Open public app root.
2. Open administrator gate and configure the isolated test browser's local password through the visible form.
3. Click administrator 資料QA tab.
4. In its iframe, open 資料チャット作成.
5. Select a generated Japanese PDF; leave storage as device-only; create.

No API/authentication mocks or response interception were used. Real browser Firebase authentication and public API requests were used.

| Check | 390px / one column | 1280px / two columns |
|---|---|---|
| File then storage, no title input | Pass | Pass |
| Automatic name 20261119_入学説明会_操作確認 | Pass | Pass |
| Opens PDF/chat without an extra button | Pass | Pass |
| Question input visible/enabled | Pass | Pass |
| Click title, save rename, read persisted server title | Pass | Pass |
| PDF surrounding area matches app rgb(29,29,29) | Pass | Pass |
| Fit-width button vertically above zoom-in | Pass | Pass |
| JavaScript errors | None | None |
| Test document removed via live API | HTTP200 | HTTP200 |

Layout was measured from the actual embedded frame: 390px -> stacked; 1265px inner frame in 1280px window -> side-by-side. Two independent synthetic private documents were created and deleted; no common-library documents modified.

Screenshots and structured measurements: checks/admin-document-create/{390,1280}-{zoom,edited}.png and results.json (local artifacts). Test: tools/check-admin-document-create.mjs. Browser: Chrome, desktop and mobile touch emulation; not physical iPhone Safari.
