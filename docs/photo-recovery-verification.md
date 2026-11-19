# Photo translation recovery — 2026-11-19

Published UI v272, implementation eca964c. Worker 284735ea-59a1-451f-ac14-ee0274efd859.

## Problem and change
Previously transient errors retried the same batch then stopped; malformed/missing translations were validated outside the retry operation. Failure handling now validates within retry, switches a failing primary provider to the existing OpenAI document-QA connection, and adaptively splits only failing client batches. Successful groups/subgroups are cached. At most 8 client network attempts per original batch and 2 split levels. Authentication, app budget, billing and quota errors never trigger provider switching; no unbounded loop.

## Verified
- Public normal live API: source-auto Japanese text translated to English; repeated translation cache hit with zero extra input/output tokens; repeated synthetic-photo OCR used one provider call.
- Public mobile browser with real OCR/translation requests and deliberate first-batch 502 injection: 3 injected errors; automatic split followed by 3 successful live translation requests total (including another independent group); complete English overlay, no user retry, no remaining generic error. Original conditions retained: Oct 20, 1200 yen, no lunch needed, textbooks/writing tools, prior-day absence notification, meeting place undecided.
- Public assets with deterministic service failures: A/C once each; failing B retried 3 times then smaller B translated once/reused; complete result and loading cleared. Original/translated text tabs remain functional.
- Recovery-provider unit tests: service and malformed-output failures switch provider; auth/quota/budget errors do not; request sends text only with store:false and JSON output, 12-second timeout/1536 output-token cap. Actual token cost settles through existing guarded budget (30 input/20 output = 44 microUSD).
- All 18 package test commands passed. Extra photo-overlay and mobile preview/pinch checks passed.

User's particular original provider failure did not reproduce in the normal live probe. The alternate-provider path was verified with injected/unit provider responses; the live browser recovery test used injected HTTP failures plus real successful provider calls, not an outage imposed on the production AI. Physical iPhone Safari was not available.

Cost policy and official pricing source: see docs/cost-review.md and web/cost-policy.js. No image pixels sent to OpenAI.
