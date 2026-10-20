# 原生组件开发 · API v3

[Wiki 首页](Home.md) · **简体中文** · [English](Native-Widgets-en.md)

原生组件是随栖页源码打包的可信模块。本文的规范以 [widget-registry.js](../../src/widget-registry.js)、[widgets.js](../../src/widgets.js) 和 [widget-runtime.js](../../src/widget-runtime.js) 为准。自托管网页请使用独立的[社区接口](Community-Widgets.md)。

## 快速接入

1. 在 [widget-extensions.js](../../src/widget-extensions.js) 登记仓库自带的[计数器示例](../../src/widget-example.js)：

```js
import { counterWidget } from './widget-example.js';
export const widgetExtensions = [counterWidget];
```

2. 在仓库根目录执行 `python scripts/build-preview.py`，重新加载扩展或打开生成的 `Qiye-preview.html`。
3. 在“添加 → 小组件”添加两张计数器，分别点击加一、修改名称并刷新，确认实例独立保存。示例默认不启用。
4. 开发自己的组件时，复制示例为 `src/widget-yourname.js`，更换唯一 `type`，再登记导出的定义。

预览构建器支持项目采用的具名导入与导出，按依赖顺序打包；不支持的导入或循环依赖会报错。文件名采用小写字母、数字和连字符。模块顶层保持无 DOM、网络与存储副作用：注册表还会被 service worker 和工具栏弹窗加载。

## 定义契约

下面是有效的只读卡片定义；交互与保存见后文的 `mount` 示例。它声明三种布局尺寸，未声明的尺寸不会出现在选择器中。

```js
export const sampleWidget = {
  apiVersion: 3,
  type: 'sample',
  title: '示例组件',
  description: '展示当前实例的文本和计数',
  icon: 'note',
  size: '2x2',
  sizes: ['1x1', '2x2', '4x2'],
  fields: [
    { key: 'text', label: '内容', type: 'text', default: '', maxLength: 500 },
    { key: 'count', label: '数量', type: 'number', default: 0, min: 0, max: 9999, integer: true },
    { key: 'enabled', label: '启用', type: 'checkbox', default: false },
    { key: 'mode', label: '模式', type: 'select', default: 'simple',
      options: [{ value: 'simple', label: '简洁' }, { value: 'full', label: '完整' }] },
  ],
  render({ config, escapeHtml, size }) {
    if (size === '1x1') return `<strong>${config.count}</strong>`;
    return `<p>${escapeHtml(config.text)}</p><strong>${config.count}</strong>`;
  },
};
```

| 字段 | 约束 |
| --- | --- |
| `apiVersion` | 必须为整数 `3` |
| `type` | 匹配 `^[a-z][a-z0-9-]{0,39}$`；不可重复、覆盖内置类型或使用 `constructor` / `prototype` |
| `title` / `description` | 非空字符串，各最多 160 字符 |
| `icon` | 使用 [icons.js](../../src/icons.js) 提供的图标名称 |
| `size` | 默认 `2x2`，必须属于 `sizes` |
| `sizes` | 默认 `['1x1', '2x2']`；至少支持这两种，无重复，且只能使用宿主尺寸集合 |
| `fields` | 默认空数组；字段 key 唯一；每个字段必须提供合法 `default` |
| `render(context)` | 必需，同步返回 HTML 字符串 |
| `mount(context)` | 可选，同步返回清理函数或 `undefined` |
| `update(context)` | 可选，同步更新现有 DOM，不返回 Promise |

### 配置字段

`key` 匹配 `^[a-zA-Z][a-zA-Z0-9_]{0,39}$`，不允许 `constructor`、`prototype` 或 `__proto__`。`label` 为非空字符串，最多 80 字符。

| 类型 | 元数据与值 |
| --- | --- |
| `text` | 字符串；`maxLength` 默认 1000，可设置 1–100000；`required: true` 禁止空白值 |
| `number` | 有限数字；`min` / `max` 默认 -1000000 / 1000000，可声明的边界在 ±1e12 内；`integer: true` 要求整数 |
| `checkbox` | 布尔值，不自动转换字符串或数字 |
| `select` | 1–40 个 `{ value, label }`，value 唯一、最多 80 字符；label 非空、最多 80 字符；值须来自选项 |

默认值仅由 `newWidgetConfig(type)` / registry 的 `newConfig(type)` 在新建时生成。导入配置缺少字段、出现未知字段或值不合法时会被拒绝。当前自定义字段只支持标量，不直接透传任意嵌套 JSON；复杂数据需明确设计校验与限额。

## 渲染与生命周期

`render` 收到 `{ item, config, escapeHtml, t, locale, size }`。`item` 和 `config` 都是副本。宿主创建 `.widget-inner`、实例标识及适用的标题栏；返回的 HTML 是内部内容。用户文本须用 `escapeHtml()` 或后续 `textContent`，URL 另行校验协议与来源。

目录调用同一 `render` 生成 inert 静态预览，不执行 `mount`，也不请求数据。因此 `render` 必须无副作用，不能依赖挂载后才存在的全局状态。

```text
render → 插入 DOM → mount → update（可多次）→ signal.abort + cleanup
目录预览：render → 静态展示
```

切组、替换节点或重新绑定时，宿主中止 `signal` 并调用清理函数。普通排序通常复用节点，不能依赖重新 `mount` 更新状态。异步任务在 `mount` 中启动，完成后仍需检查 `signal.aborted`；自行创建的定时器、订阅和观察器由清理函数释放。

渲染失败显示错误占位；单个实例 `mount` / `update` 报错不影响其他实例。`mount` 失败会中止该实例的 signal；`update` 失败后停止本次挂载的后续刷新并提示。异步事件处理器需自行捕获异常。

### mount / update context

| 接口 | 行为 |
| --- | --- |
| `root` | 当前 `.widget-inner`，查询元素应限于此根节点 |
| `signal` | 本次挂载的 AbortSignal，可传给事件监听与 fetch |
| `size` | 当前呈现尺寸；原生详情以 `2x2` 呈现，不改变桌面尺寸 |
| `locale` / `t(message, values)` | `zh-CN` 或 `en`，共享翻译与占位符替换 |
| `formatDate(value, options)` / `formatNumber(value, options)` | 按当前语言格式化 |
| `getConfig()` | 当前配置的深拷贝，每次操作重新读取 |
| `await updateConfig(patch)` | 合并当前配置、校验并调用宿主保存；成功为 `true`，调用开始时实例已无效为 `false`，校验或保存失败抛错 |
| `openSettings()` / `openDetail()` | 请求打开当前实例的设置或详情 |
| `toast(text)` | 实例有效时显示反馈 |

`updateConfig()` 不等于重新运行 `render`：成功后调用当前实例的 `update`，作者负责同步变化的 DOM。不要直接修改 `getConfig()` 的返回值并期待保存。保存失败会在配置仍为本次修改时回滚，错误可能已由宿主提示（`error.notified`）。

以下方法可加入带有 `[data-increment]` 按钮和 `[data-count]` 输出的定义；完整运行示例仍以 [widget-example.js](../../src/widget-example.js) 为准：

```js
mount({ root, signal, getConfig, updateConfig, toast }) {
  const button = root.querySelector('[data-increment]');
  button.addEventListener('click', async event => {
    event.stopPropagation();
    button.disabled = true;
    try {
      await updateConfig({ count: Math.min(9999, getConfig().count + 1) });
    } catch (error) {
      if (!error.notified) toast(error.message);
    } finally {
      if (!signal.aborted) button.disabled = false;
    }
  }, { signal });
},
update({ root, getConfig }) {
  root.querySelector('[data-count]').textContent = String(getConfig().count);
},
```

按钮禁用期间等待保存结束，避免同一交互重叠写入。不要使用宿主保留的 `data-action="widget-…"` 前缀；交互使用原生按钮、输入框和链接。

## 尺寸、预览与详情

[widget-sizes.js](../../src/widget-sizes.js) 是尺寸定义的唯一来源。默认网格单元为 60 px、间隔为 30 px，标签位于间隔，不增加卡片高度。

| size | 默认宽 × 高（CSS px） | 布局建议 |
| --- | --- | --- |
| `1x1` | 60 × 60 | 单个数值或直接操作 |
| `1x2` | 60 × 150 | 纵向信息层次 |
| `2x1` | 150 × 60 | 数值与说明并列 |
| `2x2` | 150 × 150 | 紧凑完整界面 |
| `4x2` | 330 × 150 | 分栏或附加信息 |

宽高公式为 `跨度 × cell + (跨度 - 1) × gap`。视口小于 1350 px 时按 `viewportWidth / 1350` 缩小，最低比例 0.8；默认单元最小 48 px。用户可修改网格和间隔，可用列数还可能限制横向跨度，不能把表中像素写死为唯一容器大小。

API v3 在每个声明尺寸都使用作者自己的 `render` / `mount` / `update`，包含 `1x1`。根节点提供 `data-display-size`；紧凑尺寸无宿主标题栏。目录每张卡片独立切换预览尺寸，点击添加使用该尺寸。

通过 `openDetail()` 打开的原生详情使用 `2x2` 渲染同一实例，不把详情尺寸写回配置。窗口预设 75 / 100 / 125 / 150% 调整可用空间，内容重新排版，无 CSS zoom。

## 拖动、主题与国际化

宿主处理拖拽、分组、复制、删除/撤销和键盘排序。组件任意位置长按约 400 ms 可拖动；短按保持按钮操作。输入编辑和触屏滚动保持原行为。不要添加独立拖动手柄或拦截宿主捕获阶段指针事件；Esc 取消，卡片聚焦时 Enter 展开，Alt + 方向键排序。

样式放入已加载的样式表（例如 `src/widgets.css`），使用 `[data-widget="your-type"]` 限定范围。使用 `--w-bg`、`--w-fg`、`--w-muted`、`--w-accent`、`--w-accent-ink` 等语义变量；不要给输入框、原生 option 或文字写死白色。适配全局 `settings.useThemeColor`、深浅主题和减少动画偏好。

界面文本同时登记中文与英文，日期和数字使用 context 格式化函数。语言改变会触发重新渲染 / 挂载，不翻译用户内容。详细约定见 [I18N.md](../I18N.md)。

## 持久化与联网

原生扩展持久状态限于完整 `config`，`data` 保持 `{}`。配额、当前 schema、备份与草稿边界见[数据模型](Widgets-Overview.md#数据模型与限额)。JSON 和 WebDAV 的接收端也必须安装相同组件类型，否则校验会拒绝导入。

网络功能应明确启用，新增站点权限只能由用户操作申请。提供超时、取消、缓存、请求去重和错误状态；保持扩展 CSP，不添加 `eval`、内联事件或远程执行。`escapeHtml` 只转义文本，不校验 URL。

合入并随程序发布的代码遵循仓库[贡献与许可约定](../../CONTRIBUTING.md#组件与授权)，保留原作者说明。独立网页接入流程见[社区组件](Community-Widgets.md)。

[下一篇：测试与贡献 →](Widget-Testing.md)
