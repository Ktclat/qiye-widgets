# 小组件测试、排错与贡献

[Wiki 首页](Home.md) · **简体中文** · [English](Widget-Testing-en.md)

本文提供可复现的验证流程；测试清单不表示某次提交已全部通过。实际结果与未验证边界写入 PR 或 [QA.md](../QA.md)，历史报告不替代本次验收。

## 先研究，再设计组件

新增或修改小组件前，先查找 iTab 的公开案例和该功能的官方技术文档，记录参考链接、交互选择与边界。用户提供的截图优先作为视觉基准；不要把每一种工具都做成相同的“大卡片 + 设置栏”。桌面卡片要按尺寸保留最重要的信息，详情页则围绕实际工作流程设计。

本次生活组件参考：

- [iTab 更新记录](https://itab.link/changelog)：紧凑的桌面卡片、独立组件窗口、倒数日分类与工作时间预览；具体布局以用户给出的截图为准。
- [Apple 世界时钟](https://support.apple.com/en-euro/guide/clock-mac/apdw7dec11e7/1.1/mac/27)：城市管理与世界时钟；本项目增加本地时差和时间对比滑块。
- [Loop Habit Tracker](https://loophabits.org/)：逐日打卡、历史与连续记录；周视图和月历补记围绕这些操作设计。
- [Apple 便笺](https://support.apple.com/en-gb/guide/stickies/stk34871/mac)：轻量文本与便签颜色；随手记保留直接编辑和自动保存。
- [MDN Intl.DateTimeFormat](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/DateTimeFormat) 与 [formatToParts](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/DateTimeFormat/formatToParts)：使用 IANA 时区处理夏令时、半小时时差与跨日。
- [MDN 日期输入](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/input/date) 与 [focus-visible](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Selectors/:focus-visible)：倒数日按日历日期计算；默认打开不强调排序框，保留键盘焦点提示。

日期、跨午夜工作时段、重复日期、时区与打卡历史由 [widget-life.test.mjs](../../tests/widget-life.test.mjs) 验证；[widget-life-e2e.py](../../tests/widget-life-e2e.py) 覆盖新增、编辑、撤销、保存恢复、导出、键盘及明暗主题的窄屏布局。工作日按用户选择的星期计算，不自动套用法定调休；时钟昼夜外观按当地 06:00–18:00 区分，不表示当地实际日出日落。

交付修改时同时重新构建独立预览并同步网页版，核对线上内容与发布构建一致。

热搜榜按用户提供的 iTab 卡片截图默认只显示平台名称；详情页仍显示网站图标，容器保持透明。排序参考 [MDN setDragImage](https://developer.mozilla.org/en-US/docs/Web/API/DataTransfer/setDragImage) 与 [dragend](https://developer.mozilla.org/en-US/docs/Web/API/HTMLElement/dragend_event)：以整行生成拖拽预览，显示占位和插入位置，结束或取消时清理；保存后移动到新位置的动画遵守减少动态效果设置。成功提示使用 [status](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Roles/status_role)，2.4 秒后隐藏，不抢焦点；保存失败保持可见。热搜 E2E 覆盖纯文字标签、图标透明底、拖拽与取消、排序持久化、提示消失和新错误不被旧计时器清除。

## 环境与命令

从仓库根目录执行。CI 使用 Node.js 22、Python 3.13；逻辑测试和构建不需要 npm 依赖。浏览器测试额外使用 Python Playwright。

```sh
# 逻辑、配置、存储与社区协议
npm test

# 生成目录和同源独立网页
node scripts/build-community.mjs
python scripts/build-preview.py

# 验证文档相对链接与语言配对
python scripts/check-docs.py

# 仅在需要浏览器测试时准备环境
python -m pip install playwright==1.56.0
python -m playwright install chromium
```

若系统仅提供 `python3` 或 `py -3`，替换命令中的 `python`。原生示例需要先按[接入指南](Native-Widgets.md#快速接入)登记，测试代码也可使用独立 registry，避免为测试改写用户默认桌面。

| 改动范围 | 重点验证与现有入口 |
| --- | --- |
| 定义、字段、实例配置 | [widget-api.test.mjs](../../tests/widget-api.test.mjs)；重复类型、默认值、缺字段、旧 API / schema 拒绝 |
| 生命周期与保存 | 同上及 [widget-drafts.test.mjs](../../tests/widget-drafts.test.mjs)；失败回滚、卸载后回包、重复绑定 |
| 尺寸、预览、主题 | [presentation.test.mjs](../../tests/presentation.test.mjs)、[presentation-e2e.py](../../tests/presentation-e2e.py) |
| 日历、备忘录与天气 | [daily-widgets.test.mjs](../../tests/daily-widgets.test.mjs)、[weather.test.mjs](../../tests/weather.test.mjs)、对应 E2E |
| 热搜榜与订阅 | [hotsearch.test.mjs](../../tests/hotsearch.test.mjs)、[hotsearch-e2e.py](../../tests/hotsearch-e2e.py)；数据解析、订阅保存 / 排序、缓存、取消、失败回滚与布局 |
| 社区清单与排布分享 | [sharing-community.test.mjs](../../tests/sharing-community.test.mjs)、[workspaces-e2e.py](../../tests/workspaces-e2e.py) |

按影响范围选择浏览器回归，运行网页源模块与 `--preview` 独立 HTML 两种模式：

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

完整 CI 与扩展权限相关检查见 [ci.yml](../../.github/workflows/ci.yml) 和[开发指南](../DEVELOPMENT.md)。

## 验收矩阵

| 场景 | 应验证的行为 |
| --- | --- |
| 新建与目录 | 离线原生预览无副作用；仅显示声明尺寸；添加采用当前预览尺寸 |
| 实例隔离 | 两个实例分别修改，刷新、复制后互不串数据 |
| 布局与语言 | 每个声明尺寸、中英文、深浅主题、窄屏和窗口预设均可操作 |
| 指针与键盘 | 短按、长按、鼠标移动、触屏滚动、Esc、Enter 与键盘排序互不冲突 |
| 失败与清理 | 保存失败可见且不丢内容；卸载取消监听和异步 DOM 修改，无重复定时器 |
| 往返存储 | 当前格式 JSON / WebDAV 保留实例；未知类型、字段和尺寸明确拒绝 |
| 社区运行 | 点击运行才加载网页；握手超时、拒绝嵌入、停止 / 重开可恢复 |
| 社区保存 | 空值、非法 JSON、64 KiB 边界、过快 / 并发写入及保存超时显示正确结果 |
| 社区更新 | 同来源和 ID 更新保留数据；其他来源不能替换；移除尺寸后回退 |
| 隐私与排布 | 完整备份保留组件数据；公开分享清空个人内容；不导出凭据或本机历史 |

真实 WebDAV、Chrome / Edge 权限提示和触屏设备仍需对应环境验收。截图和受控网络测试不能证明第三方服务器持续可用。

## 常见问题

| 现象 | 检查方法 |
| --- | --- |
| 原生组件没有出现在目录 | 检查导出与 `widgetExtensions`、唯一 type、API 3、必需尺寸；重建独立预览并重新加载 |
| 保存后数字不刷新 | `updateConfig` 不会重新 render；在 `update` 中读取最新配置并更新 DOM |
| 预览触发联网或污染数据 | 将副作用移出 render 和模块顶层，放入 mount / 用户事件，并处理取消 |
| JSON 或 WebDAV 导入失败 | 对照当前 schema 与必需字段；接收端须包含同一原生组件类型 |
| 读取社区来源失败 | 使用最终 HTTPS JSON 地址；检查 CORS、重定向、512 KiB 限额和字段格式 |
| 组件显示未响应 | 检查 iframe 嵌入头、模块 CORS、SDK 路径和 12 秒握手 |
| 社区保存失败 | 检查 64 KiB UTF-8 上限、序列化结果、100 ms 频率、并发保存与宿主错误 |
| 笔记关闭后仍未保存 | 检查草稿错误，先重试或导出；刷新页面会失去未保存会话草稿 |

## 提交材料与交付

原生组件提交定义、所用样式、默认配置、中英文翻译与必要行为测试。社区组件提交完整清单、作者与源码、许可、运行域名与数据用途、声明尺寸的真实预览。公共目录登记不会自动审核作者服务器今后返回的内容。

PR 应说明具体问题或使用场景、实现边界、验证命令及结果。涉及 UI 时提供真实截图和窗口尺寸，涉及格式时同步示例、校验器和双语文档。保持 `Qiye-preview.html` 与生产模块一致；功能交付还需按[部署指南](../DEPLOYMENT.md)同步网页端。

版本变化统一写入 [CHANGELOG.md](../../CHANGELOG.md)。发布流程见 [RELEASES.md](../RELEASES.md)，文档发布见 [WIKI.md](../WIKI.md)，许可与贡献规则见 [CONTRIBUTING.md](../../CONTRIBUTING.md)。

[返回 Wiki 首页](Home.md)
