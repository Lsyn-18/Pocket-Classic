# 网易云接入类型与当前项目

核实日期：2026-11-06。

## 个人 CLI 应用

个人入驻控制台展示的「云音乐-CLI版」包含 AppId、AppSecret、PubKey 和 PrivateKey，以及每日调用额度。该页面没有移动应用包名、签名、授权回调域名等配置，不能据此推断这些配置缺失或移动端授权已开通。

网易云官方 FAQ 目前明确说明：个人场景仅支持使用 ncm-cli；直接开放平台 API 的厂商接入需要联系网易云商务。针对个人 demo，当前仅提供 ncm-cli。官方 CLI 的配置向导使用 AppId 和 PrivateKey，登录流程为网易云 App 扫描二维码。

来源：

- [官方 FAQ](https://developer.music.163.com/st/developer/document?docId=3b75ab8e475d41ca93d91ebd4dfd383f)
- [官方 CLI 使用说明](https://developer.music.163.com/st/developer/document?docId=f5b49eae2ab14104b279b6f77902ccb8)
- [个人开发者入驻](https://developer.music.163.com/st/developer/document?docId=46be8cfe3f8b476bb1e8b98e765b75ab)

## 正式移动应用的唤端授权

通用官方唤端文档描述了 AppId、clientType、redirectUrl、schemaUrl 和 state 参数，以及 orpheus://openurl 授权入口。文档还要求由网易云配置应用的回跳协议。该文档的存在不代表个人 CLI 应用自动获得该能力。

正式接入前须确认应用获准的类型、调用方式和接口范围。官方 accessToken 与社区接口的 MUSIC_U 会话不互通，登录成功后也不能直接替换到现有社区接口客户端。

厂商接入指南的「开发者入驻」页面说明，需提供企业信息、产品功能与市场定位、终端类型和合作诉求。该商务音乐服务并非免费，官方说明项目会经过约 3～5 个工作日评估。个人控制台中的入驻信息和 CLI 应用页面不提供直接开通移动应用的开关，不能把此流程理解为给现有个人应用追加一个免费的权限选项。

此要求属于厂商商务接入；个人 CLI 入驻仍以独立的个人指南为准，不应将厂商文档中的企业要求泛化到个人 CLI。

来源：[厂商开发者入驻](https://developer.music.163.com/st/developer/document?docId=4313d6b51e6f42e0824a3c56a628a785)。

来源：[H5 登录与唤端登录](https://developer.music.163.com/st/developer/document?docId=0adf20d426564597b9219d4c12bf00f7)。

## 当前安卓客户端

0.3.0 使用手机原生社区接口与二维码授权，不依赖电脑服务或第三方公共接口主机。它尚未接入官方移动应用的一键唤端授权，也没有嵌入用户提供的 AppSecret 或私钥。

已有个人 CLI 凭证可用于官方 CLI；将其用于当前安卓原生客户端，不能以通用移动应用文档推断权限已开通。官方权限和接入方式未确认前，保留已发布的独立扫码测试版，不将打开网易云扫一扫视为官方一键授权完成。

账号直连播放联调和真机唤起兼容性仍待验证，状态见 README 与版本记录。私密凭证、个人账号响应和授权截图均不纳入源码仓库。
