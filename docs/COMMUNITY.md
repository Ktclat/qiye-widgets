# 社区组件与桌面分享

[文档索引](README.md) · [中文技术文档](wiki/Community-Widgets.md) · [English technical guide](wiki/Community-Widgets-en.md)

当前提供两条独立入口：**添加 → 社区组件** 和 **添加 → 分享与导入**。扩展、独立 HTML 与 GitHub Pages 使用同一套实现。只支持本文的当前格式，不进行历史格式兼容或数据迁移。

## 使用社区组件

1. 在“社区组件”填入公开 HTTPS 来源，点击“读取并订阅”。默认地址为 `https://ktclat.github.io/qiye/community/index.json`。
2. 查看作者、版本、源码、运行域名，选择尺寸与目标分组，再添加。桌面显示静态入口；点击或双击后进入专用运行窗口。
3. 点击“运行组件”才加载作者网页。停止或关闭窗口会移除 iframe，关闭消息通道和监听。
4. 来源保存在独立本机记录 `qiye.community.v1`，最多 20 个。不加入桌面备份或 WebDAV。来源刷新失败时保留上次成功目录。
5. 刷新来源只更新目录。点击“更新已添加的组件”才替换同一来源、同一 ID 的已安装清单，保留实例数据；不支持的新尺寸回到 2×2。其他来源不能凭同名 ID 更新已有实例。

打开社区页会向作者的预览图片地址发起请求。读取来源时不发送登录凭据或 Referer，不接受重定向；扩展按用户操作申请该来源域名权限。网页版需要服务器允许 CORS，例如 GitHub Pages 或可直接读取的 raw JSON。第三方网页仍可自主联网，因此其内容、联网行为和可用性由作者负责。没有账号上传服务、排名、自动审核或付费市场。

## 作者开发文档

清单、SDK 与隔离协议集中维护在双语 Wiki，避免多份契约相互过期：

- [社区组件协议 v1（中文）](wiki/Community-Widgets.md) · [Community protocol v1 (English)](wiki/Community-Widgets-en.md)
- [原生组件 API v3（中文）](wiki/Native-Widgets.md) · [Native widget API v3 (English)](wiki/Native-Widgets-en.md)
- [测试与贡献（中文）](wiki/Widget-Testing.md) · [Testing and contributing (English)](wiki/Widget-Testing-en.md)

社区作者可直接托管网页和清单，或向公共目录提交 PR；原生模块经审阅后随程序打包。两者接口独立。

## 桌面排布分享 v1

“分享与导入”可导出选定分组与其中的网站、文件夹、组件尺寸和顺序，格式为 `qiye-layout` / `version: 1`，最大 2 MiB。可选携带白名单中的外观设置，不带自定义壁纸媒体、头像、搜索记录、WebDAV 配置等个人记录。

内置组件恢复默认标题和设置，所有组件内容清空；社区组件保留来源和清单用于安装，但清空实例数据。天气与社区组件不会因导入自动联网运行。网站名称、完整网址及网站图标属于主动分享的内容；发布前应在预览中检查网址是否含私人查询参数或内部地址。

下载的文件可自行放到公开仓库或网站。输入该 JSON 的直达 HTTPS 地址可生成 `https://ktclat.github.io/qiye/#import=编码后的JSON地址`；接收者打开链接时只填写预览表单，不自动请求或导入。扩展中也能粘贴此分享链接。不能公开托管时，直接发送 JSON 文件即可。

导入先校验，再预览、选择分组、选择“新建分组”或“合并到现有分组”。默认跳过桌面已有的相同网址，新建 ID 并重写文件夹关联，单次保存，不覆盖现有内容。导入后在当前页面可撤销；如果此后桌面发生其他修改，拒绝撤销以免覆盖新操作。完整个人备份仍使用设置中的备份功能，与公开排布分享分开。

## 维护与验证

- 清单、来源、实例数据：`src/community-format.js`；联网读取：`src/public-json.js`。
- 目录 UI：`src/community-ui.js`；隔离运行：`src/community-widget.js`。
- 排布协议：`src/layout-sharing.js`；导入导出：`src/sharing-ui.js`。
- `tests/sharing-community.test.mjs` 检查字段、大小限制、隐私边界、重复网址与 ID 重映射。
- `tests/workspaces-e2e.py` 与 `--preview` 检查实际导入、撤销、隔离运行及保存；线上验证另用 `scripts/verify-live.py`。

发布流程构建同源预览与 `community/` 静态资源。第三方自托管服务可能拒绝跨域、嵌入或不可用，这些情况显示错误，不降级为宿主内执行远程代码。
