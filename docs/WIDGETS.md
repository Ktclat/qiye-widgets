# 小组件开发文档

## iTab 比例的热搜榜卡片（1.0.9，2026-10-24）

按用户最新要求直接核对 [iTab 公开网页版](https://go.itab.link/)。在 1280×720 视口测得热搜榜卡片 312.875×142.219 CSS px，DOM 尺寸标记 `2x4` 对应宽四格、高两格；顶部约 17.4px，滚动榜单区约 100.6px，默认可见四条。选用这一比例与密度，不固定设备像素。栖页的对应尺寸为 **4×2**，74px 单元格与 30px 间距下为 386×178px。

热搜榜清单将 4×2 置于 `sizes` 第一位，主程序 0.10.13 的商城使用来源首选尺寸。以 1×1 开头的旧清单仍默认 2×2，已添加组件不强制重排；更新后可在右键菜单调整为 4×2。保留其他尺寸用于用户主动选择，极小卡片减少次要信息。

中性深浅背景替代暖色大标题；顶部来源、下方连续新闻列表，不再加入大字平台名称或占位页脚。常规横卡可见约四条，最多二十条可滚动；缓存标记放在标题行。卡片不添加管理、设置或拖动按钮，平台切换在完整窗口进行。空数据和请求失败仍如实提示，旧缓存可读；未启用自动更新时不发榜单请求。

技术依据：[MDN 容器查询](https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Containment/Container_queries) 按实际宽高决定密度；[MDN overflow](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/overflow) 支持有界滚动区。列表提供键盘焦点、End 滚动和链接操作；仅键盘导航显示焦点框。

验证入口：`tests/responsive-cards-e2e.py` 使用隔离测试数据，检查五尺寸、深浅色、38.4/74/120px 网格、离线/失败/缓存状态、二十条列表与 End 滚动；换算器已有单位计算和布局回归继续执行。截图仅是测试内容，不代表实时热榜。

## 换算器、热搜榜多尺寸卡片（1.0.8，2026-10-23；历史记录）

以用户提供的 iTab 截图和 [iTab 公开示例](https://itab.link/) 为紧凑布局基线。依据 [MDN CSS 容器查询](https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Containment/Container_queries)，使用实际卡片宽高与尺寸属性共同决定信息密度：1×1 只留识别信息，1×2 纵向，2×1 横向摘要，2×2 和 4×2 展开内容；极小网格收起无法清晰显示的次要内容，不用滚动条挤进完整界面。

换算器移除装饰性标签与口号，使用两级数值排版；支持单位的分类以已保存单位对计算 1 单位的等值示例，其他分类保留长度示例，不虚构汇率或上次输入。热搜榜使用暖色榜单样式，卡片平台名称为只读，平台切换和订阅管理放在完整窗口与现有右键菜单中。卡片不显示拖动或设置按钮；短点击、键盘打开及长按协议保持不变。

热搜榜区分未启用、无订阅、加载、空数据、失败及有缓存状态；实际榜单按尺寸显示 1/3/4 条，空间不足时进一步减少。失效请求不覆盖缓存；禁用时不会自动申请权限或请求榜单。

测试入口：`tests/responsive-cards-e2e.py` 检查两主题、五尺寸、38.4/74/120px 基础网格、五种数据状态的边界，键盘打开及保存单位对。使用受控数据夹具，不以测试数据作为真实热点。`tests/runtime-e2e.py` 继续检查全部 19 个组件的卡片与窄窗口。


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

iframe 内的 DOM 事件不冒泡到桌面，导致组件分仓后丢失拖动和右键菜单。现在使用已有实例 MessagePort 转发经过模式与坐标校验的指针/菜单事件；文本输入保留原生编辑菜单，卡片长按交互已按下文“无按钮长按拖动”更新。依据 [MDN Pointer capture](https://developer.mozilla.org/en-US/docs/Web/API/Element/setPointerCapture) 与 [moveBefore](https://developer.mozilla.org/en-US/docs/Web/API/Element/moveBefore)，支持时原位移动 iframe，避免重新加载编辑器。菜单使用 [WAI Menu Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/menubar/) 的方向键、Escape 和焦点返回；支持 Shift+F10，桌面继续支持 Alt+方向键排序。

组件可声明有界 `contextMenu`，宿主统一提供打开、编辑、移动、复制、尺寸和删除。便签追加导出、待办追加添加/清除完成、热搜追加刷新/订阅、世界时钟追加城市和列数。第三方菜单只能使用文本标签、已知图标和命令标识，不能注入 HTML。来源撤销、预览和窗口模式不会转发桌面指针操作。

### 验证入口

宿主：`npm test`、`tests/plugin-e2e.py`、`tests/plugin-window-e2e.py`、`tests/plugin-reuse-e2e.py`、`tests/extension-e2e.py`。跨仓库联调使用 `python tests/widget-interactions-e2e.py --widgets-root ../qiye-widgets`，可加 `--preview` 或在发布后用 `--live`；覆盖真实拖动、菜单、调整尺寸、刷新保存、3 秒提示与未拦截的知乎热榜请求。

组件库：`npm test`、`npm run check`、`tests/runtime-e2e.py`、`tests/widget-controls-e2e.py`、`tests/window-e2e.py`；包括全部 19 个组件、五种卡片尺寸、深浅色、窄窗、时区日期和配置持久化。截图保存在测试输出目录，不进入发布包。

## 无按钮长按拖动（2026-10-19）

按用户澄清，桌面卡片不显示菜单、拖动柄或编辑模式的管理按钮。组件设置、尺寸和专属命令放在右键菜单中；窗口内的设置按钮、待办勾选等功能控件继续正常工作。卡片输入区的右键也打开该组件菜单，键盘可用 Shift+F10。

参考 [dnd kit Pointer Sensor 的延迟与移动容差](https://dndkit.com/legacy/api-documentation/sensors/pointer/)、[MDN Pointer capture](https://developer.mozilla.org/en-US/docs/Web/API/Element/setPointerCapture)、[pointercancel](https://developer.mozilla.org/en-US/docs/Web/API/Element/pointercancel_event) 和 [touch-action](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/touch-action)。以 iTab 的简洁卡片为视觉基线，采用整张卡片 320ms 长按，无新增可视控件；长按成立前移动超过 7px 会取消候选，保留文字选择、点击和滚动。

宿主统一计时，确认后通过 `drag-state` 通知隔离 iframe 捕获指针。输入框、复选框、链接和按钮均可启动长按，激活后抑制松手点击；Escape、指针取消、页面失焦均清理状态。触摸事件只在已经激活的拖动中阻止滚动。支持 `moveBefore` 时将运行中的卡片内容移入拖动层，结束时原位归还，避免克隆 iframe 重新联网或出现空白预览；不支持时使用静态标题预览，保留 iframe 原位直到松手提交排序。

验证：`tests/drag.test.mjs` 覆盖长按门槛和文本输入；`tests/widget-long-press-e2e.py --widgets-root ../qiye-widgets` 覆盖全部 19 张卡片、深浅色、实际文本选择、输入区拖动与保存、按钮长按不误触、取消恢复、右键和真实触摸事件。另支持 `--preview`、`--live` 验证独立预览及发布页面。


## 拖动稳定性与长按手感（2026-10-20）

复现了鼠标单向匀速移动时卡片回退数像素的问题：MessagePort 中的 iframe 局部坐标产生于旧位置，宿主收到消息时 iframe 已跟随鼠标移动，叠加当前边界会造成反馈误差。组件现在附带事件发生时的屏幕坐标，宿主固定按下锚点，并在卡片未移动时用首段至少 4px 的位移校准屏幕/视口比例；之后每帧只使用最新指针位置，不再读取移动中 iframe 的边界。兼容页面缩放和高 DPI，旧协议保留。

长按统一设为 400ms，保留长按前 7px 的移动取消容差；约 0.4 秒区分点击和拖动，同时避免明显等待。桌面卡片仍没有菜单或拖动按钮。组件拖动时保持原尺寸，取消起拖的缩放弹跳；稠密网格在下一次换位前要求至少 10px 的实际指针/滚动位移，防止尺寸不同的卡片仅因布局重排就在边界往返交换。首次聚焦 iframe 时父窗口可能收到 blur，但 document.hasFocus() 仍为 true；只有真正离开页面才取消手势。

公开示例：[dnd kit 延迟与容差](https://dndkit.com/legacy/api-documentation/sensors/pointer/)。技术依据：[MDN clientX](https://developer.mozilla.org/en-US/docs/Web/API/MouseEvent/clientX)、[screenX](https://developer.mozilla.org/en-US/docs/Web/API/MouseEvent/screenX)、[getBoundingClientRect](https://developer.mozilla.org/en-US/docs/Web/API/Element/getBoundingClientRect)、[requestAnimationFrame](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame)、[hasFocus](https://developer.mozilla.org/en-US/docs/Web/API/Document/hasFocus)。400ms 与位移容差为本项目结合可编辑卡片作出的交互选择，不是引用资料规定的标准值。

验证入口：宿主 `tests/plugin-pointer.test.mjs`、`tests/drag.test.mjs`，组件 `tests/card-interactions.test.mjs`；跨仓库 `tests/widget-drag-stability-e2e.py --widgets-root ../qiye-widgets` 对真实鼠标指针消息增加 35ms 延迟，逐帧检查单向移动无回退、终点偏差小于 1px、停留不反复换位、iframe 无重载，覆盖五种尺寸、深浅色、80% / 125% 缩放与 390px 窄屏。可用 `--preview` / `--live` 复核构建和线上版本；原有 `tests/widget-long-press-e2e.py` 覆盖 19 个组件、文本选择、保存、取消、右键及触摸。

触摸模拟器或隐私环境可能不提供屏幕坐标（例如持续为 0,0）。该次手势继续使用旧的视口坐标路径，避免卡片停在起点；单元测试覆盖此回退，浏览器测试使用原生触摸消息检查跟随与释放。35ms 延迟压力测试针对具有有效屏幕坐标的鼠标事件。

长按成立后的触摸使用 TouchEvent 的移动/结束流；浏览器为判断平移而取消 PointerEvent 时，不提前丢弃仍在进行的单指触摸。第一次活动 touchmove 阻止默认滚动，touchend / touchcancel、多指或失焦统一收尾；长按前的划动保持原生滚动。依据 [dnd kit Touch Sensor](https://dndkit.com/legacy/api-documentation/sensors/touch/)，浏览器连续触摸轨迹与释放已纳入窄屏回归。
