# Cached PDF translation placement — 2026-11-20

Published 03308c5; app document-library-278; documents.js v259; pdf-translation-alignment query 20261120-layout-2.

User screenshot showed English 12/12 plus placement retry, so translation retrieval had completed and the placement layer failed. The preceding preference/stacking changes did not address this failure class.

Changes:
- Match cached source ranges even when a source boundary lies inside a native PDF text run; split that run's text and geometry at verified boundaries, preserve total width, reorder cached rows onto physical lines.
- Ignore invisible PDF direction/control characters during correspondence (not arbitrary fuzzy source matching).
- Use font transform height if item height is zero; tolerate numerical skew below 0.001. Unsupported zero-width or rotated blocks do not reject every other valid block on the page; original remains for unplaceable blocks.
- Retain strict source text coverage and wrong-document rejection; existing geometry-refresh retry remains bounded. Diagnostics include stages/counts only, not document text. No new model/API call for this alignment.

Validation:
- Unit regression: School/handbook cached source split within one School handbook native item now produces two positioned runs; invisibles match, width conserved, wrong-document test remains rejected. All20 package commands passed.
- Public production assets at390/1280 with controlled cached translation response: source boundaries inside a PDF run rendered inline.
- Public assets at390/1280 with controlled font metrics: first item's height zero and tiny skew rendered inline.
- Actual public administrator -> common library -> existing 【資料】通訳くん, no API/auth mocks: 32 positioned English spans at both widths; original toggle and library reopen retained translated display; no JS/document HTTP errors.
- Screenshots inspected under checks/document-inline and checks/library-translation. No public documents created/removed.

The user's private 通訳君説明 record was not accessible here; its exact stored source/translation data and physical iPad Safari were not tested. Shared-document Chrome checks and fault-fixture cases are not represented as proof of the exact private record.
