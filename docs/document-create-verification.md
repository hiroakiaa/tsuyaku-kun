# Document creation flow — 2026-11-19

Published implementation 6b325e8; documents.js v255 / CSS v102; app document-library-274. Worker 6c690b17-81c0-4655-b52a-bdf7c4e3450a.

Changes: create form contains file then storage destination with no title input. Date/name title generated locally in JST (YYYYMMDD_filename without extension), bounded to 100 UTF-16 units without splitting a surrogate pair. Successful creation updates URL and opens reader/chat directly with reduced-motion-aware transitions. Creator can click the document title to edit; server enforces owner and updates shared-directory metadata. Surrounding PDF stage/scroll and translation layout use app background. Fit-width button precedes zoom-in in vertical controls.

Verified:
- Local browser flow at 390 and 1280 widths: form order, generated name, direct chat/PDF, enabled input, URL id, matching background color, fit-width position above zoom-in, saved rename.
- Public browser with actual OCR-free PDF/create/metadata/question APIs: generated Japanese PDF, created title 20261119_入学説明会, opened question screen without another button, edited/saved title, asked 参加費はいくらですか？; answer 1200円, source page 1 with exact quote 参加費は1200円です。. Test document removed afterward.
- Public production assets at 390/1280 widths with controlled PDF/translation responses: original PDF, inline translation, toggling, pinch/fit behavior passed.
- Unit tests: date boundary, Unicode title length, denied non-owner rename, shared directory update. All 19 package test commands passed.

Additional exploratory English-only PDF with a Japanese fee question did not reach the expected numeric-answer assertion within 90 seconds. Creation, auto-open and rename had completed; the test document was removed. This separate cross-language QA observation is not claimed fixed by the creation-UI change. A Japanese original subsequently passed the full live flow.

Browser testing used desktop Chrome and mobile touch emulation, not physical iPhone Safari. Screenshots under checks/document-create/. No extra AI request for naming/renaming.
