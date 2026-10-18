# 第三方代码、字体与素材说明

## Inter 可变字体

栖页随附 Inter 的拉丁字符子集，用于界面的拉丁字母、数字和标点。中文与未包含的字符使用设备已有的系统字体，不附带完整的中文字库。

| 项目 | 内容 |
| --- | --- |
| 字体 | Inter，正体可变字体，字重 100–900 |
| 作者 | The Inter Project Authors；项目由 Rasmus Andersson 发起 |
| 本地文件 | [`fonts/inter-latin-variable.woff2`](../fonts/inter-latin-variable.woff2) |
| 文件大小 | 72,920 字节，约 71.21 KiB |
| 许可 | SIL Open Font License 1.1（OFL-1.1） |
| 完整许可 | [`fonts/OFL-Inter.txt`](../fonts/OFL-Inter.txt) |
| 获取日期 | 2026-10-12（香港时间） |
| SHA-256 | `2c295d99e26dcf357d4d01bcf270fd6924b600c9a13dd8c363ef114f4c6976fa` |

官方来源：

- [Inter 项目官网](https://rsms.me/inter/)
- [Inter 上游源码仓库](https://github.com/rsms/inter)
- [Google Fonts 的 Inter 页面](https://fonts.google.com/specimen/Inter)
- [本次使用的 Google Fonts CSS 清单](https://fonts.googleapis.com/css2?family=Inter:opsz,wght@14..32,100..900&display=swap)
- [本次下载的 WOFF2 原文件](https://fonts.gstatic.com/s/inter/v20/UcCo3FwrK3iLTcviYwY.woff2)
- [Google Fonts 对应字体包的 OFL 许可](https://github.com/google/fonts/blob/main/ofl/inter/OFL.txt)

字体文件直接保存自 Google Fonts 官方分发的 `latin` 子集，没有重新绘制字形、转换格式或进一步裁剪。CSS 清单声明其字重范围为 100–900；请求同时包含 14–32 的光学字号范围。`v20` 是分发 URL 中的版本标识，不应解释为 Inter 项目的字体版本号。

随附的许可来自同一 Google Fonts 字体包，保留其 `Copyright 2020 The Inter Project Authors` 版权声明。OFL 1.1 允许字体随软件嵌入、分发及用于商业项目，但不得单独出售字体，分发时须保留版权声明和许可。字体本身继续适用 OFL 1.1，不因项目源代码的许可而重新授权。完整条件以随附许可原文为准。

扩展与演示页从本地文件或构建时嵌入的数据加载该字体，运行时不需要向 Google Fonts 或字体作者的网站发送请求。将字体嵌入单文件演示页时，分发物同样需要保留其版权声明和完整许可。

## 字体范围与回退

Google Fonts 的 `latin` 子集包含基本拉丁字母、数字及常用标点。参考的 CSS 字符范围为：

```text
U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6,
U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F,
U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD
```

系统字体名称只作为 CSS 回退使用，不表示栖页复制或重新分发了这些字体文件。

## 界面对照与站点图标

栖页参考 iTab 公开界面的布局密度与交互方式，以独立代码实现。项目没有复制或分发 iTab 的商标、Logo、专有字体文件、壁纸素材或产品源码，也不代表与 iTab 存在关联或获得其背书。

网站与搜索引擎图标按用户添加的站点地址加载，用于识别对应网站；相关图标及商标归各自权利人所有。自定义头像由用户自行选择，在本机裁切和编码，保存在用户的本地桌面数据中，也会随用户主动使用的 JSON 备份和 WebDAV 同步。

热搜榜的 22 个平台条目使用 `src/hotsearch-sources.js` 中列出的首方 favicon 地址（2026-10-15 核验），包括平台自己的静态资源域名。图标按需加载，源码不打包商标图片；加载失败时显示通用网站图标。GitHub AI 和 IT之家游戏优惠榜分别复用对应网站的图标。

## 网页材质

界面的毛玻璃、亚克力与 Mica 风格使用 CSS 和项目自身样式实现。Mica 风格表示柔和着色的视觉参考，不是 Windows 原生 Mica API，也没有从参考产品提取材质贴图。纯色与 Mica 风格不使用背景模糊，毛玻璃和亚克力的模糊强度由用户设置。


## 页底一言服务

页底短句通过 [一言官方语句接口](https://developer.hitokoto.cn/sentence/) `https://v1.hitokoto.cn/` 按次获取（2026-10-15 核验），保留返回的作者、作品名称与 UUID；悬停操作区的引号图标链接到原始条目，不显示常驻的来源文字。该图标复用栖页的矢量图标，不打包服务方商标。源码不打包远程句库；本机最多缓存最近 12 条已获取句子用于断网显示。远程文本权利仍归原权利人，不因栖页的 GPLv3 许可而重新授权。无法联网且无其他缓存时使用栖页自带短句，刷新图标提示其本地回退状态。网络与存储边界见 [PRIVACY.md](PRIVACY.md#页底一言)。


## GPLv3 与素材的界限

栖页原创程序以 GPL-3.0-only 发布，根目录 LICENSE 保留完整许可。此授权不改变 Inter 的 OFL-1.1，也不包含对目标网站商标/图标、用户头像/照片或远端图库素材的再授权。Commons 的图片逐张保留作者、文件页和许可；Picsum 原图遵循对应来源条件。具体获取方式和参考条款见 [WALLPAPERS.md](WALLPAPERS.md)。

## v0.3.1 新增元数据来源

- Deepin：linuxdeepin/deepin-wallpapers 官方仓库 `caae39a555fbeac36da0cacc0fd00d73b2706c7e` 的 `deepin/` 目录。`.reuse/dep5` 对该目录图片声明 UnionTech Software Technology Co., Ltd. / CC BY 4.0；不使用 `nonfree/` 内容。图像不复制进本仓库，元数据保留作者、原文件页和许可证。
- Wallhaven：官方 API 的 SFW general 月度榜单元数据（2026-10-12），仅保存图片地址、尺寸和来源。原图版权仍归原权利人，**不**因栖页使用 GPLv3 而改为 GPL 或获得统一商用许可。API 文档：https://www.whvn.cc/help/api 。
- 常用网站图标：`src/site-icon-catalog.js` 记录本次实际核验的首方图标地址与声明信息。源码包不复制商标图片；图标用于识别对应网站，权利归各原权利人。谷歌 128px 与 Figma SVG/192/256 来源另见审计工作流记录。

不使用第三方图标代理，不抓取需登录的个人内容。核验事实和日期见 `docs/SOURCE-AUDIT.json`。

## lunar-javascript 历法引擎

- 上游：[6tail/lunar-javascript](https://github.com/6tail/lunar-javascript)，MIT License，Copyright (c) 2018 6tail。
- 版本：1.7.7；固定提交 `4c45a59f79b856125516f31aefa8295035c16afd`，获取日期 2026-10-14。
- 上游 `lunar.js` SHA-256：`9750324bfe1aa63c146f8c72b1143df924466c11c8a5277d7d9225c541a18aaa`。
- 本地文件：`src/lunar-engine.js`。文件头包含完整 MIT 许可，单文件网页也保留此许可。仅将 UMD 外壳替换为命名 ES 模块导出；算法、数据表与上游注释保留。
- 可复现更新：`python scripts/update-lunar-vendor.py`。脚本固定 URL 和哈希；上游不匹配时终止。常规构建、安装与运行不下载代码。
- 封装：`src/calendar-almanac.js` 提供普通对象、语言缓存、英文名称补充，不向外暴露可变上游对象。上游未翻译的节日由 `src/messages-en.js` 补齐。

用于公历转农历、节气、传统节日、生肖、星座及传统黄历资料。中国法定节假日仍使用项目单独核实的 2026 年政府安排，不用民俗节日推断放假。黄历资料属于传统文化内容。

## 天气数据服务（2026-10-15 核验）

- [Open-Meteo](https://open-meteo.com/en/docs)：全球模型预报与地理编码；[CAMS](https://open-meteo.com/en/docs/air-quality-api) 提供空气质量，界面明确标注美国 AQI。
- [和风天气](https://dev.qweather.com/docs/start/)：个人 API Host / Key；接入 `/weather/v1/current`、`daily`、`hourly` 经纬度 API，不使用逐步停用的公共域名或旧 v7 接口。保留 [QWeather attribution](https://developer.qweather.com/attribution.html) 链接。
- [香港天文台开放数据](https://www.hko.gov.hk/en/abouthko/opendata_intro.htm)：`rhrread` 实况、`fnd` 每日预报；温度按附近有效站点选择，湿度由天文台报告。定性降水概率保留原文。
- [台湾中央气象署](https://opendata.cwa.gov.tw/devManual/description)：个人授权码；`O-A0003-001` 气象观测，选择附近有效 WGS84 站点。小时及每日预报另由 Open-Meteo 提供。
- [澳门地球物理气象局 XML](https://xml.smg.gov.mo/)：`c_actual_brief.xml` 实况、`c_7daysforecast.xml` / `e_7daysforecast.xml` 七日预报，使用官方气象代码与测量类型定义。

以上数据按各服务条件提供，接口内容和可用性由服务方维护。栖页不附带第三方账户密钥。官方实况、模型补充、空气质量分别标明来源；切换源失败可回退，界面会显示实际生效来源。iTab 的公开网页天气模块调用其自有 `/api/getWeather` 和 `/api/weather/24`，未据此推断未公开的上游供应商，也不调用其私有服务。

## 趣味编码格式参考

`src/codec-fun.js` 独立实现以下已有文本格式，仅使用浏览器 Web Crypto 与 Compression Streams；没有打包这些参考项目的源码或依赖。字符表、固定参数与标记顺序用于兼容既有格式。核验日期：2026-10-15。

- 经典佛曰：参考 [lersh/TudouCode 的格式定义](https://github.com/lersh/TudouCode/blob/258494a88ff7a92acb435a005e519b6bb8f25a50/TudouSharp/Tudou.cs) 与 [AES 参数填充规则](https://github.com/lersh/TudouCode/blob/258494a88ff7a92acb435a005e519b6bb8f25a50/TudouSharp/AES.cs)。UTF-16LE、固定 AES-256-CBC 参数、PKCS#7 填充、128 字表与 12 个高位标记；不实现佛又曰、新佛曰或如是我闻变体。
- 兽音译者：参考 [sgdrg15rdg/beast_js](https://github.com/sgdrg15rdg/beast_js/blob/041c854ad442e9990eab83397d3052daa3ae2c4d/beast.js) 的带首尾标记格式。默认字表 `嗷呜啊~`，UTF-16 每个四位组叠加位置偏移，再映射为两个字符。扩展自定义字表时保留相同标记顺序；不接受省略首尾标记的 SDK 裸输出。
- 原版熊曰：参考 [SheepChef/Abracadabra 的格式分析](https://github.com/SheepChef/Abracadabra/blob/6da979e788a8aef910eb95d644014648f37977e5/src/javascript/XiongyueDecHelper.js)，UTF-8 → raw DEFLATE → basE91 数值 → 固定字表 → 倒序，带 `呋` 标记。该项目当前使用 AIPL-1.2，栖页未引入其实现代码；原生压缩、字符转换、校验与有界流式解压在栖页独立实现。
- 互操作验证使用 [Borber/whisperer README 中的公开格式对照](https://github.com/Borber/whisperer/blob/b50f7cf5da42f8884d6a32995f08680229ffc933/README.md) 及上述项目的短样例。校验覆盖外部密文解码和兼容输出，不仅验证本地往返。
- 原生 `deflate-raw` API 的兼容性见 [MDN CompressionStream](https://developer.mozilla.org/en-US/docs/Web/API/CompressionStream/CompressionStream) 与 [浏览器兼容数据](https://github.com/mdn/browser-compat-data/blob/main/api/CompressionStream.json)：Chrome / Edge 103 起支持，低于扩展要求的最低 116 版本。

以上格式参数公开，属于趣味文本混淆，无用户密码保护。详细格式边界见[小组件说明](wiki/Widgets-Overview.md#编码工具)。

## 换算器参考资料

单位因子参考 NIST SI / 二进制前缀文档，成人 BMI 分级参考 CDC；汇率来自 Frankfurter 每日参考数据。仅参考公开规范，未复制 Microsoft Calculator 或 iTab 代码、图片、私有接口。完整链接及实现决定见 [换算器](CONVERTER.md)。
