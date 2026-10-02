# 协作者任务书：真实触控与微操

状态：2026-10-02，Draft。这是[协作说明](collaboration-brief.md)中的独立主任务；用户希望故意提前或延后按键取得更高分，但收益必须由游戏原生语义证明。

## 任务目标与所有权

实现可审计的物理操作求值契约，证明最新 JP 真实触控、判定和计分/技能状态一致；再定稿队伍与微操联合搜索。先做建模、原生对照和小域 oracle，门槛通过后才做正式 WASM 接入。

你负责 `raw_input` / `raw_updaters` / `raw_scheduler` / `full/raw_runtime` 的触控、状态、窗口和时钟审计，以及新的 timing-policy 合法性、候选生成与优化研究。现有文件名是代码入口，里面旧版本 VA/注释不构成最新 JP 证明。

我们提供版本冻结的 NativeSkillContext fixture：真实成员/Snap、技能等级/条件/目标、技能顺序与共享 RNG 的初始化/洗牌状态、完整参数、frame/trigger/settle driver 接线。它仍在验证；此前你可以先闭合无技能真实 touch 路径，不能用手写 SkillStatus 或假 getter 绕过依赖。

首批可直接领取的无技能基线见[handoff manifest](collaborator-physical-replay-manifest.json)：同源原始 chart/364 note/line 图、实际执行 harness 与 ABI、输入对象原 ctor、frame/dt 流和参数的 SHA。它目前是 AutoPerfect 隔离基线，物理 touch 注入、设备投影与完整 NativeSkillContext 未交付；这三项必须按各自范围建立，不能把 baseline manifest 当作完成证书。

公共 score/full 状态机、GoalSpec/Evaluate、账号 resolver、队伍搜索和前端是集成边界。发现其错误要附最小原生反例和影响说明；本任务不另建一个微操分数公式，也不顺带重写原有 UI。

## 先解决四种时间

每个实验保留：谱面 nominal time、原始 device/touch time、原生 judgement time、实际 frame clock、score command time，以及技能开始/结束和对应状态。device→music offset、音画调整与玩家提前/延后不是一个变量。

目前无技能 AutoPerfect 例子中，一个音符在 frame 5,888 ms 返回，而 judgement/command 是 5,882 ms。它证明 frame clock 不能直接代填 judgement time；但 Auto 的 judgement 恰与 nominal 相同，不能独立证明 command 究竟锚定哪一种时间。静态 AddNoteScore 路径指向音符位置时间，仍需真实提前/延后控制消歧。

核心当前将 combo/life/NoteCommand 放在 nominal time，judgement timestamp 用于转换。不能把一个窗外音符的 timestamp 移进技能窗就宣称涨分。若原生同判定移动没有收益，模型和优化器必须返回零收益。

## 分阶段交付与验收

| 阶段 | 交付 | 验收要求 |
|---|---|---|
| T1：物理输入 | 最新方法/字段/ABI ledger，真实 down/move/up/flick 输入、屏幕到 lane/轨迹和时钟规范，完整 note/line 父子关系 | 正常与负控制：tap、flick、hold/slide、同帧/多触点、取消/遮挡；只能通过实际原生方法/输入对象操作，不手写接口/vtable/判定结果 |
| T2：因果时钟 | 同队、同初始化 RNG、相同判定与改变判定两类提前/延后实验；原始逐帧流与命令/state | 技能外→边界→技能内、±1 ms、variable FPS/非恒定 f32 dt、提前/迟到同帧批次与 phase 前后快照；保留实际 life 查询时钟和每条随机流的消费顺序/前后状态，不强制不同路径消费相同次数 |
| T3：同输入模型 | 小谱和真实谱的物理输入 replay，通过统一 evaluator | score/combo/life、判定/raw diff、command 时间/顺序、技能状态、实际 driver 查询时钟和 RNG 消费一致；整数/binary32 按原字比较，不平移帧或添加宽容误差掩盖差异，也不继承 549 的 query0 控制 |
| T4：合法策略 | TimingPolicy schema、行动/信息边界、原始轨迹重放和拒绝原因 | 不能独立拖动 hold/slide 子音符；不能复用不存在的触点、时间倒流或访问未来 RNG；所有计划能还原为可执行原始事件 |
| T5：搜索设计 | 关键时间候选、组内联合搜索、多队伍/多重启、独立小域穷举和 held-out 评估 | 不把旧固定打法分数当微操上界；展示 baseline/new score/差值/容错/复杂度；启发式明确 gap unknown，达标目标与均分目标分别定义 |
| T6：浏览器交付 | 通过门槛后的 WASM adapter/Worker 输入输出、预算/取消/过期快照与性能记录 | FixedDeck/DeckSearch/SongRanking 使用同一 timing-policy 语义；手机延迟/下载/内存实际测量，复用已有卡片与谱面预览 |

`AutoInput.overrideDiff` 可用于机制隔离/负控制，但不是玩家物理操作，也不构成 T1/T4 完成。native ctor/runtime-invoke 的真实身份和异常必须保留；delegate 使用原 native ctor、真实 target 与正确 MethodInfo，不能手填内部字段。不要从原生函数返回推导完整 Unity/账号 lifecycle 已完成。

## 接口需先定稿

以下是待冻结的契约内容，名称不代表已交付的 API：

| 输入/输出 | 必需内容 |
|---|---|
| Source identity | 区服/client/native/metadata/active-patch/master/chart、规则能力与 fixture 身份 |
| PhysicalReplay | frame clock + f32 delta bits、device↔music 映射、触点身份/phase/位置/time、阻挡结果、note/line 图 |
| NativeSkillContext | 实际配对与培养、初始化/洗牌后四条 RNG 状态或可完整重建的 root＋调用历史、技能/condition/target、普通/撃奏范围与外部条件 |
| TimingPolicy | 静态或可观察信息驱动的因果策略、音符组/轨迹/偏移/容错、版本、合法性结果；冻结 ObservationBoundary、可见字段白名单和 policy 调用阶段，不能读取已完成本帧/未来状态后回选同帧触控 |
| Evaluation | 声明目标与环境分布、完整轨迹结果、baseline 与微操净收益、状态/异常/未知支持范围 |
| Search result | 输入 revision、完整候选、终止原因、工作量、heuristic/exhausted/proven/gap 范围、可重放策略与证据 |

每个队伍从同一声明环境 law 的 root 初始化，按该队真实调用历史消费四条随机流。不能以人为最佳技能顺序或每队各挑幸运 seed 制造优势；静态策略不能预知隐藏 shuffle，动态策略只用当时可观察的信息。原生边界测试用 root 0/MIN/MAX 等是覆盖案例，不是玩家 root 分布。真实分布未知时明示采样条件。

## 搜索路线与反例要求

候选从已验证的判定窗、技能/撃奏边界、40 ms command 帧和触控链约束生成；同窗/同链作为组联合求值。先用少量组和队伍做独立枚举，再设计 beam/局部提案、多组与队伍交替改进。每个候选策略必须完整 evaluator 复算，不能假设局部收益可加。

先声明有限策略域：时间分辨率/可选区间、触点数与轨迹自由度、完整 ranking vector/identity。独立 oracle 不复用生产候选生成、剪枝、等价类、matching/TopK 或排序实现，可复用已经认证的 point evaluator。exhausted/proven 只覆盖该有限域；关键边界枚举没有覆盖证明时不认证连续全域最优。

至少包含：同判定跨技能边界无收益或有收益的实际例子；判定变化带来的净收益；延迟造成 combo/life/累计或回放改变；两个单独操作均不改善但联合改善的搜索案例（若原生存在）；固定 AP 排名与微操排名可反超的实际例子（若存在）。不存在时保留独立查验结果，不伪造提升。

区分“原生在声明测试域证实某种移动无收益”和“本次启发式未找到提升”。后者可以返回 `best-observed gain = 0`，但仍是 `gap unknown`，不能解释为所有微操无收益或任务完成。

当前 S 审计发现 Skip 的非有限中间值会破坏单调 reduction 并产生错误 Top-1。微操新增的上下文/策略依赖更不能直接继承旧上界、效果等价类或缓存 key。只有明确证明所需 trait 的域才使用 exact 剪枝；其余路线保留完整候选与启发式标识。

## 首批可领取工作

先交一份 T1/T2 实验说明和机器可读 case 清单：选一条已绑定真实谱、少量 note/line 图与原生真实输入对象，分别安排 nominal、提前、延后、跨帧及非法轨迹，定义预期观察字段、负控制和未初始化依赖。审阅接口后，在独占 CNB 工作目录跑一个单 worker，取回源码/输入/原始流/异常/参数与 SHA 清单，再扩大队列。

第一个 Draft PR 的完成条件是：其他开发者能按说明重跑至少一组真实 touch 正/负控制，复现同判定与改变判定两类时间实验，并看清 nominal/judgement/command/frame 的关系。若技能上下文尚未就绪，交付无技能结论和明确依赖，不将 AutoInput 结果包装为触控证明。后续跨技能窗实验与联合搜索仍保留在本工作包中。

交接时提交四项：实验入口和 case manifest、绑定身份及完整原始流/哈希清单、统一 replay 的最小接口 diff、结论与反例表。源码与摘要进 Draft PR；原游戏 payload 通过已有私有产物目录交接，凭证不随产物交接。我们评审公共接口并提供依赖 fixture，协作者独立维护本工作包的实验与实现。

工程起点是 Deck Draft #5 对应核心及[微操设计](micro-timing-search.md)，对照基线见[无技能同输入整谱](latest-native-frame-comparison.json)。每项结论绑定实际源码/二进制；原游戏 payload 在私有/忽略目录，公开 PR 放代码、无 payload 的摘要和可追溯身份。所有相关 PR 始终 Draft。
