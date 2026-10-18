# 图片压缩与壁纸本地优化

适用范围：桌面「图片压缩」原生 API v3 组件，以及壁纸中心本地上传入口。2026-10-18 审阅 #1 时保留主线 v0.9.2 的无损 PNG、批量、ZIP 和设为壁纸功能，移除旧分支的重复组件定义。

## 产品行为

- 五种卡片尺寸打开同一个专用窗口，46px 单行标题栏。图片列表与前后滑动对比展示结果，支持键盘调整、最大化和还原；首次打开聚焦标题，不给设置控件强制焦点描边。
- 最多 10 张静态 PNG/JPEG/WebP，每张 32 MiB、2400 万像素，原文件总计 100 MiB。签名与尺寸检查先于位图解码；APNG/动画 WebP 明确拒绝，避免静默丢帧。
- 智能、高画质、高压缩率模式保留分辨率并使用浏览器 Canvas 有损编码。JPEG 输出只接受 JPEG 原图，避免丢失透明度。结果大于原图时保留原文件。画质是编码参数，不承诺视觉或像素无损。
- PNG 无损模式保留像素、透明度及色彩块，尝试重压缩 IDAT 的 DEFLATE 数据，并移除文字/时间元数据。它不等于字节完全不变；JPEG/WebP 不支持此模式。
- 可取消当前批次，重新设置会使旧任务失效。单张和 ZIP 下载由用户触发；ZIP 采用 STORE，使用合法且可重复的 1980-01-01 时间戳。
- 文件只在窗口内存中；关闭释放位图、Canvas 和 Object URL。重新打开队列为空，压缩设置也恢复默认。只有显式「设为壁纸」或壁纸上传才写入桌面状态、备份与 WebDAV。
- 本地壁纸静态图先尝试智能压缩，再检查 4 MiB 上限；无收益保留原图。4 MiB 内的动画或浏览器不能重编码的原图保持原上传行为。GIF/AVIF/视频仍受 4 MiB 限额。保存失败保留既有背景。
- 壁纸新上传、选择其他背景、关闭或更换窗口会使旧上传结果失效；Data URL 读取完成后再次检查，避免旧任务覆盖用户的新选择。

## 实现与审阅决定

保留主线压缩引擎，不合回早期仅有 WebP 输出的重复实现。补全取消按钮、最大化事件、英文错误、提前尺寸校验、Canvas 释放以及壁纸异步提交检查。沿用 iTab 风格的紧凑桌面卡片和薄标题栏，压缩窗口采用图片前后对比交互；未复制外部产品素材或源码，也没有引入云端转换、WASM 或新的扩展权限。

## 验证

- `tests/image-compression.test.mjs`：无损扫描行、动画/非法输入、解码前 JPEG/WebP 像素限制、取消和失败后的资源释放、ZIP 内容与合法日期。
- `tests/image-compressor-e2e.py`：生产模块及独立预览，中英文、深浅主题、五种卡片、窄屏、46px 标题栏、键盘、PNG/WebP/ZIP 下载、取消、重开清空、URL 释放、壁纸关闭/新旧上传竞态及刷新持久化。
- `tests/avatar-ui.test.mjs`：共享弹窗生命周期不破坏现有头像异步保存。
- 全量 `npm test` 与远程浏览器矩阵；构建 `Qiye-preview.html` 后由主线发布工作流生成 Pages，最终以线上文件哈希核验部署。

## 公开参考与官方资料

- [Squoosh](https://github.com/GoogleChromeLabs/squoosh)：本机压缩与前后对比的交互参考。
- [Canvas toBlob](https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/toBlob)：输出 MIME 必须校验，不把浏览器回退 PNG 误认为 WebP。
- [createImageBitmap](https://developer.mozilla.org/en-US/docs/Web/API/Window/createImageBitmap) 与 [ImageBitmap.close](https://developer.mozilla.org/en-US/docs/Web/API/ImageBitmap/close)：解码方向与主动释放位图。
- [PNG 第三版规范](https://www.w3.org/TR/png-3/)：PNG 块、APNG 动画和无损处理边界。
- [WebP 容器规范](https://developers.google.com/speed/webp/docs/riff_container)：动画标记与 VP8/VP8L/VP8X 尺寸。
- [URL.revokeObjectURL](https://developer.mozilla.org/en-US/docs/Web/API/URL/revokeObjectURL_static)：临时预览地址的生命周期。

源码：`src/image-compression.js`、`src/image-compressor-widget.js`、`src/image-compressor-workspace.js`、`src/image-compressor.css`。这两个图片工具不依赖当前时区；ZIP 日期固定以便跨平台读取。
