# 夜来霜 · Overnight Frost

> 夜阑对戏，笔落成霜。

**夜来霜（Overnight Frost）**是一个古风 AI RP 客户端：创建古风人物、构筑世界、选择自己的身份，与 AI 持续对戏，并把每一段故事可靠地保存下来。

**Overnight Frost** is an open-source, local-first, BYOK client for Chinese-style (gufeng) AI roleplay: bring your own model API key, keep your data on your own device. Ships as a PWA (installable straight from the browser) and as Tauri desktop installers on GitHub Releases. Official content is all-ages.

## 特性规划

- **BYOK**：自带模型 API Key，直连你选择的模型服务商；软件不提供、不中转、不存储任何模型服务。
- **本地优先**：角色卡、世界书、聊天与存档全部保存在你自己的设备上。
- **一份代码，两种形态**：网页版（PWA）+ 桌面安装包（Tauri），不依赖任何第三方打包服务。
- **开放格式**：原生支持 Character Card V2（JSON / PNG）导入导出，兼容社区卡生态。
- **古风工具箱**：称谓助手、诗词助手、年表与伏笔、取名器——对戏时不离开页面。

## 状态

🚧 **早期开发中（脚手架阶段）**。当前仓库包含产品总纲、调研资料与初始内容包（角色卡 / 开局剧本 / 世界书），尚未发布可运行版本。

## 仓库内容

| 路径 | 内容 |
|---|---|
| `research/` | 调研笔记与产品总纲（规划基准） |
| `cards/characters/` | 初始角色卡（Character Card V2 JSON，可直接导入 SillyTavern / RisuAI 试用） |
| `cards/scenarios/` | 初始开局剧本（说书人模式） |
| `cards/worldbooks/` | 初始世界书 |
| `docs/` | 发布相关文档（年龄提示等） |

## 初始内容致谢

初始角色卡、剧本与世界观改编自 **黎棠时《岁除上都雪》**，收录其中部分人物与设定，仅作产品演示用途，著作权归原作者所有。

## 年龄提示

本仓库与官方随附内容（示例卡、模板、文档、截图、release 说明）**保持全年龄**。软件本身是工具，不约束、也无法约束用户的私密使用——生成内容的合规责任由用户与其所连接的模型服务商之间的协议约束。详见 [docs/AGE_NOTICE.md](docs/AGE_NOTICE.md)。

## 社区约定

参与本仓库（issue、discussion、PR、评论）请先阅读 [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)。

## 许可证

[MIT](LICENSE)
