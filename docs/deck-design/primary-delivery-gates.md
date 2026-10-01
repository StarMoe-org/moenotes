# 组卡与计分主线：交付门槛

状态：2026-10-01，Draft。最终玩家路径是网页选择截图 → 识别与校对真实持有卡池 → 按目标搜索 → 可照摆的五槽队伍与配对留影。最新计分建模与搜索策略验收先于正式接入。当前 UI、歌曲数据发布和素材不解除这两项门槛。

## 现有证据分别证明什么

| 项目 | 已验证范围 | 仍需完成 |
|---|---|---|
| 最新日服原生 | Android 1.0.4 / 10053 的恢复、独立 boot、方法身份与部分数值原语；offline-base、未加载 IFix | 实际生效 patch、同源资源；真实培养与 Local Member/Support factory → LiveSettings → 原生技能容器/SkillExecutor → LiveExecutor 完整轨迹 |
| JP Local 卡片初始化 | 5 成员、5 Snap 的真实 Master 构造、初始培养读回、Player Add/Get 身份一致；152 次已返回的绑定调用 | formation factory、真实全局 cache、非空 member-power 映射与完整 Live；构造通过不能代替效果或合法域通过 |
| JP Snap 静态清点 | 615 普通/1,050 撃奏 effect 行，非零 condition/target/cumulative 引用无缺失；现有卡直接引用且有声明 rank 映射的行 790 条 | 所有行为的原生对照；另 875 条未被当前 SupportCard 直接引用，保留账本，不计玩家合法 case；19 个结构签名只用于实验排序 |
| JP CardPower | 948,973 个独立输入、1,950,919 字段零差异，其中真实 member max × level 行对 4,910 个 | 合法玩家全局状态、五槽/Snap/场景组合；大量取整和溢出输入不计为合法队伍数 |
| JP 原始谱面与洗牌 | 一份真实 chart 的 id/time/op 三列 1,092 字段；六个 root 的成员洗牌与后续随机状态 | 真实 parser settings、判定/fever/技能事件；无 Snap、注入 75,038 power 的构造证据不能认证完整配对 |
| Snap 歌曲排行 | `standard-skill-profile`、声明综合力/打法/种子/顺序下的 WASM 逐歌复算与界面 | 真实持有与培养的 DeckSearch；普通/撃奏 Snap 全依赖、共同随机流与完整 Live 原生差分 |
| CNB 组卡研究编译 | 基于 current-core `4e1f1ce` 的 locked CLI/WASM release、274 项测试与 28 组合成 UTF-8 浏览器对拍；124 源文件前后 SHA 一致、126 产物独立回收核验 | 最新原生认证、正式 GoalSpec/roster resolver、step/resume、真实截图和手机性能；不升级为正式全域 v1 |
| 浏览器识别 | 两份 ONNX 权重的合成张量 batch 1/8 算子/形状对照 | 真实截图定位、裁切、检索、字段、拒识、跨图合并和浏览器准确率 |
| 截图到结果 PoC | 八项宿主 HTTP 路径验收；约两秒调用宿主 Rust solver | 全浏览器识别与搜索、手机性能；宿主 Rust 不等于 ARM64 游戏原生执行 |

数字以各自证据域为分母。WASM/x64 一致、候选计分精确、完整卡池最优、与最新游戏一致是不同证明。

Local 初始化的输入与原始报告 SHA、培养读回、14.365 s / 829,036 KiB 单 worker 记录见[独立摘要](latest-native-local-factory-pilot.json)。它尚未执行整场或证明可并行队列。Snap 的表 SHA 与代表行索引见[静态清点](latest-snap-static-inventory.json)，`nativeRuleComparisons = 0`；结构签名不作为等价类、剪枝依据或覆盖通过数。

## 下一轮原生实验的顺序

1. **P0：真实培养的普通 Live 基线与显式实验隔离对照。** 由真实当前培养、成员/留影与全局状态进入原生 factory，保留实际技能，读取 LiveSettings、时钟和 parser 参数。比较逐帧 score/life/combo、显示与结算，加入终分相同而中途状态不同的负控制。关闭成员技能若仅能由 harness 注入，单列实验控制与构造范围，不计为玩家动作或完整 factory 认证；空留影是否属于合法选择由目标版本规则另行确认。
2. **P1：能改变推荐顺序的 Snap。** 先验证非空 `ISkillMemberPower` 映射和普通/撃奏技能 factory，再覆盖配对、队长、物理槽、rank 派生等级、命中/不命中、AND/OR、累计/限次/释放与时间边界。构造器到 Skill/Luck 使用同一 root，洗牌后不重置随机流。
3. **P2：撃奏与失败。** Combo/Just/Luck range、Solo/Network 条件、排名前后两个 score 分开；life 归零、damage→heal/guard、失败停止、继续/重试的生命周期逐项验收。
4. **P3：组合改变排序。** 高综合力低收益、低综合力高收益、换 Snap 导致歌曲排序变化等区分用例，全场原生/共享求值通过后再与小卡池独立枚举比较。

旧 TW 技能清单的 member-power dictionary 为空；依赖该接口的效果、conditional parent state、elapsed/countDecrease、区间 judgedCount/accuracyAverage 与全局 maxCombo/judgedCount 不能从旧通过数继承。4011 两个定向分支不证明真实概率总体，也不替代后续 life/band 条件。

先验收一个 worker 的合法输入、观察字段、负控制、异常、耗时和 RSS，再分发独立 case queue。并行上限为 `min(核数, 可用内存/(实测RSS×1.35))`；未形成有效任务队列不开多机。每条 case 绑定版本、源行、输入与输出 SHA、比较字段和阶段；重复执行不增加独立覆盖量。

## 玩家目标与搜索的最小冻结项

首个可交付目标为**当前已确认培养、指定歌曲/难度/场景，在声明 joint law 下最大化结算分数期望**。独立目标包括分数达标概率、期望短缺、活动每局/每消耗/每分钟收益；排名记录与累计积分分开。失败模型未认证前，不把 terminal life 或准确率百分比称作真人“稳过谱”。培养预算等待成本与合法转移图，先支持声明的改前/改后比较。

- `GoalSpec` 固定效用、约束、平局、物理队伍/成员集合 Top-K 身份和目标版本；不同目标不使用未经声明的加权总分。
- `ownedFacts`、`eligibleCards`、培养未知项与完整持有声明独立。拥有但不参选仍影响回忆等全局事实；根据目标返回缺失字段，不强迫所有场景填写两类技能。
- 五个不同角色、中央槽 2 队长、实际 SupportCard ID 唯一、rank 派生技能与场景/GK/network 条件由共享 resolver 拒绝非法输入。
- `DeckSearch`、`SongRanking`、`FixedDeck` 共用 `Evaluate`；实际卡组每换歌重新求综合力和适用条件。标准 profile 的固定 power/seed/order 不用作真实账号搜索。
- 首先完成一组合法 baseline；多来源候选与成员、配对、队长、槽位的联合邻域随后优化，每个保留候选完整复算。Live 上界未经证明时保持 heuristic、gap unknown；Power/Skip exact 只在已证域开放。
- 小域独立穷举、可采纳上界反例、joint-root 与 held-out 敏感性是正式策略验收。较少示例 roots 的最优不称真实随机总体最优。

完整数学与范围仍见[搜索设计](search-design.md)、[玩家目标](player-objectives.md)及[共享求值](shared-evaluation-and-data.md)。以上是待证的最小交付范围，不将现有 PoC 升格为正式实现。

## 截图到推荐的四个接口

| 边界 | 需要冻结的契约 |
|---|---|
| 图像 → 观察 | 文件/规范化像素 SHA、bbox/裁块、`(kind, masterId)`、unknown 原因、置信度和识别版本；原始观察不可变，修正追加证据 |
| 观察 → 持有快照 | owned 与参选集合分离；冲突不取较大数字；未知培养按目标补齐；子集推荐明确范围，人工修正不被新截图静默覆盖 |
| 快照 → 求值/搜索 | dataset/model、goal、scene、joint law、玩家状态与原始 UTF-8 JSON；精确整数不经 JS Number 往返；重复字段和未知键严格处理 |
| Worker → 结果 | `jobId + inputRevision + dataset/objective hash` 贯穿 start/progress/cancel/result；partial 不进入 Top-K，迟到响应丢弃，取消不伪装 Complete |

浏览器最小识别 manifest 还需绑定 ORT JS/WASM、两份权重、catalog、SIFT descriptors/points/owners、图库向量、规范卡面、卡阶模板及预处理规则的 SHA/大小和有序素材指纹。当前 Python/OpenCV 的 SIFT/FLANN/RANSAC/像素核验/网格恢复未完成 Web 移植；不能仅传两份 ONNX 宣称识别闭环。

推荐 Worker 需明确 `SearchSession.step` 的共享 monotonic deadline、部分根/候选的完成状态、合作取消/恢复及 cleanup；单次同步 `recommend()` 不构成可分片搜索。热启动两秒内首个**完整**结果、十秒优化预算是待测目标；中低端设备 cold/hot p95、下载量和峰值内存单独验收，不从 64 核吞吐推算手机体验。展示继续复用已有卡片组件与 nnnotes 预制体。

## 放行记录

| 门槛 | 当前结论 | 放行证据 |
|---|---|---|
| M：最新模型 | 未通过 | 活跃 patch/同源快照与合法 whole-live/Snap/时钟/舍入差分及完整覆盖账本 |
| S：搜索策略 | 未通过 | GoalSpec/合法域/tie/Top-K、独立枚举/上界或明确启发式质量、统一预算与终止语义 |
| B：WASM 端到端 | 未通过 | 真实截图识别与校对、同输入运行端一致、取消/过期/恢复、手机延迟和内存 |

先完成 M/S，再实施 B。所有模型、搜索与接入 PR 保持 Draft；已获得单独合并授权的数据修复/自动管线按其独立验证处理。

用户后续已授权在 CNB 验证与编译组卡。基于当前数值核心的薄 CLI/WASM 适配研究可以继续，需绑定 base commit、源码差分、lock 与实际产物；未经认证的 network/finished 生命周期必须明确拒绝，不得省略后返回成功。编译或运行端一致性不解除 M/S，也不将同步调用升级为可分片、可恢复的正式浏览器搜索。

已完成的构建与独立回收记录见 [OurNotes Deck Draft #5](https://github.com/empty-sekai/ournotes-deck/pull/5) 和其中的 [CNB 验证摘要](https://github.com/nichinichisou0609/ournotes-deck/blob/67e07a1470f0913f1fdaf5ae7cbd2f9afe2988e1/docs/research/cnb-wasm-2026-10-01/build-summary.json)。报告声明 synthetic current-core；network/finished 的任何显式输入被拒绝，deadline 仅保留完整候选，硬取消终止整个 Worker。旧共享源码目录的证明已失效；当前包由独占目录重建，source manifest SHA `f5dd37e162540825b82af740918236c25d60265cd10593d19bdd8957181d3a8c`，artifact bundle SHA `019fcb29eb0218d784f08172d831603b7fa5e5439760051adfcc94c2750c67b6`。不认证任意 roster 输入的合法性，也不包含浏览器 OCR。
