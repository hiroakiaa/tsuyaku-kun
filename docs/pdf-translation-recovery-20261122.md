# PDF translation recovery — 2026-11-22

Release: documents v290 / admin309, implementation 4f17389.

## Changes
- Detect table columns, rotated text, vertical labels, and substantial embedded images from geometry. Use document-scoped Vision recognition for those pages.
- Automatically recover native translation errors, unchanged foreign-script output, missing text coverage, and unsupported placement through the same recognition path.
- Expand translations inside detected ruled cells. Preserve original text masks and reject cell expansion around unrecognized illustration ink.
- Keep cached OCR shared between requested languages and preserve existing document/revision access boundaries. Blank pages do not call translation.

## Verification
- All 50 package test command groups passed.
- Controlled native translation rendering: 390px and 1280px; original photo pixels and borders preserved; zero overlapping blocks and zero untranslated Japanese in English fixture.
- Controlled source references: both widths; PDF icon + 10ページ; source navigation and yellow marker; saved and new answers.
- Candidate on public services, synthetic native 3-page PDF: all pages translated in-place with photo-overlay, no clipped flag. Timetable 24 blocks, vertical-label curriculum 19 blocks, illustrated checklist 15 blocks. Visually inspected screenshots. Private test document removed.

## Pending
- Public release verified: HTML + 266 assets and API build matched. Repeated all 3 synthetic pages without local overrides: 3/3 in-place translations, no clipping, test document deleted. Existing shared guide answered the actual 24-hour room-expiry question with page 2 reference and yellow marker.
- Original school PDF was inspected locally only. The automatic approval reviewer rejected uploading its page images to Google Cloud Vision. A specific approval question for pages 5, 6, and 8 is pending; no original page images uploaded in this work.
- These tests do not establish correctness for every possible PDF or every translation language. Narrow vertical cells can still need zoom/full-text inspection.

## Resume / alternatives
Use tools/check-complex-native-live.mjs with PLAYWRIGHT_PACKAGE set to the installed runtime Playwright path. CANDIDATE_NATIVE_TRANSLATION=1 tests local modules against the public app; omit it for the deployed version. The script generates only synthetic data and removes its private document in finally. Network is restricted under the default host: request escalation specifically for the synthetic test. Never substitute the original PDF into that route without the pending approval.

