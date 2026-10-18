# Widget testing, troubleshooting and contributions

[Wiki home](Home-en.md) · [简体中文](Widget-Testing.md) · **English**

This page describes reproducible checks, not a claim that every check passed for a particular commit. Record actual results and unverified boundaries in the PR or [QA.md (Chinese)](../QA.md). Historical reports do not replace current validation.

## Research before designing a widget

Before adding or changing a widget, consult public iTab examples and official technical documentation for its function. Record sources, interaction decisions and boundaries. User screenshots take precedence as the visual reference. Avoid giving every tool the same large card and settings column. Compact cards should prioritize information by size; detail windows should follow the actual workflow.

References for the daily-life widgets:

- [iTab changelog](https://itab.link/changelog): compact desktop cards and independent widget windows. The user’s screenshots guide countdown categories and the working-hours preview.
- [Apple World Clock](https://support.apple.com/en-euro/guide/clock-mac/apdw7dec11e7/1.1/mac/27): city management and world clocks. This project adds local time differences and a comparison slider.
- [Loop Habit Tracker](https://loophabits.org/): daily check-ins, history and streaks, informing the week view and calendar backfill.
- [Apple Stickies](https://support.apple.com/en-gb/guide/stickies/stk34871/mac): lightweight text and note colors. Quick notes retain direct editing and automatic saving.
- [MDN Intl.DateTimeFormat](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/DateTimeFormat) and [formatToParts](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/DateTimeFormat/formatToParts): IANA zones handle daylight saving, fractional-hour offsets and date boundaries.
- [MDN date input](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/input/date) and [focus-visible](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Selectors/:focus-visible): countdowns use civil dates; opening memos does not highlight the sort selector, while keyboard focus stays visible.

[widget-life.test.mjs](../../tests/widget-life.test.mjs) covers recurrence, overnight work, time zones and check-in history. [widget-life-e2e.py](../../tests/widget-life-e2e.py) covers editing, undo, persistence, exports, keyboard use and narrow layouts in both themes. Workdays follow the selected weekdays without statutory holiday adjustments. Clock day/night styling uses local 06:00–18:00, not astronomical sunrise and sunset.

Rebuild the standalone preview and synchronize the web version for each delivered change, then verify that public content matches the release build.

Trending cards follow the supplied iTab reference with text-only platform tabs. Detail windows retain site icons on transparent containers. Ordering follows [MDN setDragImage](https://developer.mozilla.org/en-US/docs/Web/API/DataTransfer/setDragImage) and [dragend](https://developer.mozilla.org/en-US/docs/Web/API/HTMLElement/dragend_event): a whole-row preview, source placeholder and insertion marker, cleaned up on drop or cancellation. Saved reorders animate unless reduced motion is requested. Success feedback uses a [status](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Roles/status_role), clears after 2.4 seconds and does not take focus; save errors remain visible. Trending E2E checks text-only tabs, transparent icon backgrounds, dragging, cancellation, persistence, notice expiry and protection of newer errors from old timers.

## Environment and commands

Run from the repository root. CI uses Node.js 22 and Python 3.13. Logic tests and builds need no npm dependencies; browser tests additionally use Python Playwright.

```sh
# Logic, configuration, storage and community protocol
npm test

# Build the catalog and standalone page from production source
node scripts/build-community.mjs
python scripts/build-preview.py

# Validate relative documentation links and language pairs
python scripts/check-docs.py

# Prepare this environment only when browser tests are needed
python -m pip install playwright==1.56.0
python -m playwright install chromium
```

Replace `python` with `python3` or `py -3` if needed. Register the native example using the [quick start](Native-Widgets-en.md#quick-start). Tests can also use an isolated registry instead of changing the default desktop.

| Change area | Existing checks and focus |
| --- | --- |
| Definitions, fields and configuration | [widget-api.test.mjs](../../tests/widget-api.test.mjs); duplicate types, defaults, missing fields and rejection of old APIs/schemas |
| Lifecycle and saving | The same suite plus [widget-drafts.test.mjs](../../tests/widget-drafts.test.mjs); rollback, late responses and duplicate bindings |
| Sizes, previews and themes | [presentation.test.mjs](../../tests/presentation.test.mjs), [presentation-e2e.py](../../tests/presentation-e2e.py) |
| Calendar, memos and weather | [daily-widgets.test.mjs](../../tests/daily-widgets.test.mjs), [weather.test.mjs](../../tests/weather.test.mjs) and related E2E scripts |
| Trending and subscriptions | [hotsearch.test.mjs](../../tests/hotsearch.test.mjs), [hotsearch-e2e.py](../../tests/hotsearch-e2e.py); parsing, persistence/order, cache, cancellation, failed saves and layout |
| Community manifests and layout sharing | [sharing-community.test.mjs](../../tests/sharing-community.test.mjs), [workspaces-e2e.py](../../tests/workspaces-e2e.py) |

Choose browser regressions that cover the change. Check both source modules and standalone HTML through `--preview` where supported:

```sh
python tests/widgets-e2e.py --output test-results/widgets
python tests/presentation-e2e.py
python tests/presentation-e2e.py --preview
python tests/workspaces-e2e.py
python tests/workspaces-e2e.py --preview
python tests/daily-widgets-e2e.py
python tests/daily-widgets-e2e.py --preview
python tests/weather-e2e.py
python tests/weather-e2e.py --preview
python tests/hotsearch-e2e.py
python tests/hotsearch-e2e.py --preview
```

See [ci.yml](../../.github/workflows/ci.yml) and the [development guide (Chinese)](../DEVELOPMENT.md) for full CI and extension permission checks.

## Acceptance matrix

| Scenario | Expected behavior |
| --- | --- |
| Creation and catalog | Native offline previews have no side effects; only declared sizes appear; adding uses the selected preview size |
| Instance isolation | Modify two instances independently; refresh and duplicate without sharing their state |
| Layout and language | Every declared size, both languages/themes, narrow viewports and window presets remain usable |
| Pointer and keyboard | Click, hold, mouse movement, touch scrolling, Esc, Enter and keyboard sorting coexist |
| Failures and cleanup | Failed saves are visible without lost content; unmounting cancels listeners and late DOM changes, with no duplicate timers |
| Storage round trip | Current JSON/WebDAV preserves instances; unknown types, fields and sizes are rejected |
| Community runtime | Webpage loads only after Run; handshake timeout, blocked embedding and stop/restart have recoverable states |
| Community saving | Null, invalid JSON, the 64 KiB boundary, rapid/concurrent writes and timeouts produce correct results |
| Community updates | Same source/ID updates retain data; other sources cannot replace instances; removed sizes fall back |
| Privacy and sharing | Full backups retain widget data; public layouts clear personal content; credentials and local history stay excluded |

Real WebDAV servers, Chrome/Edge permission prompts and touch devices still require verification in those environments. Screenshots and controlled network tests cannot establish continuous third-party availability.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Native widget missing from catalog | Export and `widgetExtensions` registration, unique type, API 3 and required sizes; rebuild preview and reload |
| Saved value does not refresh | `updateConfig` does not rerender HTML; read current config and update DOM in `update` |
| Preview fetches data or changes state | Move side effects out of render/module top level into mount or user events, with cancellation |
| JSON/WebDAV import fails | Current schema and all required fields; the receiving app must include the same native widget type |
| Community source cannot load | Final HTTPS JSON URL, CORS, redirects, 512 KiB limit and field format |
| Widget reports no response | Embedding headers, module CORS, SDK path and the 12-second handshake |
| Community save fails | 64 KiB UTF-8 limit, serialization, 100 ms rate, concurrent saves and host errors |
| Notes remain unsaved on close | Resolve draft errors by retrying or exporting; refreshing loses unsaved session drafts |

## Contribution and delivery

Native submissions include definitions, styles, defaults, Chinese/English translations and relevant behavioral tests. Community submissions include a complete manifest, author/source, license, runtime domains and data usage, plus real previews for declared sizes. Catalog inclusion does not automatically review future responses from the author's server.

Describe the concrete problem or use case, scope, verification commands and results in the PR. For UI changes, include real screenshots and viewport dimensions. For format changes, update examples, validators and both documentation languages. Keep `Qiye-preview.html` aligned with production modules; feature delivery also requires updating the web app through the [deployment guide (Chinese)](../DEPLOYMENT.md).

Record version changes in [CHANGELOG.md](../../CHANGELOG.md). See [RELEASES.md](../RELEASES.md) for releases, [WIKI.md](../WIKI.md) for documentation publishing and [CONTRIBUTING.md](../../CONTRIBUTING.md) for license/contribution rules (Chinese).

[Back to wiki home](Home-en.md)
