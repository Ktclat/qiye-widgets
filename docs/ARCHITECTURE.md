# 小组件宿主 API 与双仓库边界

主程序仓库 [qiye](https://github.com/Ktclat/qiye) 负责桌面、窗口、主题、浏览器权限、备份与同步、组件源管理和宿主 API。组件仓库 [qiye-widgets](https://github.com/Ktclat/qiye-widgets) 负责组件业务代码、清单、资源、测试和独立发布。主程序构建不会检出或打包组件仓库，也不通过 Git 子模块或远程脚本导入组件。

## 用户流程

新安装只带桌面与基础功能。**设置 → 组件源** 预置 `https://ktclat.github.io/qiye-widgets/index.json`，默认关闭；打开设置不读取目录、不加载预览或组件网页。用户启用源后才请求目录，从 **添加 → 小组件** 添加实例。停用或移除源会卸载 iframe，保留实例和数据；重新启用后可继续使用。

源开关、目录缓存、组件本机缓存和权限授权属于当前设备，不随桌面备份或 WebDAV 自动启用。新设备导入桌面后仍需主动启用源。目录刷新不会替换已安装清单；点击“更新已添加的组件”才更新入口和版本。目录支持最多 500 个组件、512 KiB，最多订阅 20 个自定义来源，另附官方源。

## 隔离与版本

主程序 Manifest V3 的 `script-src 'self'` 保持不变。组件网页只在 `sandbox="allow-scripts allow-forms allow-downloads"` iframe 中执行，无 `allow-same-origin`、顶层导航、弹窗或原生扩展 API。主程序不 `eval`、不动态导入远程 JavaScript。使用 `MessageChannel` 为每个实例建立专用端口；不接受全局广播调用。首次加载才转交端口，组件自行导航后撤销会话。opaque origin 的初始化使用 `targetOrigin='*'`，接收对象限定为该 iframe 的 `contentWindow`。

`qiye-widget` v1 的社区计数器协议继续支持。v2 清单必须带 `apiVersion: 2`，声明 `capabilities`（目前仅 `bookmarks`、`wallpaper`、`geolocation`）。未知版本和能力被拒绝。网页入口固定为版本路径，不能通过目录刷新悄悄升级既有实例。

## v2 通信

宿主发送 `{type:'qiye:init',version:2,item:{id,title,size},value,revision,storage,environment}` 和一个 MessagePort。`value` 是序列化 JSON `{config,data}`；`revision` 是该实例原始值。旧原生记录使用 `legacy:{widget,config,data}` 传入，由组件仓库负责格式升级。环境只含语言、主题、尺寸、显示模式和列出的外观设置，不含其他实例、桌面链接、WebDAV 凭据或用户头像。

组件初始化完成回复 `{type:'ready',version:2}`。调用使用 `{type:'call',id,method,params}`，响应为 `{type:'result',id,value}` 或 `{type:'result',id,error}`。

| method | 参数与行为 |
| --- | --- |
| `save` | `{value:{config,data},expected,title?,size?}`；只修改本实例，检查旧 revision 后原子保存。旧记录首次保存时转为固定版本的社区实例。 |
| `storage` | `{value:{key:string}}`；实例专属本机缓存，不进入备份。 |
| `open` / `settings` | 打开本实例窗口 / 宿主标题与尺寸设置。 |
| `close` / `expand` | 关闭 / 最大化当前组件窗口。关闭前发 `flush`，等待 `flushed` 确认。 |
| `toast` | `{message}`；受长度限制的提示。 |
| `openUrl` | `{url}`；只允许公开 HTTPS URL。 |
| `wallpaper` | 需声明对应能力；打开宿主壁纸中心，或提交受验证图片 / 照片。 |
| `geolocation` | 需声明能力并在宿主标题栏主动授权；只提供一次粗略定位，不提供后台位置监听。 |
| `bookmarks` | 需声明能力，且用户在宿主按钮主动授予当前来源和组件访问权。仅允许列出的书签操作；无通用 Chrome API 转发。 |

宿主以 `state` 消息发送实例更新和环境变化。组件不能覆盖正在编辑的草稿；冲突必须显示给用户。宿主对未知组件也保留有界纯 JSON，以便离线、源停用和未来版本导入；业务字段校验由组件执行。单个 config/data 上限 4 MiB，备份总上限仍为 6 MiB，禁止特殊对象、原型键、过深结构和非 JSON 值。

## 运行边界

首次启用和加载网页需要网络；浏览器缓存不是保证离线可用的安装包。组件内的天气、地图和汇率等请求遵循网页 CORS，不能继承主程序的跨域特权。原生浏览器书签通过单独授权的宿主桥接提供；网页版仍仅支持独立收藏。窗口、卡片、深浅主题和原有组件布局保留在独立运行包中。

## 研究依据与决策（2026-10-18）

- [Chrome：Manifest V3 Additional Requirements](https://developer.chrome.com/docs/webstore/program-policies/mv3-requirements)：区分扩展上下文与不接触扩展 API 的隔离上下文，因此选择 iframe 插件边界，不把组件代码导入宿主。该架构不是商店审核通过的保证。
- [Chrome：Sandbox](https://developer.chrome.com/docs/extensions/reference/manifest/sandbox)：独立 origin 与消息通信，宿主保持严格 CSP。
- [MDN：postMessage](https://developer.mozilla.org/en-US/docs/Web/API/Window/postMessage)：限定目标窗口、验证消息、使用实例专用端口。
- [Microsoft Webview Sample](https://github.com/microsoft/vscode-extension-samples/tree/main/webview-sample)：参考隔离视图、消息交互、状态和销毁生命周期；视觉继续沿用项目现有 iTab 参考布局。
- [GitHub Pages custom workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)：两仓库各自构建和部署，组件使用固定版本路径保留回退能力。

验证入口：`npm test`、`python tests/plugin-e2e.py --widgets ../qiye-widgets/dist`，以及组件仓库的 `tests/runtime-e2e.py`。


## 独立构建与回退

本仓库是原生组件实现的唯一维护位置；共享的纯工具函数是独立副本，不导入主程序源码。测试夹具 `tests/fixtures/legacy-host.js` 来自拆分前主程序 `018b3b1`，仅用于验证旧数据，绝不进入发布包。旧同 DOM 浏览器回归位于 `tests/legacy-host/`，当前 iframe 运行测试为 `tests/runtime-e2e.py`。

运行 `npm test`、`npm run check`、`python scripts/build.py` 和 `python tests/runtime-e2e.py`。构建结果位于 `dist/`；`releases/X.Y.Z/widget.html` 是轻量入口，同目录 `runtime.js`、`styles.css` 包含组件实现、字体及许可，必须一起部署，目录 `index.json` 提供固定版本入口。

发布时更新 package 和所有 manifests 的 release / entry，提交后推送匹配的 `vX.Y.Z` 标签。CI 验证后发布 ZIP 和 SHA256、部署 Pages，保留所有旧版本目录。没有版本标签的提交仅验证；不发布主程序。不能覆盖已经发布的相同版本。

回退可在主程序设置添加固定版本目录，例如 `https://ktclat.github.io/qiye-widgets/releases/1.0.0/index.json`，停用原源后从固定源添加实例；或还原升级前的桌面 JSON 备份（它包含旧清单）。先备份再升级，跨版本业务数据不保证向后兼容。

同一 iframe 的 localStorage / sessionStorage 由宿主按实例提供内存适配与本机持久化，不共享其他组件缓存。书签权限由宿主显式授予；网页来源无法直接访问扩展 API。主程序与组件协议版本需要保持兼容，增加组件无需主程序同步改版。

表单行为依据 [MDN iframe sandbox](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/iframe)：启用 `allow-forms` 让组件的表单校验与 submit 事件工作；仍不启用同源、顶层导航和弹窗权限。组件表单自行导航会撤销宿主端口。

## 1.0.1 加载与缓存

2026-10-18：按用户反馈优化打开组件窗口时的等待。入口 HTML 不再为每种 widget 查询参数重复携带约 1.85 MB 的 JS/CSS；同版本的 19 个组件使用相同 `runtime.js` / `styles.css` URL。宿主在握手完成前保留深浅主题加载界面，组件按原 API 初始化，不申请同源权限。首访仍需联网，资源缓存可被浏览器淘汰，不承诺离线安装或固定加速倍数。

依据：[V8 官方代码缓存建议](https://v8.dev/blog/code-caching-for-devs)建议将非轻量脚本移出 HTML，并保持可缓存的稳定 URL；[MDN script](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/script)说明 defer 的执行顺序。我们选择固定版本共享资源，未引入 Service Worker 或宿主远程脚本执行。构建包包含全部依赖，已发布资源拒绝原地覆盖。

验证：`tests/cache-e2e.py` 不拦截网络请求，使用真实 HTTP 缓存，在同一页面依次挂载四个不透明、credentialless 的便签/日历卡片和窗口；断言 `runtime.js` 和 `styles.css` 各只传输一次。`tests/build_test.py` 检查 ZIP 包依赖完整，并确认入口、脚本、样式任一已发布文件发生变化都会拒绝覆盖。19 个组件的五种卡片尺寸、深浅主题和窄窗口继续由 `tests/runtime-e2e.py` 验证。
