# Existing app usability review

No new product features. Work in rounds of 20 findings; an implemented CSS change is not a verified fix until the affected screens have been inspected.

## Round 1 — verified for release 20261020-usability-1

Viewport targets: 280×653, 320×568, 360×640, 390×844, 568×320, 667×375, 844×390, 900×600, 1024×600, 1280×720, 1440×900. Check English guides both on and off. Also inspect modal content and keyboard focus; browser viewport simulation does not prove physical keyboard, microphone or mobile-browser behavior.

1. Low-height layout must respond to height, not only width.
2. Preserve caption reading space in landscape.
3. Keep microphone controls above navigation with English guides.
4. Reduce header vertical gaps on low screens.
5. Keep primary controls at usable touch sizes.
6. Allow overflowing call settings to scroll separately.
7. Prevent participant rows consuming all reading space.
8. Keep dialog bottom actions reachable.
9. Keep dialog close action from shrinking under long titles.
10. Position notifications relative to actual navigation reservation.
11. Limit long notifications without clipping the page.
12. Preserve compact role picker spacing.
13. Avoid excess empty-caption padding on short screens.
14. Keep language exchange controls compact in landscape sidebar.
15. Avoid narrow-screen language selectors forcing horizontal overflow.
16. Allow long dictionary titles to wrap.
17. Keep dictionary category controls reachable by horizontal scroll.
18. Keep admin tabs reachable by horizontal scroll.
19. Replace misleading waiting cursor on disabled controls.
20. Leave breathing space around focused inputs and scrolled captions.

Status: height-aware CSS implemented and verified in a dedicated headless Chrome after explicit user authorization. All 11 viewports × English guides on/off × 9 screens passed the geometry checks (198 cases, zero browser exceptions). Representative screenshots were visually inspected. Synthetic auth and room transport isolate layout from paid APIs; physical-device audio is not part of this proof.

## Interaction findings — next round in preparation

- Room-ID validation previously returned silently for incomplete input. It now explains the expected four digits, marks the field invalid and focuses it. Full-width digits normalize before submission, avoiding native HTML pattern rejection before the handler runs.
- Modal messages previously stayed in the page behind the modal top layer. The existing live region now moves into an open modal and returns to its original location when it closes. No second notification system is introduced.
- Modal opening previously blurred the active element, leaving keyboard users without a clear focus. The close control now takes initial focus without opening a text keyboard automatically.
- Added regression checks for code normalization/validation, late join success/failure after navigating back, and repeated modal open/close live-region restoration. Full existing test suite passes after adapting DOM test doubles and extraction boundaries.
- The 568×320 landscape target needs side-by-side layout too: the short-height breakpoint now begins at 480px width rather than 600px. The actual rendering still requires browser verification.

Browser reconnection attempted on the next goal turn: inventory works, but a fresh app tab still times out at the browser's focus-emulation command. No visual verification or deployment claimed.

Further review: reconnecting text submissions previously remained in the input after being queued. Pressing Send again allocated a new caption ID and could replay the same sentence twice. Once the existing queue owns the caption, the draft is now cleared; the caption itself stays visible. A regression test verifies two consecutive submits create only one queued caption and a late submission after leaving does not throw or erase the draft. A delayed close event from a preceding modal no longer moves feedback out of a newly opened modal.

The earlier visual-verification gate was resolved using the dedicated Playwright test browser explicitly authorized by the user. Loading the original page reproduced a timeout; investigation found two versions of the English-guide module being loaded. Removing the extra script and making initialization idempotent restored responsiveness. A second module-version import is now exercised in every viewport test and must leave exactly one English toggle and a responsive animation frame.

## Release verification, 2026-10-20

- `npm test`: passed, including queued-text duplication, room-ID guidance and delayed modal-close regressions.
- `tools/check-viewports.mjs`: 198 checks passed with no geometry failures or page exceptions. Screens: conversation, language dialog, call invitation, lesson role picker, student entry, teacher view, dictionary search, photo dialog and admin overview. Admin analysis JSON was generated and checked for the delivery section and absence of the synthetic token, then the admin view was locked.
- Reproduced and fixed a 3px QR clipping issue at 568×320 with English guides. On short waiting-call screens, invitation controls use the available width instead of leaving an unused caption placeholder.
- Reproduction uses Playwright available as `playwright` or via the `PLAYWRIGHT_PACKAGE` environment variable, installed Chrome, and synthetic in-memory auth/room responses. Optional `VIEWPORTS` accepts an array of width/height pairs. Generated screenshots and detailed measurements live under ignored/untracked `checks/viewports/`; they are not user conversation logs.
- New source/build identifier: `20261020-usability-1`. Publish through the existing main-branch workflow and run `tools/verify-release.mjs`; this now compares actual script/module/style contents as well as entry version.
- Limits: headless Chrome validates layout and DOM operations, not actual iPhone Safari, Android capture, Bluetooth, physical keyboards or real peer audio. No new product feature, provider, quota or permission was added.

## Round 2 — verified for release 20261021-interactions-1

The browser fixture was extracted into `tools/browser-fixture.mjs` so the layout and interaction suites use the same synthetic network setup. `tools/check-interactions.mjs` initially reproduced six defects at all three target sizes (390×844, 568×320, 1024×600). Further probes reproduced inside-to-outside modal drag dismissal, category scroll restoration after English annotation, and stale clipboard errors after changing mode. Final interaction suite: 63 cases across three viewport sizes, no failures or browser exceptions. Unit suite passes. Full layout regression suite also passed: 198 cases, no geometry failures or browser exceptions.

Review queue (related changes are tested together; do not equate scenario count with improvement count):

1. Keep a dialog open when its internal padding is clicked — fixed and reproduced.
2. Do not dismiss a dialog after dragging from inside to outside — fixed and reproduced.
3. Preserve each speaker's unsent draft when switching speakers — fixed; browser test restores the original draft.
4. Synchronize invitation language after changing the header language setting — fixed and reproduced.
5. Keep keyboard focus on the selected dictionary category after rerender — fixed and reproduced.
6. Move focus to newly expanded dictionary results — fixed and reproduced.
7. Return focus to Show more after collapsing results — fixed and tested.
8. Preserve the category strip's scroll position while searching — fixed after testing English annotation timing.
9. Clamp selected-category centering at both scroll edges — verified at both scroll edges.
10. Honor reduced motion when centering categories — verified with the browser reduced-motion preference.
11. Bound search to the visible viewport width — implemented, unit and browser geometry tested.
12. Keep search within reduced visible height during keyboard/zoom changes — implemented with bounds and scrollable content; emulated, not a physical mobile-keyboard test.
13. Reposition an open search on visual viewport pan/resize — verified by visible viewport resize and pan events.
14. Restore the selected mode after an idle application update; invalid saved values fall back safely — fixed and tested, key consumed once.
15. Explain how to recover from an empty dictionary search — implemented as a polite status notice.
16. Suppress clipboard failure feedback from a room that has already been left — fixed and reproduced; fallback link is selectable.
17. Ignore delayed lesson-room-ID copy completion after leaving — reproduced and fixed for the active room, with a snapshot of the copied ID.
18. Assign the correct language to multilingual caption/reference paragraphs — fixed and browser-tested, with Japanese retained on missing-translation guidance.
19. Clear stale invalid-input state when returning to student entry — reproduced and fixed; the entered ID itself remains available for correction.
20. Ignore UI-only mutations when marking unread captions — old code reproduced the playback-label defect cleanly at all three sizes; fixed code compares actual paragraph content, and still marks genuinely new captions.

Drafts introduced here are memory-only and cleared by the existing conversation reset. No conversation text, credential or new preference is persisted. The validated build is `20261021-interactions-1`; deployment and public-file verification use the existing main-branch release workflow. Screens with only 80px of visible height keep the search input inside the bounded popover. These reduced-viewport checks are emulated; no physical iOS keyboard or pinch-zoom claim is made.

## Round 3 — loading and recovery, release 20261021-loading-1

This is an interim release within the next 20-item review, not a claim that a third group of 20 is complete. Existing functions only; no new provider, privilege, quota or user-data storage.

Verified fixes:

- Retry initial anonymous authentication from a subsequent user operation after a transient failure, reusing the Firebase app/auth instance and one observer.
- Share concurrent authentication attempts; a failed attempt can be retried without a permanent rejected promise.
- Refresh the dictionary after authentication recovers and share concurrent catalog requests.
- Skip a full dictionary rerender when the fetched catalog is unchanged.
- Preserve category/card focus when a changed catalog arrives during use.
- Restore focus to the corresponding replacement dictionary card after closing its modal; guard against delayed close events and reopened dialogs.
- Display jaText-only catalog rows rather than an empty card/title.
- Reject malformed OCR responses before inserting a draft or writing the in-memory image cache, so retry performs recognition again.
- Normalize invalid OCR block entries before overlay processing.
- Explain image decode failures in Japanese with JPEG/PNG recovery guidance.
- Permit selecting the same image file again.
- Skip an unnecessary translation API request when source and target languages match.
- Mark photo-result text with its language for accessibility.
- Suppress confirmation sound after its dialog closes, disable duplicate tone starts during resume/playback, release the audio context, and recover if audio construction fails.

Evidence: `tools/check-loading.mjs` reproduced the original loading defects in 27 baseline cases and then passed 30 recovery cases across 390×844, 568×320 and 1024×600. Unit tests cover single-flight retry, OCR validation and delayed confirmation audio with a fake AudioContext. The loading browser suite uses synthetic auth, catalog and photo responses, and generated test pixels: no paid OCR/translation calls and no personal photographs. Same-file selection and language attributes were reviewed in source; they are not physical-device claims. Existing interaction and full viewport regressions are also run before publication. Physical iOS/Android microphone, speech output and peer-audio delivery remain outside this headless browser proof.

Release regression outcome: 63 interaction scenarios and 198 geometry checks passed with zero browser exceptions. The 568×320 English-guide call screen was visually inspected; invitation controls, full QR and microphone action remain above navigation. Unit suite passed after confirmation-tone cleanup. Publication verification will compare the delivered changed modules with these sources.
