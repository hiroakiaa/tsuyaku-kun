# Progressive PDF translation — 2026-11-22

Published: documents v291 / admin310, implementation c9f9108.

## Changes
- The geometry-based Vision/photo path emits completed paragraphs while later batches are still translating. Unfinished paragraphs stay in the source language.
- Foreground readers subscribe to already-running prefetch progress. Partial results replay after navigation; revision and language checks reject stale updates. Partial layouts are never treated as completed cached layouts.
- Source page canvases are reused, bounded to three, rather than rerendering the PDF per batch.
- Foreground, prefetch pages, and languages share a two-request limiter.

## Public verification
HTML + 266 assets and API build matched. All 50 package test command groups passed. Delayed-batch tests prove early paragraph delivery; multi-page/language tests prove at most two concurrent translation requests. Controlled native mask and source-link checks passed at 390px and 1280px. The existing public guide answered the actual room-expiry question with page 2 and a yellow source marker.

Authorized original PDF, only pages 5/6/8, public app at 390x844:

| Original page | First translated regions | Complete layout |
|---|---:|---:|
|5|5.645 s|38.066 s|
|6|6.243 s|20.531 s|
|8|6.435 s|20.768 s|

All three showed partial translated regions before final completion. Private test documents were removed. Screenshots were inspected locally and are not committed. These are single-run measurements, not latency guarantees or a controlled comparison with the previous release.

Synthetic candidate measurement: first 3.381 / 4.501 / 3.705 s; complete 7.597 / 7.143 / 5.857 s; 3/3 progressive display, no clipped flag, private document removed.

## Rejected throughput experiments
Three concurrent requests hit the actual service concurrency limit, so that configuration was removed. Larger later batches (780 characters / 12 parts) reduced some calls but had mixed actual timings: original pages 5/6/8 completed in 51.364 / 16.796 / 17.549 s. The regression on page 5 means this was not adopted. Final published code retains the proven small-batch plan. All failed/successful private fixtures were removed.

## Limits / resume
This change covers complex tables, embedded images, and scans handled by the geometry-based path. The ordinary native-text full-page endpoint still returns a complete response and is not streamed. Total completion time is not proven shorter; the verified improvement is early visibility. Table-cell recognition/layout defects identified previously remain separate work.

Use tools/check-document-progressive-live.mjs with the runtime PLAYWRIGHT_PACKAGE path. CANDIDATE_NATIVE_TRANSLATION=1 tests local modules; omit it to test public code. It generates only synthetic material and removes the private fixture in finally. tools/check-authorized-progressive-live.mjs remains local-only for explicitly approved original pages 5/6/8. Default-host network denial is not a service error; use an explicit network escalation. Do not commit source text, original documents, or screenshots.
