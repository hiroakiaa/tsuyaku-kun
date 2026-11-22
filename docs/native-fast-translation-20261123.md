# Native PDF fast translation and selective repair — 2026-11-23

Public Worker: 948a6f97-dca4-422d-80d9-802cc41b76d8. Uses the user's existing explicit Azure document-text consent and F0 limits. PDF images are not sent to Azure.

Changes:
- Ordinary native-text page translations can use Azure with exact source/translation row identity, automatic language detection, bounded requests and per-viewer budget accounting.
- Defined document terminology and diagram context retain the existing contextual translation path. Unsupported simplification, oversized rows, provider failures and quality checks do not bypass existing safeguards.
- Preserve valid Azure rows and repair only warning-bearing rows. Native repair checkpoints use a separate namespace so old checkpoint batches cannot be applied to a different subset. Photo/scan repair likewise sends only failed block IDs, then merges them back in source order.
- Existing document-local page cache, revision scopes, in-flight deduplication and deletion checks remain in use. Native responses include a non-content fastTranslation diagnostic code for route investigation.

Verification:
- All 51 package test commands passed. Added tests cover native row identity, numeric drift requiring repair, oversized/unsupported input, and retaining valid fast translations while repairing only a bad block.
- Public ordinary native PDF, same synthetic numeric source: original model request 3374 ms; final Azure + selective-repair request 2984 ms. This is a small single-run difference, not a statistical throughput claim. Two intermediate full-fallback runs were 2871 and 2613 ms and are not the final selective implementation.
- Separate ordinary prose fixture without numeric repair: Azure response 348 ms, 9 source rows, native rendering (no Vision routing), saved page reused on the next request. This is translation HTTP response time, not the entire upload/open/render duration and not a before/after comparison with the numeric fixture.
- Same authorized original school PDF pages 5/6/8 at 390x844: first translated regions 1759 / 1505 / 1096 ms; full display 3767 / 4336 / 7398 ms. Previous approved fast release full times were 3718 / 7258 / 17964 ms. Page 5 shows no meaningful improvement; pages 6 and 8 were faster in this run. Provider telemetry confirmed azure_f0+repair for repaired subsets.
- Existing public guide: actual room-expiry question answered with page 2 link and yellow marker. All private fixtures removed, including intermediate experiments.

Visual review: ordinary prose and numeric fixture screenshots were inspected. The older native renderer has clipped/awkward line wrapping in some regions; the before screenshot also shows clipping. Do not present this speed change as fixing arbitrary-document layout accuracy. Original table-cell OCR/layout defects are separate remaining work. All timings are single runs and depend on OCR, warnings, source complexity and service load.

Resume: tools/check-native-fast-live.mjs generates synthetic native PDFs, measures generated translation response separately from cached replay, asserts native routing and removes the private document in finally. Set NATIVE_BASELINE=1 for a before record; NATIVE_NO_NUMBERS=1 for the distinct plain-prose fixture. Use runtime PLAYWRIGHT_PACKAGE path and explicit network escalation. Authorized original-page tools stay local-only; never commit private PDF/text/screenshots.
