# Vercel UI SDK in Pardner

**Date** 2026-11-20

**Recommendation** Pilot the UI SDK React Menu on Pardner’s board-level Invite menu. Compare against the current implementation before adopting it elsewhere.

## Fit

[vercel-labs/ui](https://github.com/vercel-labs/ui) supplies headless browser behaviors, including keyboard navigation, focus, dismissal, positioning, and ARIA. Pardner would keep its JSX content and styling. This makes the library relevant to accessibility and interaction maintenance. Copy, spacing, and visual hierarchy still come from Pardner. [Core behaviors](https://ui-sdk.dev/docs/core/behaviors) · [React Menu](https://ui-sdk.dev/docs/react/components/menu)

The [Invite menu](../../ui-prototype/src/ClientApp.jsx#L410) and Project Switcher previously shared a custom `useMenu` hook. It queries menu items, moves focus, handles keyboard input, and registers a document-level pointer listener. The SDK documents typeahead, keyboard opening, focus restoration, and dismissal in its Menu component. Start with Invite because it has three commands and already opens the existing invitation dialog. The Project Switcher also represents the selected project, so it needs separate coverage for its radio items and selection semantics.

## Adoption choices

| Choice | Benefit | Cost |
| --- | --- | --- |
| Keep and extend `useMenu` | No new dependency and full control of behavior | Pardner owns keyboard, focus, and dismiss edge cases |
| Replace one menu with the SDK | A concrete comparison of behavior, code removed, and bundle cost | Two beta packages and potential focus or overlay integration work |
| Migrate dialogs and other controls | Broader consistency if several interactions benefit | Larger accessibility and regression surface with little immediate gain for native disclosures and forms |

Published metadata reported `@ui-sdk/react` and `@ui-sdk/core` at `0.1.0-beta.13`. The React adapter declares React and React DOM 19 or later, a compatible core package, and a React types peer. Pardner’s [current React version](../../ui-prototype/package.json) meets the runtime React peers. The pilot pins both packages at that version and imports `@ui-sdk/react/menu`.

## Pilot results

Only the board-level Invite menu uses the SDK. The Project Switcher still uses the existing menu code. The new menu finishes dismissing before it opens the existing native invitation dialog, which returns focus to the trigger on close.

With the same Vite version, the main production JavaScript grew from 165.52 to 208.02 kB gzip. The build also emitted two separate JavaScript chunks totaling 14.87 kB gzip. Monaspace Neon v1.400 is a separate 510.83 kB WOFF2 asset served by the local app. These are build sizes, without a page-load timing claim. [Monaspace v1.400](https://github.com/githubnext/monaspace/releases/tag/v1.400)

Keyboard activation, typeahead, disabled-member behavior, and focus return passed in both Chromium and WebKit. The phone capture exercised touch selection. Monaspace’s wider text initially overflowed the Vein filter at tablet widths. The revised toolbar spacing passed the existing width sweep.

## Pilot acceptance

- Use `@ui-sdk/react/menu` with the existing Invite labels, styles, role restrictions, and dialog. Let the SDK own menu keyboard, open, dismiss, and focus handling.
- Check mouse and touch selection, arrow keys, typeahead, Escape, Tab, and outside dismissal. Check the disabled Human option for members. Verify that choosing a command hands focus to the dialog and that closing the dialog returns it to Invite. Exercise Chromium and WebKit at phone and desktop widths.
- Compare the pinned import’s production bundle cost and retained custom logic with the current implementation. Consider the Project Switcher only if the result improves interaction coverage or removes meaningful maintenance work.

Context7 was checked for the linked repository. It returned adjacent Vercel projects, so the evaluation used the linked repository, official UI SDK docs, and npm registry metadata.
