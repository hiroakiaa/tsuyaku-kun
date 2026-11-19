# Image PDF blank margins — 2026-11-19

Published c0499b1; app document-library-275; documents.js v256; conversion v95.

Cause: old image conversion rasterized the selected image onto a white 1120x1584 A4 mat, then embedded the entire mat in PDF. Changing CSS outside the PDF canvas could not affect those white pixels.

Fix:
- New image conversion uses the source aspect ratio and draws the image edge to edge on its PDF page. Excel/Word pagination unchanged.
- Existing legacy app conversions are detected from a single 1120x1584 image, A4 page dimensions and no vector text. In image-dense pages only, outer blank bands are detected from a local small canvas and filled with the current app background during rendering. Stored PDF bytes and page/citation coordinates are unchanged. Normal vector-text PDF pages, sparse text scans and converted Excel pages are excluded. This is intentionally not a blanket replacement of every white pixel.
- Original and inline-translation PDF render paths use the same margin treatment. No extra OCR, AI or network call for margin detection.

Verification:
- Public production HTML/JS with deterministic synthetic legacy PDF and new converted image fixtures, at 390 and 1280 widths: legacy corner pixel rgb(29,29,29), matching app background; photographic color rgb(37,142,138) retained; white detail inside image rgb(255,255,255) retained. New image PDF ratio 1000/600 with no A4 mat. All four cases passed.
- Visually inspected public screenshots: checks/image-margins/public-{legacy,modern}-{390,1280}.png.
- Public original/translation/zoom regressions at both widths passed. Local document create/rename flow passed. All 20 configured package test commands passed.
- No public test documents created; PDF fixtures supplied to the browser with controlled API responses. User's particular private document was not opened; equivalent legacy conversion structure was tested. Browser Chrome, mobile touch emulation, not physical Safari.
