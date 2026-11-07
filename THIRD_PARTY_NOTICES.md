# 第三方说明

本项目使用以下组件，具体依赖及版本见各自的锁文件和安卓构建配置。

| 组件 | 用途 | 许可信息 |
| --- | --- | --- |
| Three.js | 三维机身、材质与渲染 | MIT；许可全文见 [THREE-LICENSE.txt](web-model/THREE-LICENSE.txt) |
| esbuild | 浏览器页面打包 | MIT，随 npm 包提供 |
| NeteaseCloudMusicApiEnhanced | 网易云接口调用 | MIT，随 npm 包提供 |
| ZXing Core 3.5.3 | 安卓本地生成登录二维码 | Apache-2.0；全文随 APK 的 `assets/ZXING-LICENSE.txt` 分发 |
| AndroidX、Jetpack Compose、Media3 | 安卓界面与原生媒体播放 | 许可随各依赖分发 |
| taurusxin/ncmdump 格式参考 | 标准 NCM 文件头、密钥流与元数据的本机解码 | MIT；全文随 APK 的 `assets/NCM-FORMAT-LICENSE.txt` 分发；[原项目](https://github.com/taurusxin/ncmdump) |

安卓直连请求编码参考 NeteaseCloudMusicApiEnhanced 的 MIT 实现；许可全文见 `android-player/app/src/main/assets/NETEASE-API-LICENSE.txt`，并随 APK 分发。安卓仅移植所需协议，不打包其 Node.js 服务。

预构建浏览器页面包含 Three.js 的许可声明。网易云社区接口项目地址由 `music-service/package-lock.json` 对应包的元数据提供，运行时默认关闭替代音源和自动解灰。

页面中的唱片图、材质纹理和轮廓由代码绘制。文档使用界面示意图，不包含个人账号信息或歌曲音频。iPod、Apple 以及网易云音乐等名称和商标归各自权利人所有，本项目并非其官方产品。

本仓库的项目自有代码与文档采用 [MIT License](LICENSE)，具体使用要求见 [开源使用要求](OPEN_SOURCE.md)。第三方组件的许可证、版权声明及其适用范围保持不变，不由本项目的 MIT 许可重新授权。
