# Photo translation selection flow — 2026-11-19

Published UI: document-library-269 (2ccc762). Worker: 10eaaf87-65c4-464e-b925-d7b06844afbe.

- Initial form: photo selection only; target and translation controls hidden.
- Selected photo: compact original preview, immediate clear button, one target-language selector, translate button. New controls animate in; reduced-motion respected.
- Clear and reselect: no confirmation and no API calls, controls return to initial state.
- Source detection: confident OCR language reused, otherwise existing translation call handles automatic per-block source detection. No extra detection request.
- Public browser test: tools/check-photo-live-flow.mjs used public production HTML/JS/CSS with actual production OCR and translation API calls, using anonymous test authentication and a synthetic school handout. OCR 200; both translation chunks 200; English overlay rendered, no page errors.
- Actual translation matched synthetic original: deadline October 20; fee 1200 yen; lunch unnecessary; absence contact by previous day; meeting place undecided.
- Public automatic-source API check: Japanese text translated into English with source auto; repeat translation returned cache and 0 input/output tokens.
- Public assets with controlled API responses: staged show/hide, clear/reselect, loading, early dismissal, pinch minimum/anchor and automatic continuation checked separately.
- Unit suite: all 17 configured commands passed; photo-overlay unit test passed separately including automatic-source and language-confidence fallback cases.
- Screenshots: checks/photo-selection/public-initial.png, public-selected.png, public-translated.png (local artifacts).

Verification ran in desktop Chrome with a mobile viewport/touch emulation, not physical iPhone Safari.
