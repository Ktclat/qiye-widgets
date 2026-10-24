# Widget development documentation

## Hot-list initial loading (1.0.13, 2026-10-24)

The real host update check exposed a bootstrap ordering issue: mounting an uncached hot-list synchronously sent `hotboard` before the bundle's `ready` message, so the host discarded the call. Following [MDN microtask ordering](https://developer.mozilla.org/en-US/docs/Web/API/HTML_DOM_API/Microtask_guide) and [MessagePort.postMessage](https://developer.mozilla.org/en-US/docs/Web/API/MessagePort/postMessage), bridge calls now send in a microtask after synchronous initialization, placing readiness first on the same port. Host readiness checks, permissions and storage stay intact.

The runtime fixture rejects and records calls before readiness and checks the first hot-list render with deterministic data. It reproduces the failure with the previous build. Version **1.0.13** retains 1.0.12 typography and historical releases; existing host 0.10.14 installations update their widgets through source details.

## Compact hot-list typography (1.0.12, 2026-10-24)

The user identifies P1 as the iTab square reference and P2 as Qiye's current wide card. P1 sets the visual baseline: small platform labels, four evenly spaced ranked headlines and a quiet selected tab. Both 2×2 and 4×2 now use 13px labels/headlines with weights 500/400, a 22px tab strip and 4px rank-to-title spacing. Desktop cards give the headline the full remaining width; heat stays in the full board window. Small grids and the other three icon-launcher sizes retain their existing adaptations.

Sources: [iTab public examples](https://itab.link/), [MDN container queries](https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Containment/Container_queries), [text overflow](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/text-overflow), and [WAI-ARIA manual-activation tabs](https://www.w3.org/WAI/ARIA/apg/patterns/tabs/). Preserve subscriptions, cached timestamps, keyboard focus, selection persistence and stale-response handling. Production iframe checks cover five sizes, both themes, three grid scales and five data states; see `design-qa.md` for visual evidence. Installed instances update explicitly to 1.0.12 through source details, using host 0.10.14.

> 独立仓库的运行协议、构建、测试、迁移与发布以 [ARCHITECTURE.md](ARCHITECTURE.md) 为准；下面保留各组件业务设计与研究记录。

[简体中文](WIDGETS.md) · **English** · [Documentation index](README.en.md)

The [technical wiki](wiki/Home-en.md) provides matching Chinese and English guides for current widget contracts.

| Topic | English | 中文 |
| --- | --- | --- |
| Architecture, built-ins, instance data and limits | [Overview](wiki/Widgets-Overview-en.md) | [组件概览](wiki/Widgets-Overview.md) |
| Registration, config, lifecycle, sizes and themes | [Native API v3](wiki/Native-Widgets-en.md) | [原生 API v3](wiki/Native-Widgets.md) |
| HTTPS manifests, SDK, MessageChannel and isolation | [Community protocol v1](wiki/Community-Widgets-en.md) | [社区协议 v1](wiki/Community-Widgets.md) |
| Environment, acceptance checks and troubleshooting | [Testing and contributing](wiki/Widget-Testing-en.md) | [测试与贡献](wiki/Widget-Testing.md) |

Native widgets are bundled with the application; community widgets are author-hosted webpages running in isolated iframes. Their APIs are independent, while desktop storage uses schema 5. See [community usage (Chinese)](COMMUNITY.md) and [version history](../CHANGELOG.md).
