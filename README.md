# Pocket Classic

**把熟悉的转轮和网易云音乐，放进一个口袋播放器。**

Pocket Classic 是一个以 iPod Classic 为灵感的音乐播放器项目。它用可操作的转轮、正面三维机身、细微的金属反光和低灵敏度体感，重现拿着播放器听歌的体验；音乐通过本地服务连接已授权的网易云账号。

<p align="center">
  <img src="docs/images/pocket-classic.svg" width="900" alt="Pocket Classic 界面示意：经典转轮、每日推荐、私人漫游与渐隐倒影">
</p>

> 当前处于开发预览阶段。**浏览器版是最新的外观与交互演示；Android 0.1.0 是原生播放原型，尚未同步三维外观、体感和日推/漫游菜单。** 两者目前都依赖电脑上的音乐服务。

## 可以做什么

- **经典操作**：沿转轮画圈浏览，中央键选择，MENU 返回；支持播放/暂停、左右切歌、长按快进快退、HOLD 锁定和休眠。
- **网易云音乐**：扫码连接账号，浏览个人歌单、选择歌曲；浏览器版还支持每日推荐和私人漫游。
- **连续漫游**：通过私人 FM 获取推荐，队列接近结尾时自动补歌，过滤最近重复推荐，支持切歌和失败重试。
- **正面三维机身**：按 Classic 的比例建模，保留轻微倾斜、柔和高光、接触阴影与向下渐隐的镜面倒影。
- **克制的体感**：手动开启后以当前拿握姿势校准，忽略 3° 内的小抖动，额外倾斜最多 2.2°；操作转轮时保持视角稳定。
- **手机自适应**：手机上隐藏介绍、页眉和页脚，机身尽可能放大；横屏时工具移到右侧，适配安全区域和浏览器可视高度变化。
- **原生安卓播放**：Android 原型使用 Media3 播放，提供后台服务和通知栏控制；配对令牌通过 Android Keystore 加密保存。

## 两个版本的进度

| 功能 | 浏览器开发版 | Android 0.1.0 原型 |
| --- | --- | --- |
| iPod 风格菜单、转轮和按键 | 已实现 | 已实现 |
| 个人歌单、选歌和播放 | 已验证 | 已实现，待真机联调 |
| 每日推荐、私人漫游自动续歌 | 已验证 | 待接入 |
| 正面三维机身、阴影、镜面倒影 | 已实现 | 待集成 |
| 低灵敏度手机体感 | 已实现，待真机验证 | 待接入 |
| 手机沉浸布局、横竖屏适配 | 已验证多种浏览器尺寸 | 使用原生原型界面 |
| 原生后台播放、通知栏、音频焦点 | 使用浏览器播放能力 | 已实现，待真机验证 |

## 先体验浏览器版

需要 **Node.js 22 或更高版本**，以及能够扫码授权的手机网易云音乐 App。

Windows：

```powershell
git clone https://github.com/Lsyn-18/Pocket-Classic.git
cd Pocket-Classic
.\Start-Music-Service.cmd
```

首次启动会安装锁定版本的音乐接口依赖。服务运行后：

1. 打开 [播放器预览](http://127.0.0.1:17863/)。
2. 点击「连接音乐」，生成二维码，用手机网易云音乐 App 扫码并确认。
3. 进入「音乐」，选择「我的歌单」「每日推荐」或「私人漫游」。

手机尺寸下，音乐连接、体感和「更多」入口位于底部；颜色切换、重新校准和浏览器全屏入口位于「更多」中。

其他系统也可以在项目根目录运行：

```sh
cd music-service
npm ci --ignore-scripts
npm start
```

**播放时请保持电脑服务运行。** 登录会话仅保存在服务内存中；服务重启后需重新扫码，手机配对服务重启后需重新配对。手机浏览器读取姿态通常需要 HTTPS，局域网 HTTP 地址不能保证启用体感。

## 构建和连接 Android 原型

在 Android Studio 中打开 `android-player/`，配置完整 **JDK 17、Android SDK Platform 35 和 Build Tools 35.0.0**。也可配置好 `JAVA_HOME` 和 Android SDK 后，在 Windows 项目根目录运行：

```powershell
.\Build-Android.ps1
```

脚本构建 Debug APK，并运行安卓单元测试与 Lint。安装包生成到 `outputs/Pocket-Classic-0.1.0-debug.apk`，构建产物不会提交到 Git。

连接步骤：

1. 先在电脑预览页完成网易云扫码登录。
2. 电脑与安卓手机连接同一 Wi-Fi，在电脑打开 [手机配对页](http://127.0.0.1:17864/)。
3. 安装 APK，在 App 的「设置 → 连接网易云音乐」中填入配对页显示的服务地址和 6 位码。
4. 回到「音乐」选择歌单和歌曲。

已连接 ADB 的手机也可以使用 `adb reverse tcp:17864 tcp:17864`，然后在 App 中填写 `http://127.0.0.1:17864`。安卓模拟器可使用 `http://10.0.2.2:17864`。

仓库保存源码及项目演示图，暂未发布 GitHub Release 安装包。

## 开发与验证

技术栈：Three.js 0.182.0、esbuild 0.25.12、Node.js、本地网易云接口服务，以及 Kotlin、Jetpack Compose 和 Media3。

```sh
# 在项目根目录运行：服务访问控制、推荐、队列、体感和播放器流程检查
node --test music-service/discovery.test.cjs music-service/gateway.test.cjs web-model/motion.test.mjs web-model/roam-stream.test.mjs web-model/player.test.mjs

# 修改三维外观或浏览器逻辑后重新打包
cd web-model
npm ci --ignore-scripts
npm run build -- --publish
```

`--publish` 更新本地服务的预览页面，并在 `outputs/` 生成单文件外观预览。不带该参数仅生成 `web-model/dist/preview.html`，可在项目根目录运行 `node web-model/preview-server.cjs`，访问 `http://127.0.0.1:17866/` 检查。单文件离线预览主要用于查看外观，实际网易云功能需要本地服务。

当前已完成 38 项服务端与浏览器逻辑检查；此前 Android 原型的 7 项单元测试及构建、Lint 检查通过。浏览器实测验证了日推播放、漫游跨批次续歌、暂停和多种屏幕尺寸。账号相关响应、播放链接和私人验证数据未上传到仓库。**尚无安卓真机验证结果。**

更完整的说明见 [开发指南](docs/DEVELOPMENT.md)、[版本记录](CHANGELOG.md) 和 [第三方说明](THIRD_PARTY_NOTICES.md)。

## 目录

```text
android-player/          安卓原生播放原型
music-service/           网易云会话服务、手机配对网关、预览页面
web-model/               三维模型、浏览器播放器与测试
docs/                    开发说明与不含账号信息的演示图
Start-Music-Service.cmd  Windows 音乐服务启动入口
Build-Android.ps1        Windows 安卓构建与检查入口
```

## 接下来

- 将浏览器三维界面、推荐菜单和体感体验集成到 Android App。
- 验证真机上的转轮手感、姿态方向、后台播放和耳机事件。
- 接入真实专辑封面和歌词。
- 改善手机端登录流程，并研究减少电脑服务依赖的方案。

## 当前边界

这是非官方开发项目，与 Apple、网易云音乐无关联。音乐按账号和版权权限提供，可能返回试听或暂不可用；未接入替代音源或自动解灰。私人漫游当前提供私人 FM 推荐与连续播放，尚未接入场景选择、红心及不感兴趣反馈。

本地 HTTP 服务用于可信局域网；请勿将当前服务直接暴露到公网。仓库忽略登录会话、配对运行数据、工具链、依赖、构建缓存和安装包。项目尚未指定开源许可证，第三方组件保留各自许可与权利归属。
