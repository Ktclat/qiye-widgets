# Widget development documentation

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
