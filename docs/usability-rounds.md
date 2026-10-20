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
