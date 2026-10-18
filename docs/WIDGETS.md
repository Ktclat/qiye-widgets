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


## 组件交互与控件修复（2026-10-19）

以用户提供的六张截图和 [iTab 官方组件示例](https://itab.link/) 为视觉基线。标题栏保持 46px；普通图标按钮为 32px、SVG 为 18px / 1.7px 描边；卡片按钮按紧凑尺寸缩小。搜索采用圆角胶囊、统一主题强调色；鼠标操作不强制显示键盘焦点，Tab 操作保留 `:focus-visible`。独立组件库将这些规则集中在 `src/widget-controls.css`，齿轮使用共享图标路径。

- 随手记的纸色覆盖整个窗口与标题栏；移除背景套纸卡的嵌套边框，正文独立滚动，字数和保存状态固定在底部。
- 待办使用工具栏、任务列表与底部输入区；设置放入齿轮。修复列表最小宽度、输入内边距、横向溢出、删除按钮负外边距和 SVG 尺寸，保留键盘操作与筛选。
- 文件转换卡片使用两张格式图形和转换箭头，适配 1×1、1×2、2×1、2×2、4×2；转换仍在本机进行。
- 世界时钟通过 `config.columns` 保存 1/2/3 列，旧数据默认 2 列。窄窗口自动降列但不修改偏好；城市顺序、主城市、时间比较与 IANA 时区计算保持不变。
- 普通操作提示约 3 秒后消失；可撤销提示保留 8 秒。输入错误、加载状态与持续保存状态保留其原有语义，不用全局计时器抹去业务内容。

### 根因与技术决策

热榜接口实测对 `Origin: null` 不返回 CORS 授权头，正常网页来源可读取；隔离 iframe 恰好使用不透明来源。参考 [MDN Origin](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Origin) 与 [UAPI 热榜官方文档](https://uapis.cn/docs/api-reference/get-misc-hotboard)，宿主新增 `hotboard` 调用，只接受固定平台枚举并请求固定 HTTPS 路径，不接受自定义 URL、凭据或请求头。宿主负责 1 MiB 限制、超时、短时请求合并；组件保留 10 分钟缓存、失败时的旧数据与手动重试。自定义数据源仍使用自己的 CORS。扩展版通过窗口标题栏的“授权热榜访问”只申请该 API 域名，然后自动刷新；网页版无需扩展授权。直接用 file:// 打开预览时，联网服务仍受不透明来源的 CORS 限制，联网验收使用 HTTP 预览和公开网页。

iframe 内的 DOM 事件不冒泡到桌面，导致组件分仓后丢失拖动和右键菜单。现在使用已有实例 MessagePort 转发经过模式与坐标校验的指针/菜单事件；文本输入保留原生编辑菜单，组件标题和非交互背景可拖动，另有宿主拖动柄。依据 [MDN Pointer capture](https://developer.mozilla.org/en-US/docs/Web/API/Element/setPointerCapture) 与 [moveBefore](https://developer.mozilla.org/en-US/docs/Web/API/Element/moveBefore)，支持时原位移动 iframe，避免重新加载编辑器。菜单使用 [WAI Menu Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/menubar/) 的方向键、Escape 和焦点返回；支持 Shift+F10，桌面继续支持 Alt+方向键排序。

组件可声明有界 `contextMenu`，宿主统一提供打开、编辑、移动、复制、尺寸和删除。便签追加导出、待办追加添加/清除完成、热搜追加刷新/订阅、世界时钟追加城市和列数。第三方菜单只能使用文本标签、已知图标和命令标识，不能注入 HTML。来源撤销、预览和窗口模式不会转发桌面指针操作。

### 验证入口

宿主：`npm test`、`tests/plugin-e2e.py`、`tests/plugin-window-e2e.py`、`tests/plugin-reuse-e2e.py`、`tests/extension-e2e.py`。跨仓库联调使用 `python tests/widget-interactions-e2e.py --widgets-root ../qiye-widgets`，可加 `--preview` 或在发布后用 `--live`；覆盖真实拖动、菜单、调整尺寸、刷新保存、3 秒提示与未拦截的知乎热榜请求。

组件库：`npm test`、`npm run check`、`tests/runtime-e2e.py`、`tests/widget-controls-e2e.py`、`tests/window-e2e.py`；包括全部 19 个组件、五种卡片尺寸、深浅色、窄窗、时区日期和配置持久化。截图保存在测试输出目录，不进入发布包。
