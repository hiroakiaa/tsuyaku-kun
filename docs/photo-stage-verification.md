# Photo UI stages and playback — 2026-11-19

Published UI v273 (8d0ac12).

- Before selection: choose photo only.
- After selection: compact image; no visible original-open caption; change action inside bottom-right; borderless/background-free trash inside top-right. Selecting/deleting makes no AI calls.
- During translation: setup controls hidden, progress in image preview; available translated text can be played even while later groups fail/retry.
- Result: creation/language controls hidden; translated preview, photo actions, explicit language-change action and original/translation text tabs remain. Language settings open only on request.
- Playback issue: partial translation was explicitly disabled until every group completed. Removed that blanket disable; valid available text uses normal speech controls, safety checks retained. Audio panel has pointer/touch handling and stacking specified. No autoplay. Progressive rebuilds stop stale playback.

Public production assets tested in Chrome at 390x844 mobile/touch emulation and 1280x900 desktop. Actual clicks on original/translated play controls reach an injected speech engine; correct text submitted, playing/stop UI updates. Synthetic speech engine prevents audible testing and does not establish real-device speaker/voice availability. Partial translation playback also tested while another group returns service errors.

Public live OCR/translation flow with synthetic school handout passed: OCR HTTP200, two translation requests HTTP200, complete translated overlay. Separate public fixture checks passed image selection/delete/reselect, change-action placement, finished-result control visibility, optional language settings, tabs, loading and manual preview dismissal.

Physical iPhone Safari not available. Local screenshots: checks/photo-text-tabs/translated-mobile.png, translated-desktop.png; checks/photo-loading/selected.png.
