# 社区组件开发 · 协议 v1

[Wiki 首页](Home.md) · **简体中文** · [English](Community-Widgets-en.md)

社区组件是作者自行托管的 HTTPS 网页。用户订阅清单后添加静态桌面入口，在详情中点击“运行”才加载 iframe。本文覆盖清单、SDK、消息协议和分发；面向用户的订阅与排布分享见 [COMMUNITY.md](../COMMUNITY.md)。

## 最小接入流程

1. 复制 [counter/index.html](../../community/examples/counter/index.html) 和 [sdk.js](../../community/sdk.js) 到自己的静态网站，并修正示例的 SDK 相对导入路径。
2. 确保网页可被 iframe 嵌入，脚本模块可在不透明来源的 sandbox 中加载。
3. 发布下面的 JSON 清单，替换示例中的作者、地址与许可信息。
4. 在“添加 → 社区组件”粘贴清单的 HTTPS 直达地址，点击“读取并订阅”。添加后打开详情、点击“运行”。
5. 操作组件并关闭 / 重开详情，确认持久化；再添加第二个实例，验证数据独立。

## 清单参考

```json
{
  "format": "qiye-widget",
  "version": 1,
  "id": "yourname.counter",
  "name": "我的计数器 / My counter",
  "description": "每张卡片独立保存的计数器 / An independent counter for each card",
  "author": "Your name",
  "release": "1.0.0",
  "entry": "https://yourname.github.io/widgets/counter/index.html",
  "repository": "https://github.com/yourname/widgets",
  "license": "MIT",
  "sizes": ["1x1", "1x2", "2x1", "2x2", "4x2"],
  "previews": [
    {"size": "1x1", "url": "https://yourname.github.io/widgets/counter/1x1.png"},
    {"size": "2x2", "url": "https://yourname.github.io/widgets/counter/2x2.png"}
  ]
}
```

规范来源：[community-format.js](../../src/community-format.js) 和 [public-json.js](../../src/public-json.js)。所有列出的清单字段都必须存在；未知字段被拒绝。

| 字段 | 约束 |
| --- | --- |
| `format` / `version` | 固定 `qiye-widget` / 整数 `1` |
| `id` | 最多 80 字符；匹配 `^[a-z][a-z0-9-]*\.[a-z][a-z0-9-]*$` |
| `name` / `author` / `license` | 非空字符串，各最多 80 字符 |
| `description` | 非空字符串，最多 500 字符 |
| `release` | 最多 30 字符，三段数字，例如 `1.0.0`；不接受 `-beta` 等后缀 |
| `entry` / `repository` | 各最多 2048 字符，公开 HTTPS 域名地址 |
| `sizes` | 2–5 个不重复尺寸；必须包含 `1x1` 与 `2x2`，其余为 `1x2`、`2x1`、`4x2` |
| `previews` | 0–5 个 `{ size, url }`；size 已声明且不重复，url 为最多 2048 字符的公开 HTTPS 地址 |

名称和描述当前是单个字符串，不是语言对象；可直接提供中英文合并文案。宿主不会自动翻译作者清单。`license` 是声明字段，不等同于对许可证的自动审核。未提供预览的尺寸显示占位；不要添加宿主 JS、CSS 或可执行字段。

来源、入口、源码与预览 URL 均不接受账号密码、非 443 端口、字面 IP、localhost 或 `.local` 地址。这是 URL 格式约束，不是对作者站点内容或网络行为的审核。

### 多组件来源索引

单个清单可直接订阅，多组件目录使用以下结构，其中 `manifest` 为上面的完整对象：

```js
const source = {
  format: 'qiye-widget-source',
  version: 1,
  name: '我的组件 / My widgets',
  widgets: [manifest],
};
const json = JSON.stringify(source, null, 2);
```

`name` 非空且最多 80 字符；`widgets` 最多 50 项，ID 唯一。它必须包含完整对象，不接受清单 URL 列表。来源最大 512 KiB；用户本机最多订阅 20 个来源。

## SDK

复制仓库 SDK 到自己的站点，在网页模块中调用 `connectWidget()`。它等待宿主初始化消息，校验 `event.source === parent`、版本和传输端口，然后通过专属 MessageChannel 通信。

| API | 行为 |
| --- | --- |
| `await connectWidget()` | 建立连接，返回 host；这是作者 iframe 中的 API |
| `host.data` | 已解析的本实例 JSON 值；新实例初始为 `null` |
| `host.environment` | 最近的 `{ locale, theme, size, width, height }` |
| `await host.save(value)` | 保存可 JSON 序列化的值；宿主确认成功后更新 `host.data`，失败 reject，10 秒未确认超时 |
| `host.onEnvironment(callback)` | 订阅环境变化，返回取消订阅函数；初始环境需主动读取 |

下面片段假定页面已有 `#add` 按钮、`#count` 输出和 `#status` 文本容器：

```js
import { connectWidget } from './sdk.js';

const host = await connectWidget();
const button = document.querySelector('#add');
const output = document.querySelector('#count');
const status = document.querySelector('#status');
const currentCount = () => Number.isSafeInteger(host.data?.count) ? host.data.count : 0;
const applyEnvironment = ({ theme, locale }) => {
  document.documentElement.dataset.theme = theme;
  document.documentElement.lang = locale;
};
applyEnvironment(host.environment);
host.onEnvironment(applyEnvironment);
output.textContent = String(currentCount());

button.addEventListener('click', async () => {
  button.disabled = true;
  status.textContent = '';
  try {
    await host.save({ count: Math.min(9999, currentCount() + 1) });
    output.textContent = String(currentCount());
  } catch (error) {
    status.textContent = error.message;
  } finally {
    button.disabled = false;
  }
});
```

宿主每实例最多接受 64 KiB UTF-8 JSON，每 100 ms 最多一次写入，且不接受并发写入。作者应串行保存，并在成功确认后更新已保存状态；不要把超过频率的写入当作自动排队。`data.value` 在宿主中是 JSON 字符串，SDK 的 `host.data` 则是解析后的值。

环境的 `size` 是桌面卡片所选尺寸，`width` / `height` 是详情运行区域的实际 CSS 像素。详情不一定等于卡片像素尺寸；按实际空间排版，响应深浅主题与 `zh-CN` / `en`。

## 消息协议

iframe 加载后，宿主向其窗口发送初始化消息并附带 `event.ports[0]`。后续消息只走该端口：

```js
{
  type: 'qiye:init', version: 1, data: '{"count":0}',
  environment: { locale: 'zh-CN', theme: 'dark', size: '2x2', width: 680, height: 520 }
}
```

| 方向 | 消息 | 含义 |
| --- | --- | --- |
| 组件 → 宿主 | `{ type: 'ready', version: 1 }` | 完成握手 |
| 宿主 → 组件 | `{ type: 'environment', environment }` | 运行区域尺寸、主题或语言变化 |
| 组件 → 宿主 | `{ type: 'save', id, value }` | id 为最多 80 字符的字符串，value 为 JSON 字符串 |
| 宿主 → 组件 | `{ type: 'saved', id, ok: true }` | 持久化成功 |
| 宿主 → 组件 | `{ type: 'saved', id, error: '…' }` | 校验、频率或保存失败 |

宿主从启动运行起等待 12 秒；未完成握手会卸载 iframe 并提供重试。停止、关闭或重新运行会销毁 iframe、端口、观察器与监听；新实例会重新握手。实现见 [community-widget.js](../../src/community-widget.js)。

## 托管与隔离边界

iframe 使用 `sandbox="allow-scripts"`，不授予 `allow-same-origin`、父窗口导航、弹窗、表单或下载能力；设置 `no-referrer`、`credentialless`（依浏览器支持）并拒绝摄像头、麦克风、定位和剪贴板权限。宿主只提供本实例数据和显示环境，不提供桌面网站列表、其他组件内容、WebDAV 凭据、宿主 fetch 或执行脚本接口。

作者网页仍可联网，正常网络元数据及组件自身数据可能发送给作者服务器。sandbox 不是网络防火墙；不应存储密码或令牌。不要依赖父页面 DOM、同源 Cookie 或 iframe localStorage。

| 托管要求 | 原因 |
| --- | --- |
| 清单响应允许网页跨域读取 | 网页版受 CORS 限制；扩展按用户操作申请来源权限 |
| 清单使用最终地址，不重定向 | 读取使用 `redirect: 'error'`，不发送登录凭据或 Referer，12 秒超时 |
| 网页允许 iframe 嵌入 | `X-Frame-Options` 或 CSP `frame-ancestors` 可能阻止加载 |
| 模块、字体和接口允许需要的跨域请求 | sandbox 为 opaque origin，服务可能收到 `Origin: null` |
| 建议使用不可变的版本路径 | 相同 URL 的远程内容可被作者更改，宿主不固定其字节内容 |

打开目录就会加载作者的预览图片；“尚未运行组件”不等于没有任何第三方请求。来源订阅列表保存在独立的 `qiye.community.v1` 本机记录，不进入备份或 WebDAV。已安装卡片的清单、来源地址及自身数据进入桌面备份；公开排布分享清空组件数据。

## 发布与更新

作者可独立维护来源供用户订阅，或登记到公共目录：

1. 将完整清单加入 `community/widgets/作者.组件名.json`。
2. 运行 `node scripts/build-community.mjs` 和 `npm test`。
3. 提交 PR，说明作者、源码、许可、运行域名、数据用途、各尺寸预览和验证结果。
4. 合并并部署 Pages 后，用户刷新公共来源即可发现组件。公共目录只登记清单，不托管作者项目。

刷新来源只更新目录；用户点击“更新已添加的组件”才替换同一来源、同一 ID 的已安装清单，保留实例数据。新清单不支持原尺寸时回到 `2x2`。来源读取失败保留上次成功目录，不同来源不能凭相同 ID 替换已有实例。该操作是显式清单替换，不提供版本排序保证或任意宿主代码安装。

[下一篇：测试与贡献 →](Widget-Testing.md)
