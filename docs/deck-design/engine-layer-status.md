# 引擎分层与当前交付状态

2026-10-02，Draft。以下区分已存在的代码模块和待完成的正式契约；模块分开不等于全部 SDK 边界已经验收。

| 层 | 当前实现 | 正式交付仍需完成 |
|---|---|---|
| 来源与数据 | nnnotes 导出、Rust `master.rs` / `data.rs`，dataset/model/asset 身份与快照 | 全部浏览器识别资产 manifest、当前生效版本、严格 schema/来源与能力检查 |
| 玩家事实与合法域 | `cards.rs`、`deck.rs`、power/bonus/memory；研究入口有约束和部分拒绝检查 | ownedFacts/eligible/unknown 独立、全局培养与持有事实、完整合法 resolver，不能继承 legacy 默认值为真实账号事实 |
| 数值与状态机 | `num.rs`、`power.rs`、`calc.rs`、`live/{score,raw,full,...}` | 最新合法输入下完整 SkillExecutor/LiveExecutor、Snap 条件/累计/时钟、失败与结算的原生差分 |
| 统一目标求值 | `scenario.rs`、`replay.rs`、`event.rs`、finite-seed expectation | 正式 `Evaluate` 输入/输出、目标授权域、终值/路径效用、timing policy 与不支持情况一致；现有标准歌曲 profile 和真实账号搜索仍分域 |
| 搜索 | `search/{power,snaps,expectation,recommendation,...}`，Top-K、exact 支持域和候选策略 | 冻结 GoalSpec/identity/tie/合法域；联合微操、质量/上界证明、可分片 SearchSession、合作取消和恢复 |
| 传输与产品 | 薄 CLI、WASM；MoeNotes Worker/既有卡片组件和 nnnotes 预制体 | 真实截图→校对快照→搜索闭环、迟到响应防护、下载/手机性能与微操提示 |

WASM 传输壳不复制评分公式；搜索以 evaluator 的完整候选结果排名。正式门面必须让 FixedDeck、DeckSearch、SongRanking 共用数据和求值语义，分别选择动作与目标。图片识别和用户修正属于数据入口，不进入计分数学。

## 当前实际搜索

- 综合力与受证明约束的单调 Skip 目标：canonical search，成员分支限界/留影匹配，按已证明的非负且不溢出等域解释 exact；不扩大到任意 Live。
- 物理队伍 Live 的研究 `Exhaustive`：递归枚举成员/留影/位置，受 time/candidate limits 限制，未耗尽时不标最优。研究请求默认该策略，默认预算不是全池最优证书。
- 研究 `Candidate`：多个综合力种子先覆盖，再做成员替换、留影替换、成对槽位交换与随机提案；保留结果完整复算，标 heuristic。现阶段还不是正式多目标/微操联合求解器。
- 小域独立穷举是策略验收 oracle。正式大池计划用目标对应的多来源种子和联合邻域/beam 提案，只有可采纳上界经过证明才做 exact 剪枝。

参考 allium-deck 的问题分派与只读 pool 分层，OurNotes 的随机顺序、物理配对、Snap 状态和时间输入按自己的原生语义建模。完整方案见 [搜索设计](search-design.md)、[微操设计](micro-timing-search.md)、[主线门槛](primary-delivery-gates.md)。
