# Library-selected document translation — 2026-11-20

Published implementation 45cd2fc + navigation refresh ce2faf0; app document-library-277; documents.js v258 / CSS v103.

Reproduced problems on previous public version:
- Translation overlay intercepted physical clicks on the original/translated toggle (same stacking level, later document layer painted above controls).
- After selecting original, closing to library and selecting English there, reopening restored translationMode empty instead of English. Diagnosed mode restoration with programmatic toggle activation after the pointer-blocking issue was identified; assertion failed empty versus en.
- Inspection found failed/empty OCR and layout source promises could remain cached; failures could make later translation alignment stay unusable.

Fix:
- Opening/reopening always honors current selected language; reading page position preserved, and users can still select original while viewing.
- Document scroll layer gets isolated stacking context; toolbar above translation layers.
- Failed/empty local OCR/layout no longer retained indefinitely. On placement failure, refresh geometry and reattempt once automatically. Late results from previous languages cannot install a stale overlay.
- Internal library/create/close links refreshed consistently to v258 instead of old v232/v37 cache keys.

Public verification without API/authentication mocks:
- Actual root app -> visible admin password gate in isolated profile -> QA -> common library -> existing 【資料】通訳くん.
- 390px and 1280px: select English -> 32 positioned English spans, original button physical click -> source display, close to library -> Japanese/English selection -> reopen -> English automatically selected and 32 spans visible. No JS errors or document HTTP failures observed. No documents created or deleted, existing source data unchanged.
- Screenshots: checks/library-translation/public-{390,1280}.png (local).

Controlled public-asset regressions at both widths:
- Rapid en/pt/en switching ends in correct active language.
- Stored original preference does not override selected language after reload.
- Two injected empty local OCR results recover to line geometry and inline translation automatically (module-level test injection, not a production OCR outage).
- Original/translation toggles physically clickable; zoom and position preserved. All20 package test commands passed, image-margin and create/rename regressions passed locally.

Chrome mobile touch emulation and desktop; not physical Safari. No claim of accessing the user's particular private document. See docs/cost-review.md for bounded automatic recovery cost behavior.
