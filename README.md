# 栖页小组件 · Qiye Widgets

本仓库独立维护栖页小组件的源码、清单、资源、测试和发布。桌面系统、窗口管理、主题、宿主 API 和基础设置位于 [Ktclat/qiye](https://github.com/Ktclat/qiye)。

需要栖页 0.10.0 或支持宿主 API v2 的版本。在栖页 **设置 → 小组件源** 启用预置的官方源，然后从 **添加 → 小组件** 选择组件。新安装的栖页不附带组件，也不会默认连接本仓库。

官方源：<https://ktclat.github.io/qiye-widgets/index.json>

```sh
npm test
npm run check
npm run build
```

源码在 `src/`，每个组件的清单在 `manifests/`，隔离运行适配器在 `runtime/`，测试在 `tests/`。构建产物只包含组件网页和目录，不包含主程序扩展包。

发布使用本仓库独立的 `vX.Y.Z` 标签。目录指向 `/releases/X.Y.Z/widget.html` 的固定版本。更新目录后，已添加的组件需手动更新；旧版本页面保留以便回退。组件发布不触发主程序构建或版本更新。

完整协议、开发和发布说明见 [架构说明](docs/ARCHITECTURE.md)。原生组件实现及研究记录见 [组件文档](docs/WIDGETS.md)。迁移自 qiye 提交 `018b3b1`，保留迁入代码的 GPL-3.0-only 标记及第三方许可，完整原许可见 [LICENSE-GPL-3.0](LICENSE-GPL-3.0)。仓库原有 [AGPL-3.0 许可](LICENSE) 保留，新运行适配代码使用 AGPL-3.0-only；逐文件许可标记优先。
