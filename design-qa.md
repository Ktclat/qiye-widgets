# Hotsearch compact card — design QA

Date: 2026-10-24. Release: 1.0.12.

## Reference and scope

The user explicitly identifies image P1 (`codex-clipboard-edd3d3f1-73a1-4127-92d4-48274842f324.png`) as iTab and P2 (`codex-clipboard-4d500157-c8fd-462d-96f1-3a0a4ecab15f.png`) as Qiye. P1 is approximately 188×188; P2 is approximately 414×189. P2 is the before state, not a second iTab reference. This supersedes the previous reference classification.

P1 sets the hierarchy: small platform labels, a subtle selected label, four evenly spaced ranks and single-line headlines. Qiye keeps its user's chosen card size, subscribed platforms and live/cache data. The comparison fixture contains labeled sample stories, not current news.

## Changes and visual evidence

- Headline: 15px / weight 500 → 13px / weight 400 at the reference size. Tabs: 14px / 600 → 13px / 500. The tab strip is 22px with a 20px selected surface.
- Keep 14px reference-size outer padding; rank-to-title gap is 4px. At 188×188, rows measure 33px; at 414×187, 32.75px. Both show four rows and preserve scroll access to later entries.
- Use P1's rank/headline hierarchy on both list sizes. Heat remains available in the full board window. Headline ellipsis retains the full title tooltip.
- Retain neutral dark/light colors, host clipping/radius, tiny-grid adaptations and the three icon-only sizes. No additional controls or generic card frame.

Production iframe captures at deviceScaleFactor 1 are under `../qiye/output/playwright/hotsearch-compact/before/` and `after/`: `dark-2x2.png`, `dark-4x2.png`, light equivalents and `all-sizes.png`. `metrics.json` records computed geometry. Dark square, dark wide and light square captures were inspected at native resolution against P1; the final label spacing was checked again after adjustment.

## Interaction and regression evidence

- `tests/responsive-cards-e2e.py`: 330 checks across five sizes, two themes, three grid sizes and five data states. Existing keyboard activation, scrolling, persistent source selection, cache reload, failed-save rollback, rapid clicks and late-response cases pass.
- 207 unit tests, 19-manifest validation and immutable build test pass.
- Host integration with production 1.0.12 artifacts passes context-menu dismissal and focus, component-specific actions, size changes, note persistence after dragging, window/settings return and the production hotboard API.
- Full-window heat and the public installation/update path are checked during publication. The release workflow also runs the existing all-widget, window/date-time, cache, view-switch and control regressions.

Sources and decisions: [widget documentation](docs/WIDGETS.md). Independent version 1.0.12 preserves historical releases. Existing instances update explicitly through source details; host 0.10.14 remains compatible.

Local visual and interaction result: passed. Public asset equality and browser checks are recorded in the delivery verification artifacts after publication.
