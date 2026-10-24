# Hotsearch reference cards — design QA

Date: 2026-10-24. Release: 1.0.10.

**Visual targets**

- User attachment `codex-clipboard-c0123022-9a37-4c88-b75f-e0d2d90ee77e.png`: 438×215 source pixels; card region approximately 414×187.
- User attachment `codex-clipboard-e3e7eac5-09a0-45fb-9ce6-1a979542621d.png`: 219×207 source pixels; card region approximately 188×188.
- Public baseline: https://go.itab.link/. The selected user images take precedence over the previous card design.

**Implementation evidence**

Preview: `http://127.0.0.1:8768/hotsearch-reference-preview.html` (local verification fixture, not live news).

In-app browser capture: `../qiye/output/hotsearch-reference-iab.png`; both card sizes inspected and source tabs clicked. The first in-app capture predates the final spacing correction; refreshed in-app inspection confirms the final layout.

Pixel-aligned captures: `../qiye/output/playwright/hotsearch-reference/dark-4x2.png` (414×187), `dark-2x2.png` (188×188), corresponding light-theme captures, and `all-sizes.png`. Captured in a 1280×820 CSS viewport at deviceScaleFactor 1. The source's surrounding wallpaper is excluded from the card-size comparison; no image scaling is used. Production cards retain the host's own grid size and radius.

State: dark theme, 百度 selected, four sample stories and heat values from the supplied images. All news in this fixture is explicitly sample content. Production still uses the user's subscribed sources and real/cache responses.

The reference and matching implementation images were opened together in the same comparison input, for both sizes. Separate focused crops were unnecessary: these small component captures already expose all typography, tabs, rows and edges at native resolution.

**Findings and comparison history**

1. Initial pass: [P2] Generic size rules overrode the square card's intended padding (10px instead of approximately 14px), making the labels too close to the edge. [P2] Tabs/heat and Chinese text were too small relative to the reference. Corrected selector specificity, explicit CJK font fallbacks, compact 14px tabs/heat and 15px reference-size story text; kept container reductions for unusually small grids.
2. Final pass: both reference-sized cards have 14px padding, a 24px tab strip, and four evenly spaced visible rows. Wide cards retain aligned heat; square cards hide heat and truncate long headlines. No actionable P0/P1/P2 mismatch remains.

**Required fidelity surfaces**

- Typography: Inter for Latin text with Microsoft YaHei / PingFang SC / Noto Sans CJK SC fallback. Rank/tab weights and single-line truncation reviewed. Platform font rasterization may differ slightly from the supplied screenshots (P3).
- Spacing: source tabs, row rhythm, padding and card proportions checked at matching dimensions. Host-selected radii are preserved; no inner generic card frame.
- Colors: neutral charcoal background, muted gray active tab, white primary text and gray heat/ranks; light-theme equivalents checked for contrast. No orange top-rank background or extra toolbar.
- Assets: the reference lists contain no raster assets to recreate. Small launchers reuse the existing trending icon, scale by available short side, and contain no clipped text or new handles.
- Copy: tab labels derive from existing subscriptions; only the verification fixture mirrors the screenshot's 百度/微博/抖音 and news. Empty/error/cache messages remain accurate. No instructions or implementation details appear in production card copy.

**Interaction verification**

330 bounds checks cover five sizes, two themes, three grid scales and five data states; actual browser tests cover keyboard activation, arrow navigation, scrolling, save rollback, persistence/reload, cached offline rendering, rapid clicks and late responses. Icon cards contain no list or text and issue no automatic hotboard requests. All 19 widgets pass the existing size/theme/narrow-window runtime suite. Browser captures report no page errors.

**Implementation checklist**

- Reference-sized wide/square cards and compact icon launchers verified.
- Platform controls, ellipsis, heat visibility and dark/light states verified.
- Existing subscriptions, permissions, context menus and long-press protocol preserved.
- Public artifact verification and branch cleanup are recorded with delivery after publication.

final result: passed
