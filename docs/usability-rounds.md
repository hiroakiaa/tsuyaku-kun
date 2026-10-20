# Existing app usability review

No new product features. Work in rounds of 20 findings; an implemented CSS change is not a verified fix until the affected screens have been inspected.

## Round 1 — in progress

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

Status: first CSS pass in `web/viewport.css`; existing automated test suite passes. Visual verification pending: current browser control is timing out, including on a fresh tab. Do not describe these 20 items as completed or publish until layout verification succeeds. Next round should inspect startup/loading wording, invitation/participation transitions, conversation exit, empty/error states and repeated CSS rules.

## Interaction findings — next round in preparation

- Room-ID validation previously returned silently for incomplete input. It now explains the expected four digits, marks the field invalid and focuses it. Full-width digits normalize before submission, avoiding native HTML pattern rejection before the handler runs.
- Modal messages previously stayed in the page behind the modal top layer. The existing live region now moves into an open modal and returns to its original location when it closes. No second notification system is introduced.
- Modal opening previously blurred the active element, leaving keyboard users without a clear focus. The close control now takes initial focus without opening a text keyboard automatically.
- Added regression checks for code normalization/validation, late join success/failure after navigating back, and repeated modal open/close live-region restoration. Full existing test suite passes after adapting DOM test doubles and extraction boundaries.
- The 568×320 landscape target needs side-by-side layout too: the short-height breakpoint now begins at 480px width rather than 600px. The actual rendering still requires browser verification.

Browser reconnection attempted on the next goal turn: inventory works, but a fresh app tab still times out at the browser's focus-emulation command. No visual verification or deployment claimed.
