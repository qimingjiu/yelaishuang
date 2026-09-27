# 夜来霜 · Overnight Frost

> 夜阑对戏，笔落成霜。

**夜来霜（Overnight Frost）**是一个古风 AI RP 客户端：创建古风人物、构筑世界、选择自己的身份，与 AI 持续对戏，并把每一段故事可靠地保存下来。

**Overnight Frost** is an open-source, local-first, BYOK client for Chinese-style (gufeng) AI roleplay: bring your own model API key, keep your data on your own device. Ships as a PWA (installable straight from the browser) and as Tauri desktop installers on GitHub Releases. Official content is all-ages.

## 状态

✅ **P0 核心闭环已就绪（2026-09-28）**：

- **戏楼（对戏）**：楼层式对戏，流式回复、停止、重说、编辑双方楼层、续写、从任意楼层分支、场外（水楼）指导；按卷多戏楼管理
- **记忆簿**：关键事实锁定注入 + 阶段摘要（可看、可改、可让 AI 重写）
- **状态栏**：戏内时间 / 地点 / 在场 / 目标 / 要务，可手动修正
- **人设工坊**：角色编辑器（中文表单 + 永久 token 粗查）、玩家身份、世界书编辑器（条目 / 关键词 / 恒注入 / 顺序）
- **导入导出**：角色卡 V2 JSON / PNG 嵌入导入（V1 自动识别）、V2 JSON 导出、世界书 JSON、戏录 Markdown、整包备份恢复
- **BYOK**：OpenAI 兼容接口，桌面端 Rust 层流式转发，网页端直连（撞 CORS 时用本地代理）
- 随仓库内容包（8 角色 + 2 说书人开局 + 1 世界书）构建时打包，首次启动自动入库

仍在路上（P1/P2，见 `research/02-调研汇总与产品总纲.md`）：多 NPC 调度、事件与关系簿、题材设定库、诗词助手、小说阅读视图、PNG 卡导出、向量检索等。

## 下载

- **网页版（PWA）**：推送 main 后由 CI 自动部署到 GitHub Pages —— <https://qimingjiu.github.io/yelaishuang/>（浏览器打开后可在地址栏「安装」为应用）
- **桌面安装包**：向仓库推送 `v*` 标签（如 `v0.1.0`），CI 会自动构建 Windows（NSIS/MSI）、macOS（Apple Silicon / Intel DMG）、Linux（AppImage/deb）并发布到 [Releases](https://github.com/qimingjiu/yelaishuang/releases)

## 仓库内容

| 路径 | 内容 |
|---|---|
| `src/` | 前端源码（Vite + React + TypeScript，PWA） |
| `src-tauri/` | 桌面壳（Tauri 2 + Rust，含 `http_forward` 转发） |
| `tools/local-proxy.mjs` | 网页版可选本地小代理 |
| `tools/mock-llm.mjs` | 本地 mock 模型接口（SSE 流式），联调冒烟测试用 |
| `scripts/gen-icon.mjs` | 应用图标生成脚本 |
| `cards/` | 初始内容包（角色卡 / 开局剧本 / 世界书） |
| `research/` | 调研笔记与产品总纲（规划基准） |
| `docs/` | 发布相关文档（年龄提示等） |
| `.github/workflows/` | CI：网页部署 + 桌面发布 |

## 开发

环境要求：Node 20+（前端与打包）；Rust 稳定版工具链（仅桌面端构建需要，未安装也可只做网页端开发）。

```bash
npm install
npm run dev           # 网页开发（http://localhost:5173）
npm run build         # 类型检查 + 构建网页版（dist/）
npm run icon          # 重新生成应用图标（源图 scripts/gen-icon.mjs → src-tauri/icons）
npm run tauri dev     # 桌面端开发（需要 Rust 工具链）
npm run tauri build   # 桌面端打包
npm run proxy         # 启动本地小代理（网页版直连模型 API 撞 CORS 时用）
node tools/mock-llm.mjs  # 本地 mock 模型接口（http://127.0.0.1:38999/v1），无 Key 也能联调
```

### CORS 与转发（BYOK 前端最先踩的坑）

浏览器直连各家模型 API 会撞 CORS 墙（部分供应商禁止网页跨域调用）。本项目的解法：

- **桌面端**：所有模型请求经 Tauri 的 Rust 层转发（`src-tauri/src/lib.rs` 的 `http_forward`），天然绕开 CORS；
- **网页版**：直连，撞墙时启用本地小代理——`npm run proxy` 启动后把 API Base URL 指向 `http://127.0.0.1:38887/?target=<URL编码的上游地址>`。

## 初始内容致谢

初始角色卡、剧本与世界观改编自 **黎棠时《岁除上都雪》**，收录其中部分人物与设定，仅作产品演示用途，著作权归原作者所有。

## 年龄提示

本仓库与官方随附内容（示例卡、模板、文档、截图、release 说明）**保持全年龄**。软件本身是工具，不约束、也无法约束用户的私密使用——生成内容的合规责任由用户与其所连接的模型服务商之间的协议约束。详见 [docs/AGE_NOTICE.md](docs/AGE_NOTICE.md)。

## 社区约定

参与本仓库（issue、discussion、PR、评论）请先阅读 [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)。

## 许可证

[MIT](LICENSE)
