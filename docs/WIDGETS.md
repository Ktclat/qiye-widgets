# 小组件开发文档

> 独立仓库的运行协议、构建、测试、迁移与发布以 [ARCHITECTURE.md](ARCHITECTURE.md) 为准；下面保留各组件业务设计与研究记录。

**简体中文** · [English](WIDGETS.en.md) · [文档索引](README.md)

小组件技术文档已按主题整理到 [Wiki 源文件](wiki/Home.md)，并提供逐篇对应的英文版本。此页保留为原有链接和源码注释的入口。

| 主题 | 中文 | English |
| --- | --- | --- |
| 架构、内置目录、实例数据与限额 | [组件概览](wiki/Widgets-Overview.md) | [Overview](wiki/Widgets-Overview-en.md) |
| 注册、配置、生命周期、尺寸与主题 | [原生 API v3](wiki/Native-Widgets.md) | [Native API v3](wiki/Native-Widgets-en.md) |
| HTTPS 清单、SDK、MessageChannel 与隔离 | [社区协议 v1](wiki/Community-Widgets.md) | [Community protocol v1](wiki/Community-Widgets-en.md) |
| 环境、验收矩阵、排错与提交 | [测试与贡献](wiki/Widget-Testing.md) | [Testing and contributing](wiki/Widget-Testing-en.md) |

原生组件随源码打包；社区组件由作者托管，通过隔离 iframe 运行。两套接口独立，桌面存储统一使用 schema 5。使用方法见[社区与分享](COMMUNITY.md)，历史变化见[更新日志](../CHANGELOG.md)。

## 日常组件功能与数据来源

该主题已迁至[组件概览与架构](wiki/Widgets-Overview.md)，包含内置目录、实例限额、日历与草稿行为、天气来源与缓存。此标题保留供历史报告链接使用。
