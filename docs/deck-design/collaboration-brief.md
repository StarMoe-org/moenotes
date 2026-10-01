# 协作说明：玩家组卡、计分与微操

更新：2026-10-02。目标接入方是 MoeNotes；模型、搜索和浏览器接入 PR 始终保持 Draft。本文划定协作范围，不表示 M/S/B 已放行。

## 最终要交付什么

玩家在网页上传卡池截图，校对识别与实际培养，选择目标，快速得到可照摆的五槽队伍和配对 Snap。结果应说明相对现有队伍的改善、适用条件、随机波动和搜索完成状态。未知培养不能默认为满级或初始值，拥有但不参选的卡不能从持有事实中删除。

FixedDeck、DeckSearch、SongRanking 共用同一数据、状态机和 Evaluate。固定队伍求值、搜索队伍和逐歌排序是不同遍历方式，不维护三套分数公式。歌曲 meta 的 master/谱面/模型身份、评级数据与可选 Snap 条件也要随数据更新。

| 玩家要求 | 必须保留的含义 |
|---|---|
| 可靠冲分 | 指定区服、歌曲、难度、模式、培养和打法；期望、达标机会与最幸运单局分开 |
| 目标设计 | 冲分、稳定达标、跳过/资源效率、活动歌曲分数与活动奖励分别建模；综合力候选不能代替演出最优 |
| 微操 | 联合考虑队伍和可执行的提前/延后触控策略，给出净收益、判定要求与容错；无收益时如实返回零 |
| 浏览器 | WASM-only，排除 WebGPU；权重、检索资产和版本 manifest 支持浏览器识别，重任务在 Worker |
| 展示 | 复用既有卡片组件与 nnnotes 的真实预制体/资产/拼装方法；五槽中间是 leader，保持比例、立绘出框和弧形编队 |
| 原界面 | 保留原场景与排行列语义，拒绝非法成员/Snap/培养选择；页面名称和路由按最终目标分支核对 |
| 交付顺序 | 最新模型 M、搜索 S 先验收，再正式接入 B；研究适配、素材和绿色 CI 不解除门槛 |

详细玩家目标与事实/假设边界见[玩家目标](player-objectives.md)，总体放行表见[主线门槛](primary-delivery-gates.md)。

## 当前真实进度

| 部分 | 已有证据 | 还不能声称的能力 |
|---|---|---|
| 最新来源 | JP Android 1.0.4 / 10053、已恢复 ARM64 原代码与 metadata；冻结 2026-09-30 JP master | 活跃 IFix/线上当前资源尚未认证；目前是 offline-base |
| 实际成员与 Snap | 一组初始培养五成员/五 Snap，真实 factory 的 36 数值/10 身份字段与 Rust 一致；总力 59,223 | 任意合法账号、培养全域和完整 Unity/player lifecycle |
| 计分参数 | 实际 factory 的 24 数值字段/22 键身份与冻结核心一致，f32 按原字比较 | 所有判定、回血、失败、条件和累计行为 |
| 随机原语 | 当前核心对保存 JP 原生 golden：24 派生 seed、120 独立事件的三种调用模式，共 384 比较零差异 | 六个测试 root 不是玩家 root 分布；整局调用历史还需核对，不能挑幸运种子当推荐 |
| 无技能整谱 | 真正原生 AutoPerfect 隔离轨迹 5,634 帧/364 事件；同输入 Rust 对照 33,804 字段零差异，终分 209,797 | 有技能/Snap/撃奏的合法完整对局、真实物理触控和微操收益 |
| 真实 SkillStatus/初始 SkillExecutor | matching engine callback/managed wrapper 已实际执行；原 Localize Awake 发布实例与 SkillStatus 为 509/509；后续真实 SkillExecutor factory/四个 normal-node target delegates/初始两 phase 为 549/549 | 549 阶段明确 GK=false、初始 query clock 0、Clear 后 MusicLength 0、未 apply；正常 driver、完整 input、效果与结算仍待验收，本地化 scene/font/prefab 未认证 |
| CLI/WASM | 锁定核心 CNB release、274 测试、28 组合成 UTF-8 CLI/WASM 对拍与取消/大整数检查 | 正式 OwnedSnapshot resolver、可分片恢复、真实截图与手机性能 |
| 搜索 | Power 的 canonical 分支限界/唯一 Snap 匹配；Live 的有限物理枚举与候选启发式 | S 未通过；下列反例与排序/预算/合法域契约必须处理 |
| 界面/数据 | SSR 编队展示和合法选择有独立 Draft；歌曲修复、自动导出/压缩管线按其独立授权已处理 | 这些产物不能作为真实持有 DeckSearch 或整个 B 门槛的证明 |

刚完成的搜索审计在 CNB 确认三项问题：零预算的小域仍完成、底层 `K=0` panic，以及正且 finite 的配置在中间 f32 溢出后逃过 Skip 域检查，导致实际错误 Top-1。最后一个反例是两个合成队：94,307 力的得分为 MAX，947,750 力的得分为 MIN，搜索却选择后者。这是算法契约反例，不是日服合法玩家案例；修复或严格拒绝该域后才可发最优证书。None 的 tie 顺序、稳定达标的次目标、固定槽/配对约束和分片取消也未冻结。

当前来源与验证范围见[原生摘要](latest-native-gate-summary.md)、[整谱同输入对照](latest-native-frame-comparison.json)、[搜索审计](latest-search-gate-audit.json)和[分层状态](engine-layer-status.md)。

## 仓库与代码边界

| 仓库/层 | 负责什么 | 当前可定位入口 |
|---|---|---|
| OurNotes Deck | 数据、账号事实、数值状态机、统一求值与搜索、CLI/WASM | `src/{master,data,cards,deck,num,power,scenario,replay,search}`；`src/live/{raw_*,full,random}` |
| nnnotes | 同源歌曲/master、谱面与 UI prefab/资产导出 | 导出 schema、版本/asset 身份；不另写计分公式 |
| MoeNotes | 截图与人工校对、目标/约束、Worker、排行与推荐展示 | docs/deck-design 与既有 chart-data/卡片组件；正式门面尚待验收 |
| OurNotes Player | 原生 Sprite/prefab 的浏览器拼装与编队几何 | 既有 UI renderer，避免重新画一套相似卡面 |

研究核心基线 `4e1f1ce`；[Deck Draft #5](https://github.com/empty-sekai/ournotes-deck/pull/5) 的 head `67e07a1`。协作说明发布在 [MoeNotes Draft #12](https://github.com/StarMoe-org/moenotes/pull/12)；界面是 [MoeNotes Draft #11](https://github.com/StarMoe-org/moenotes/pull/11)，预制体 renderer 是 [Player Draft #16](https://github.com/empty-sekai/ournotes-player/pull/16)。PR 可继续更新，实际开发前重新核对 head 和目标分支。

## 给协作者的主任务

交给协作者最难、且能独立推进的一块：**真实触控判定 → 计分/技能时钟 → 合法微操策略与搜索**，完整范围见[任务书](collaborator-microtiming-scope.md)。

我们继续负责最新来源、成员/Snap 的原生工厂与 SkillExecutor 正常 driver、公共 GoalSpec/Evaluate/OwnedSnapshot、既有搜索反例修复及最终 MoeNotes 集成。协作者不接管这些活跃目录，也不同时改现有 UI 或数据发布管线。

共享接口先按输入/输出契约对齐，再合代码。协作者使用独立分支、源码目录、target 目录和 case namespace；修改公共 `full/mod.rs`、`scenario.rs`、`search/recommendation.rs` 前先提供最小 diff 与接口影响，避免覆盖另一条实验链。

## 开发与验收纪律

编译、原生批量实验和无头浏览器在 CNB；Windows 只编辑、取回、审计或查看。当前校准机是 8 核/16 GiB；新大机必须有已校准的独立 case 队列和可测利用率，不能开着 64/192 核等任务。

WebIDE 的 HTTP 连接才保活，SSH 不算。实验每阶段封存 input、执行源码、绑定、原始流、参数、返回/异常和 SHA 清单并取回，工作 checkpoint 与完成 proof 分开。当前 `/workspace/cache/native-jp-104` 是活跃主链，协作者创建自己的 `/workspace/cache/<owner>/<case-id>`，不得覆盖、reset 或停掉别人的容器。

原生语义证据执行原游戏机器码；Rust/WASM 对拍只是运行端证据，静态定位只是身份/调用证据。人工种子、AutoInput 控制、未知/未初始化状态都要写明。所有模型/搜索/接入 PR 保持 Draft，M/S/B 分别验收，最终仍须真实截图到推荐闭环。
