# 文件转换小组件（本地版 v1）

入口：添加 → 小组件 → 工具 → 文件转换。支持 `1×1`、`1×2`、`2×1`、`2×2`、`4×2` 五种桌面卡片尺寸，点击打开专用转换窗口；窗口遵循栖页 46px 单行标题栏、最大化 / 还原、主题和键盘操作约定。

## 技术决策与限制

- **本地优先：** 首版支持 PNG、JPG/JPEG、WebP 之间的转换，不访问第三方接口，不需要额外网络权限，不包含外部脚本，也不需要 npm 运行时依赖。先以文件头识别输入格式（不信任文件扩展名），检查 APNG/动画 WebP 并拒绝静默展平，再通过 `createImageBitmap()` 解码和 Canvas `toBlob()` 编码。
- **文件不持久化：** 源文件、转换结果、Object URL 仅保留在当前窗口内存中；关闭窗口会取消未完成的任务并撤销下载 URL。栖页仅保存默认目标格式和默认画质，随 JSON 备份 / WebDAV 同步。通过 `file-converter` 原生 API v3 扩展注册，不增加数据 schema 字段。
- **批量与边界：** 一次最多 20 个文件、单文件 30 MiB、队列源文件合计 120 MiB、单张图片最多 2400 万像素，在解码前读取 PNG/JPEG/WebP 尺寸。转换结果另设合计 120 MiB 上限，超限任务保留可重试状态。逐个转换，显示当前任务状态和批次计数；Canvas 不公开实时编码百分比，界面不伪造进度。支持取消、重试、逐项和批量下载。浏览器可能限制连续多文件下载。
- **编码语义：** JPG 不支持透明通道，转换时以白色底色铺平；PNG 输出保留像素透明度，但重新编码不保证字节级无损，也不保留 EXIF / 原始色彩配置文件等元数据。JPG / WebP 的画质滑块影响有损编码；PNG 忽略该参数。某些浏览器不支持导出 WebP / JPEG，Canvas 可能静默回退为 PNG，必须检查返回 Blob 的 MIME，不能只改扩展名。
- **下载：** 用户点击下载才创建下载动作，不后台下载；浏览器的多文件下载许可由浏览器本身控制。
- **扩展兼容：** 无 WebAssembly、没有远程脚本或服务器 API。`src/file-converter.js` 复用 `src/image-compression.js` 的格式检查，方便未来增加可插拔转换引擎。新版与旧版原生扩展类型清单不同：导入带本组件的桌面时，目标版本也需要安装本组件。

## 源码位置

- `src/file-converter.js`：图片签名检测、大小 / 像素限制、输出命名、编码与取消信号。
- `src/widget-file-converter.js`：注册到 `src/widget-extensions.js` 的 API v3 原生小组件；卡片静态预览不解码、不读取文件。
- `src/file-converter-workspace.js`：46px 单行标题栏、拖拽与选择、状态、队列、下载、配置保存、清理。
- `src/file-converter.css`：卡片、宽屏窗口及窄屏响应式布局。
- `src/file-converter-messages-en.js`：中英界面翻译。
- `tests/file-converter.test.mjs`：签名、大小与画质校验、浏览器 Canvas stub、命名与渲染测试。

## 验收清单

1. 五种卡片尺寸均显示有效入口，浅色 / 深色主题可读，窄屏窗口与键盘可访问；切换语言之后会重新渲染中英文。
2. 输入 PNG、JPG、WebP 三种有效文件，以及伪造后缀名、空文件、过大文件、解码失败文件；拒绝非法文件，不上传。
3. JPEG 透明背景铺白；对未支持的目标 MIME 明确报错；相同文件名生成不冲突的输出名。
4. 选择多个文件、转换、重试、取消、移除、下载全部、关闭后重新打开；检查窗口已撤销所有 Object URL。
5. 更新默认画质 / 格式后刷新、备份并导入，确认只有配置被保存、没有二进制文件进入持久状态。
6. `npm test` 与 `python3 scripts/build-preview.py`；Chrome / Edge 扩展、本地 HTTP 预览及 `Qiye-preview.html`。构建完成后，按 `docs/DEPLOYMENT.md` 单独发布并验证 `gh-pages`，不要将 `main` 更新视为网页已同步。

## 参考资料

- [MDN：Using files from web applications](https://developer.mozilla.org/en-US/docs/Web/API/File_API/Using_files_from_web_applications) — File / drag-and-drop 交互与安全读取。
- [MDN：createImageBitmap()](https://developer.mozilla.org/en-US/docs/Web/API/Window/createImageBitmap) — 文件解码、图像方向和像素尺寸。
- [MDN：HTMLCanvasElement.toBlob()](https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/toBlob) — MIME 导出、画质参数与不支持时回退 PNG。
- [Chrome：Extension content security policy](https://developer.chrome.com/docs/extensions/reference/manifest/content-security-policy) — Manifest V3 本地代码限制。
- [Convertio 参考产品](https://convertio.co/zh/) — 拖入 → 选择目标格式 → 转换 → 下载的交互结构，仅借鉴工作流程，不调用 Convertio API。
- [栖页原生组件 API v3](wiki/Native-Widgets.md) — 组件定义、生命周期、配置保存和尺寸。

## 后续扩展接口建议

以 `conversionEngine.supports({source,target})`、`convert(file,{target,options,signal}) → Blob` 抽象格式引擎，再依次按需接入 PDF.js / pdf-lib、ffmpeg.wasm 或用户自选的云转换服务。复杂格式必须明确提示文件上传与第三方隐私规则，不要将 Convertio API Key 放入浏览器扩展源码。开发下一阶段之前，先评估各库许可证、WASM 文件大小以及单文件预览构建的兼容性。


## 2026-10-18 审阅修正

- 与图片压缩组件共同注册，保留主线现有功能；新增文件转换入口不改变桌面 schema。
- 复用图片解析器，在位图解码前检查尺寸，拒绝 APNG/动画 WebP；错误 MIME 以真实签名为准，避免仅凭后缀或 MIME 拒绝有效静态图片。
- 导入期间锁定清空和移除，避免异步导入重新填回已清空的队列；转换期间禁用对应操作，取消/关闭后不发布旧结果。
- 输出 Blob 总量最多 120 MiB，下载并移除结果后可重试；所有 Object URL、位图和 Canvas 按生命周期释放。
- 设置保存失败恢复已保存的格式/画质；滑块步长为 1，保留用户配置的任意合法整数。只保存格式和画质，不保存文件。
- 首次打开聚焦标题，46px 单行栏支持最大化/还原，并遵循全局窗口大小偏好；添加文件后上传区收起为一行，将空间留给队列。PNG 忽略画质，JPG 透明像素铺白。
- 新增 `tests/file-converter-e2e.py` 并接入 CI：生产模块与独立预览各 54 项检查，中英文、深浅主题、五种卡片、390px 窄屏、75% 窗口尺寸、键盘选择、真实下载、透明度、同名输出、设置失败回退、取消/重试/关闭、文件不持久化、输入/输出限制。两组件合并后 Node 回归 504 项通过，桌面交互预览回归 50 项通过。
- 临时 Chromium MV3 扩展实装验证通过：两个工具的启动、JPEG/WebP 下载、chrome.storage 配置持久化、文件不持久化及显式设为壁纸。
- 完整 CI 暴露的原有书签测试改为等待窗口 resize 布局完成，原有尺寸断言不变；书签批量管理源码与预览各 30 项检查通过。原生地图测试在关闭后轮询已持久保存的数据，避免异步谓词过早结束等待。
- 热搜回归的原始鼠标拖拽在采集坐标前等待键盘排序动画结束，避免坐标指向移动中的旧位置；保留拖拽占位、插入标记与顺序持久化断言。
- 同时参考 [PNG 动画规范](https://www.w3.org/TR/png-3/) 和 [WebP 容器规范](https://developers.google.com/speed/webp/docs/riff_container)，将动画检测与提前尺寸检查作为共用边界。工具不读取日历或时区，不存在日期换日逻辑。
