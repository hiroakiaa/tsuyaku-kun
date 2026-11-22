# Dedicated document translation trial — 2026-11-23 JST

Prepared Azure Translator array-input support (one request, positional output checks, existing F0 budget reservations and cleanup) and an optional fast photo/document translation path with numeric/translation warning checks and the existing LLM fallback. Source path is now disabled unless DOCUMENT_FAST_TRANSLATION is exactly azure-consented-v1. Do not enable or deploy the fast path before pending explicit consent is received.

Synthetic public 3-page experiment after temporary Worker deployment f85b32c0-e9cb-49f5-868c-93f5ad2644e9: first regions 5361 / 1534 / 1085 ms; whole pages 10688 / 1908 / 1336 ms. All finished in place and the private fixture was removed. These are single-run measurements, not a guaranteed SLA; slow first page likely used the existing fallback, but provider telemetry was not captured, so this explanation is unconfirmed. No original school PDF was used in this trial.

An automatic approval rejection stopped the follow-up mutation/deployment because explicit consent to send potentially personal document text to Azure was missing. The rejected compound command did not execute (no auto-language enhancement, package registration, or new live tool was written). User was informed and an async explicit consent question is pending.

Successfully rolled public Worker back to c873e200-092b-4a64-a07a-8d43da8f22d4 (100% traffic). Existing frontend progressive display remains public. This restores the original translation provider path. Source changes remain uncommitted for review/resume; do not report the fast path as public.

Tests: document-fast-translation test passed for batch row order, one request, exact quota accounting, partial output rejection and lease cleanup. Existing photo-reuse and lesson-economy tests passed. Check the current session's complete suite result before claiming all tests. Keep credentials out of output.

Next: after explicit consent, support source auto by omitting Azure from parameter and validate auto/mixed languages; add the dedicated test to package.json; capture actual provider on each synthetic response; deploy with the explicit flag, compare identical questions/page contents and latency; verify cache reuse and fallback. Ordinary native-text full-page translation still needs its own dedicated route; this trial addresses the Vision/photo path only. Retain doc/revision privacy scopes and free-quota controls.

## Approved release and verification
The user explicitly authorized sending document text to Azure Translator in the next turn. Enabled DOCUMENT_FAST_TRANSLATION=azure-consented-v1 in wrangler.jsonc and deployed Worker 7dd5ec9c-507a-4d71-b18f-a4d417b12edc. The fast path is restricted to document-scoped operations (fastTranslation is set server-side only when documentScope exists), not ordinary private photo translation. Source auto is supported by omitting Azure's from parameter. Easy Japanese and unsupported/problematic results retain the existing translation path. No PDF image is sent to Azure.

All 51 package test command groups passed. Public provider telemetry confirmed azure_f0. A repeated synthetic document translation returned reuse=cache, zero input/output tokens and cacheHit=true. Two public synthetic runs completed all three pages in 1.818/1.535/1.191 seconds and 1.352/1.428/1.115 seconds respectively, with progressive in-place display. Private fixtures were removed.

Authorized original PDF pages 5/6/8, same 390x844 browser flow as previous test:
- Page 5: first regions 1.382 s; final 3.718 s (previous final 38.066 s).
- Page 6: first regions 1.427 s; final 7.258 s (previous final 20.531 s).
- Page 8: first regions 1.024 s; final 17.964 s (previous final 20.768 s).
These single-run measurements are not controlled statistical benchmarks or guarantees. Some blocks can still use the slower fallback; source OCR, warnings and table-layout limits remain. Original PDF text and screenshots are not committed. The private original-page fixture was removed. The existing public guide's actual room-expiry question still answered with page 2 and a yellow marker.

The previous automatic-approval blocker is resolved by explicit user consent; the rollback described above is historical. Current public Worker is the approved fast-path release. Ordinary native full-page /translate remains outside this fast path and needs separate follow-up. The three-page test does not establish arbitrary-document or all-language accuracy.
