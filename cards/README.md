# 初始内容包（全年龄）

改编自 **黎棠时《岁除上都雪》**，收录部分人物与设定，仅作产品演示用途，著作权归原作者所有。全部内容保持全年龄。

## 目录

```
cards/
├── characters/   角色卡（Character Card V2 JSON）
├── scenarios/    开局剧本（说书人模式，AI 兼任旁白与群像 NPC）
└── worldbooks/   世界书（夜来霜 worldbook v1 格式）
```

## 角色卡格式

Character Card V2（`chara_card_v2`）JSON，社区标准格式，**现在就能直接导入 SillyTavern / RisuAI 等客户端试用**；夜来霜编辑器将原生支持 V2 JSON / PNG 两种容器的导入导出。

字段使用要点（与产品总纲一致）：

- `description` / `personality` / `scenario` 为永久注入内容，写法以「散文为主、可枚举事实用列表」的混合式
- `first_mes` 决定模型的文风与回复长度
- `mes_example` 用 `<START>` 分隔，含至少一次冷场/拒绝示例
- 约束写进正面措辞：**不代写 {{user}} 的行为、台词与内心**
- `extensions.yelaishuang` 为本项目命名空间（来源、分级、角色定位），导入导出时未知键值应保留

## 世界书格式（yfs-worldbook-v1）

夜来霜自定义的世界书交换格式，字段对齐 V2 规范的 `character_book.entries`，便于双向映射：

| 字段 | 类型 | 说明 |
|---|---|---|
| `comment` | string | 条目名 |
| `keys` | string[] | 触发关键词（支持别名；中文场景关闭全词匹配） |
| `secondary_keys` | string[] | 次级筛选词（AND 逻辑，可空） |
| `content` | string | 条目正文，必须自包含 |
| `constant` | bool | true = 常驻注入；false = 关键词命中才注入 |
| `selective` | bool | 是否启用次级筛选 |
| `enabled` | bool | 启停 |
| `insertion_order` | number | 数值越小越靠前 |
| `position` | string | `before_char` / `after_char` |

标注「【未揭示】」的条目属于剧情底牌，供长线剧情逐步揭示，AI 不应一次性说破。

## 登场人物一览

| 角色 | 定位 |
|---|---|
| 杳晦 | 初次下山的小道童，符箓与丹药，感知敏锐 |
| 禾弗 | 西市铁匠，巨锤力修，憨直讲理 |
| 亦尹 | 回春堂巫医，医毒双绝，暗器师 |
| 林夕 | 故纸堆摊主 / 藏卷阁书修，随身听与印章 |
| 文暄 | 烤翅摊主，厨修兼机关师，毒舌 |
| 陈笙 | 淮甫山外门渔修，温柔之下有骨 |
| 虹 | 白发红瞳的神秘少女，来历不明 |
| 江倖 | 灰袍客，黑白棋子，棋局背后的人 |
