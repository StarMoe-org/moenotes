# OurNotes 组卡目标、搜索数学与验证门禁

日期：2026-10-01，Asia/Singapore。状态：**设计、原生研究与 Draft 编译验证；正式模型、策略和发布尚未放行。**

用户已要求先完成最新版游戏建模与搜索设计，后续明确授权使用 CNB 完成验证与组卡编译。当前允许原生 harness 和基于现有数值核心的 Draft CLI/WASM 编译研究；这不解除正式接入的 M/S 门槛。此前推荐入口、新指标、候选轮转与 WASM smoke 仍按 PoC 范围阅读。PoC 的可运行、既有测试通过和同源 x64/WASM 一致性，分别不能证明最新版规则一致、全池最优或实战收益。

## 1. 首先需要解决的数学问题

1. 旧证据绑定 TW **1.0.1-25**；现已独立执行 JP Android **1.0.4 / 10053 offline-base**，完成部分数值原语、原始 chart projection 和 Local 卡片初始化。10/01 的 Version 与 catalog 观察已绑定，活跃 IFix 与合法整场 Live 尚未通过。各自范围见[主线门槛](primary-delivery-gates.md)和[原生摘要](latest-native-gate-summary.md)，旧 TW 证据不能重标为 JP。
2. 玩家能选择物理队伍、队长、留影搭配和可能的养成行动；**不能选择原生随机技能顺序**。搜索必须把可控决策与环境随机变量分开。
3. 固定判定流上更换随机根，只描述原生随机性。它不自动描述人的错判、连续漏判、疲劳、触控设备或动态判定窗对结果的影响。
4. 综合力最高不是 Live 分数最高；分数期望最高不是最稳达标；活动加成最高不是活动收益最高。目标必须先定义可计算的终值或路径效用。
5. 单次客户端活动点数预览不是实际服务器奖励，更不是跨多次演出的资源收益率。后者读取库存、上限、消耗和时钟，需要额外状态转移。
6. 数值逐候选精确与搜索全局精确是两个不同证明。候选值正确不能为被截断的候选空间提供最优性证书。

## 2. 最新版规则待核清单

根代理负责取得最新版本身份，模型审计负责原生语义。搜索设计在以下输入完成前仅有条件成立。

| 编号 | 必须核实的规则 | 搜索/目标的具体影响 | 当前状态 |
|---|---|---|---|
| V1 | 区服、可获取的最新客户端版本、native binary SHA-256、IL2CPP metadata、IFix/热更清单、master manifest、谱面资产 SHA-256 | 模型与所有证明的身份；不同区服不能仅凭表名相同视为等价 | PARTIAL：JP 1.0.4 / 10053 恢复、独立 boot、同版本 Version/catalog 观察；活跃 IFix 和完整同源线上规则待核 |
| D1 | 成员槽数、不同角色限制、队长槽、同卡变体/借卡限制、留影槽数与唯一性、空留影是否合法 | 合法决策域与枚举数量；不能由旧 UI 推断当前服务器约束 | JP 五成员/五 Snap 的真实 Local 构造和 Player Add/Get 已验证；formation factory、全局状态及完整合法域待核 |
| R1 | 全五槽是否仍洗牌；留影是否跟随成员；root 生成、substream 派生、取随机数顺序、异常/条件检查是否消耗随机数 | 物理槽置换、等价折叠、缓存键和联合分布；不能优化一个原生不可控顺序 | JP 六个 root 的 constructor shuffle/poststate 原语通过，使用 placeholder power、无 Snap；真实配对和后续技能共同流、population law 待核 |
| S1 | Free/Mission/Battle/Arena/Challenge 的合法动作、撃奏强制条件、power song 与 skill-target song 的区别、任务覆盖/零值回退 | 场景解析、合法请求、power 上界、任务与谱面绑定 | 旧模型已区分；最新版及新增场景待核 |
| G1 | fever 范围、任务计数、冻结快照、Solo 与 Network 排名、group ordinal、packet arrival 与实际 settlement 顺序、live-finished 标志 | 撃奏终值、外部输入、帧序；固定名次不是对手预测 | 旧部分链有证据；最新版完整域待核 |
| N1 | 转换后音符/连击计数、有效音符类型、谱面等级倍率、技能事件数量与时间、迟判回退、演出结束长度 | score(power) 的单调域、Live 上界、完整轨迹判定 | JP 原始 chart 身份及 parser 的 id/time/op 三列通过；真实 LiveSettings、完整 note/event/fever/终止语义待核 |
| L1 | life 归零是否立即失败、失败后技能/判定是否停止、续关代价与恢复、退出、assist 的动作影响 | 真正通关概率、稳定性、资源成本；terminal life 不能代替路径失败状态 | 当前没有完整失败/续关/退出证明 |
| E1 | 活动参数与结果时间、消费档、每次倍率、评级阶梯、日/活动上限、角色/留影加成、掉落选择与发奖 authority | 客户端点数、资源效率、跨多次状态；不能猜掉落 | 部分旧客户端预览有证据；最新与服务器规则待核 |
| U1 | 各养成等级/突破/卡阶/技能等级的合法状态、精确配方、共享资源、回忆/拥有数/玩家全局加成与变化 | 养成预算的决策变量、非独立成本及全局收益；不能静默满级 | 当前推荐无完整养成规划契约 |

每项结论必须记录 `version identity → native/master evidence → supported domain → regression/original experiment`。仅版本号相同、函数名相同或 master 行数增加，均不能替代差分核验。若新版函数及数据与旧版逐项一致，可复用对应旧证明并记录核验哈希；未核验部分保持待核。

## 3. 固定输入、玩家决策与环境变量

固定输入记为 `Γ = (version bundle, master/chart, roster revision, player state, scenario binding, rules)`。

请求固定歌曲/难度、模式与活动时，不能在内部偷偷换曲、换难度、换消费或改变打法。要“自动选曲”必须把歌曲和动作明确加入决策域，并计入解锁、谱面长度、人工耗时与资源。

玩家决策为：

`x = (physical members[5], leader, paired snaps[5], action, optional training plan z)`。

合法域 `D(Γ)` 由最新版游戏规则、已确认所有权、允许养成和玩家硬约束共同定义。OCR 未知身份/等级/技能等级不是一种合法默认事实。可做“已确认子池推荐”或对多个明确可能状态作鲁棒分析；不能把未识别卡排除后仍称完整卡池最优。

环境变量记为 `ω = (r, H, B, Q)`：

- `r`：原生 root 及其 Skill/MemberShuffle/Luck 的共同派生状态。保留 signed roots、重复原子和整数质量。不能折叠正负根，不能在洗牌后重新 seed。
- `H`：人类输入/失误轨迹及帧/音乐时钟。固定完成判定流是一个条件模型；原始 touch/FT 输入是另一个条件模型。
- `B`：对手/队友成绩、断线、网络 packet 到达和排名规则。固定 aggregate confirmation timeline 是外部条件，不是因果对手模型。
- `Q`：服务器奖励选择和外部资源变化；没有 authority 时只能保留条件，不得给假概率。

演出模型输出完整终值及必要路径状态：

`T = Eval_Γ(x, ω) = (score, terminal life, fail/continue path if verified, Gekisou states, client counters, authority-qualified rewards)`。

所有期望先逐个 `ω` 得到 `T`，再对终值/路径效用加权。不能先取平均分，再给平均分套评级、掉落或达标阶梯。

### 3.1 概率分布必须单独声明

有限原子模型 `Ω = {(ω_i, w_i)}, w_i > 0` 的质量 `W = Σw_i`，对于整数效用：

`E[u] = Σ w_i u(T_i) / W`。

这是所给离散条件下的精确期望，不等于游戏 root population law。几个示例根、发布种子序列或均匀随机整数，没有已知来源时只能命名为假设/敏感性模型。

不能默认 `r`、人类失误和外部排名独立。使用 `μ_r × ν_H × ρ_B` 必须声明独立假设；有共同时间/设备/网络来源时应输入联合原子或条件分布。现实误差统计即使拟合为离散权重，数值的精确分数也不消除统计估计误差。

人的准确率不能决定误判位于何处。连续漏判与均匀散布的相同 Miss 数会产生不同连击、life 与任务；判定窗技能还可能反过来改变错判分布。若改变队伍会改变判定窗/辅助，不能对所有队伍复用一个“已完成判定流”并称实战预测；应使用经核验的原始输入链或明确承认固定结果条件。

### 3.2 推荐选择和检验应使用不同随机样本

少量 roots 上优化物理槽位，可能只学会这些 roots 的 shuffle。设计上至少区分：

- 搜索分布：决定本次 objective 和数值证书；
- 未参与选队的 sensitivity/held-out 分布：检验另一组声明条件，不能把结果继续当作原 objective；
- 经采集与验证的现实分布：来源、时间范围、样本量、拟合和不确定性另有报告。

逐个候选使用相同 joint atoms，是比较时的 common-random-number 控制，不代表样本具有现实代表性。扩充分布必须改变 input/model-law identity，并重新评估所有保留候选，不能把不同分母/样本规模的临时均值混排成“精确 Top-K”。

## 4. 玩家目标与目标函数

以下目标分别提供计算含义，不能用一个泛化“综合力分”承载。未满足依赖的目标不能默默退成另一个目标。

| 玩家目标 | 主要目标函数/约束 | 必需建模依赖 | 结果应怎样解释 |
|---|---|---|---|
| 当前培养下日常冲分 | `max E[S]` | 最新 Live、明确 H、μ_r；撃奏及外部 B 若开启 | 所给条件下平均结算分，不承诺人类 AP 或最佳原生顺序 |
| 稳定达到分数 t | `max P(S ≥ t)`；建议同概率时 `min E[(t-S)+]` 再 `max E[S]` | joint law；完整 H；若要求过谱还需完整失败模型 | 达分概率与未达时损失，不等于均分排序 |
| 只追目标、不奖励溢出 | `max E[min(S,t)] = t - E[(t-S)+]` | 与单曲分数相同 | 目标以下的预期差距；不能宣称风险已经完全消除 |
| 风险限制后冲分 | `P(S≥t) ≥ q` 下最大化 `E[S]`；或声明下尾 `CVaR_α(S)` | 概率模型、明确 q/α；无可行解需报告最大达标概率与差距 | 机会约束与纯达标目标分开，不用未声明的加权和 |
| 稳过谱 | `max P(native success path)`，之后分数/资源成本 | 原生失败/继续/退出与人类原始输入模型 | 当前不能由“terminal life > 0”认证 |
| 分数且保留结算血量 | `max P(S≥t ∧ L_terminal≥l)` | 声明完整轨迹与life模型 | 一个明确终值目标，不表示life从未归零或已经过谱 |
| 撃奏得分 | `max E[S including verified Gekisou settlement]` | fever、任务、原生共同RNG、Solo或Network排名模型 | 固定名次条件与真实对手竞技收益必须分开 |
| 本次活动积分 | `max E[P_client(T, frozen clocks/counters)]` | 最新活动阶梯、加成、消费、模式、结果时钟 | 客户端预览；服务器发放待 authority |
| 某资源本次收益 | `max E[R_resource(T,Q)]` | 服务器选择/掉落分布或已给定Q | Q仅被给定时输出条件资源量，不能推断掉落 |
| 活动资源效率 | 固定动作成本 c>0 时比较 `E[P]/c`；跨动作/连续刷取应优化明确时域的总收益和总成本 | 库存/上限、时间、失败消耗、消费档、发奖/时钟状态转移 | c=0不能除；`E[P/c]`与`E[P]/E[c]`也不一般相同 |
| 跳过 | `max f_skip(P)`，或上述单调分数目标 | 最新 Skip 全部常量与合法动作 | 当前培养下确定性公式；不能混用手打技能收益 |
| 综合力 | `max P` | 最新卡/玩家/leader/song/scenario参数 | 属性诊断指标，不等于 Live或活动收益 |
| 养成预算 | `max V(x,z)`，`C_resource(z) ≤ budget_resource` | 最新配方、合法状态、玩家库存、全局状态转移与当前所有权 | 返回具体升级步骤、资源向量、改前改后结果；当前尚不具备完整契约 |

分位数取所给离散分布的加权分位。下尾 `CVaR_α` 必须在最差 `αW` 质量上计算，并允许最后一个原子仅贡献部分质量；不能把某一个 P10 数直接当 CVaR。风险参数、单位、平局偏好须冻结为 objective specification。

### 4.1 养成不能简化成每卡一个独立成本

训练计划 `z` 至少包含成员/留影状态变化与玩家全局道具、角色 Rank、VIP、回忆等变化。共享资源约束使用向量；一个“总费用”只有在玩家明确给出兑换/偏好时才合法。收益可能通过全局加成影响未选入队伍的卡，或通过解锁条件影响整个池。更换 `z` 后可能要重建 `Γ` 的 player-derived tables。

可分阶段设计：当前培养评估 → 明确给定目标状态的条件比较 → 原生配方的预算规划。前两阶段不能冒充第三阶段。状态支配仅能在所有相关效果、触发、cost和全局依赖均不变/单调的证明域内使用。

## 5. Top-K 身份、平局与可展示替代队伍

### 5.1 必须先选择输出问题

- **Physical Top-K**：不同物理成员位置、leader、留影搭配及允许的培养状态/动作构成不同决策。适用于有位置依赖的条件 Live 模型。
- **Member-set Top-K**：每组五张成员 ID 只展示最优代表。只有代表在其 leader/snap/placement/plan 域内已求最优，才能宣称精确成员集合 Top-K。
- **Candidate alternatives**：每个成员集合展示当前已找到的最好变体，标为 best observed。不能把去重后的五条候选解释成全局前五集合。

明确身份键：Physical为`(members[0..4] public IDs, snaps[0..4] public IDs/None, resolved training-state key, action key)`，leader由物理槽2定义（仅在最新版D1确认此规则后使用）；Member-set为升序五成员public IDs，其内部代表按同一完整排名键求最优。培养计划的不同写法若解析为同一实际状态与成本，应规范化后去重；尚会改变后续资源/状态的差异不能丢。固定物理槽约束会进一步限制placement，不能在规范化时移动它。

玩家通常希望替代方案而非同队的五个排座。展示可分“不同成员集合”与“同队改队长/留影/培养”，但展示去重不能偷偷改变搜索证明的 identity。可证明的集合 Top-K应显式将 member-set 作为主域并求其内层最优。

### 5.2 排名键建议

正式契约待评审，建议用固定的词典序目标向量：

1. 用户选定的主要目标，精确比较；
2. 该目标明确声明的次目标，例如稳定达标时预期短缺更小，再平均分更高；
3. 若是养成规划，声明的资源/成本偏好；
4. 综合力作为最后数值 tie-break，而不默认覆盖更相关的次目标；
5. stable public identity：成员 ID、leader、每槽留影 ID、培养状态/动作键的固定字典序。`None` 留影置于所有实际 ID之后。

PoC 当前使用主要 payoff → power →物理ID/snapID；改变为以上玩家偏好会改变平台区的 Top-K，必须升级排序契约及 oracle。不能把新偏好只加在UI排序中。候选池 dense index、OCR导入顺序、hash表迭代、线程调度和 root枚举顺序都不得定义公开 tie。

相同分布下期望可比较共同分母的整数分子。不同合理分母需约分/checked cross-multiply或任意精度；溢出是显式错误，不允许f64兜底。部分轨迹/部分分布不产生一个可与完整候选等价排序的结果。

## 6. OurNotes 搜索问题必须由语义分派

参考固定源码 [allium-deck lib.rs](https://github.com/empty-sekai/allium-deck/blob/5c6dff7387e57384b9b2c989ab4f535cdd74f098/src/lib.rs) 的入口、建池、只读pool和搜索分层；参考 [DeckProblem](https://github.com/empty-sekai/allium-deck/blob/5c6dff7387e57384b9b2c989ab4f535cdd74f098/src/search/problem.rs) 先判可交换槽位再选择放置搜索的思想。该版本是结构参考，不是 OurNotes 规则来源，也不是 allium当前发布状态声明。

建议语义层划分：

`Dataset/RulesIdentity → Input/ScenarioResolver → FrozenPool → Point/TraceEvaluator → ObjectiveSpec/DeckProblem → Exact or CandidateSearch → TypedResult → WASM wrapper`。

- Evaluator是唯一游戏数学真源；评分、随机和事件公式不放在JS、OCR或渲染层。
- ObjectiveSpec声明效用、次目标、随机分布和authority；DeckProblem声明legal域、placement、identity和可用证明traits。
- FrozenPool缓存只允许固定Γ的成员属性与无决策依赖项，不把依赖整个队伍或升级计划的效果提前当常数。
- 搜索排序、Top-K、上界和终止统一维护。WASM薄壳负责字节传输、分片调度和状态绑定，不另实现评分公式。

不可从 allium 复制 `best/specific` 技能顺序作为 OurNotes玩家能力；也不可把其活动分数、同角色挑战、支援或称号规则替换 OurNotes scene/snap/撃奏。

### 6.1 域大小与放置问题

若角色c有n_c张允许成员卡，则成员集合数量为 `e_5(n_1,...,n_C)`，即选五角色每角色一张的和。未固定leader且必须保留所有物理位置时，排列因子为`5!`。有s张允许留影，注入数量为：

`Σ_(k=0..min(5,s)) C(5,k) × P(s,k)`。

总域还乘上允许的训练/动作状态；每个完整候选再需评估joint atoms及整首轨迹。实际角色分布与约束应从Γ计算，不能仅凭“63成员/64留影”推断搜索复杂度。

### 6.2 何时能折叠物理排列

综合力与合法 Skip的自由非leader位置在既有证明域可交换；任意有限root分布的Live一般不可交换。

即便原生顺序的**边际分布**看起来均匀，也不足以折叠：必须证明置换后的 `(performance order, remaining random state, all identity/condition observations)` **联合分布**对相关物理置换等变，并且leader和成员/留影绑定不变。共同root可使顺序与后续技能值/幸运相关。独立均匀顺序模型只能作为另一个明确命名的假设。

不满足该证明时，物理放置是内层决策。不能排序非leader ID之后忘记剩余排列，也不能用“每卡技能均值”先乘谱面位置权重宣称exact。

### 6.3 留影与成员不能只按综合力配对

Power层可使用已证明最大权匹配，并保留留影唯一性和canonical tie。Live留影会影响转换、life、持续/延长、概率、技能状态和撃奏，必须与placement及成员联合搜索。

只有证明同一成员处的两留影在全部声明轨迹、随机状态、条件副作用、row顺序、reset/释放与延长方面观察等价，才可折叠成技能class。一个“没有可见加分效果”的行仍可能消耗同一随机流或改变life查询缓存，不能仅按效果标签删除。最新版未清点的新行不进入既有class证明。

## 7. Exact 与 Candidate 的严格边界

### 7.1 Exact

`Complete/Proven`只表示：冻结Γ、分布、硬约束、identity与排序下，所有合法决策已评估或被有效上界排除，输出正好规范Top-K。不能由“穷尽启发式proposals”“连续若干轮没有改进”或“当前最优数值稳定”推断完成。

合法域为空可证明Complete空结果。未知规则、非法状态、Unsupported技能、数据身份冲突、算术溢出分别是错误；不能变成无合法队伍或“降级成功”。只在玩家明确限制域时，才能输出该限定域的精确结果。

### 7.2 Candidate

候选提案可使用近似效能、谱面权重、贪心、局部交换、beam或随机重启，但**所有公开结果**须由完整Evaluator在同一law下完成评估。近似值只是提案/访问顺序，不能冒充上界，更不能据其删除Exact合法域。

Candidate的proposal穷尽仍是heuristic。超时partial不进入Top-K；临时单根得分可作进度，但必须标明尚未成为完整候选。仅在另有有效全域上界时才能提供gap；无上界时gap=unknown，不能把相对某个baseline的提升叫“达到最优的百分比”。

## 8. 可证明上界与不能沿用的剪枝

所有上界都须绑定 `Γ/rules identity + objective traits + supported arithmetic domain`。域检查包括非负属性/倍率、有效谱面常量、life/转换可达性及i32/i64 wrap。原生wrap可以被Evaluator精确复现，但会破坏部分单调性，上界证明不能自动延伸到该域。

### 8.1 Power 上界

旧域的slot分解为：

`S(m,s,L) = A(m) + LEAD_L(m) + W(m,s)`。

用允许留影的`Wmax(m)`放松唯一性；将leader条件效果按最大可达正贡献及累计次数上界，得到`u_L(m)`。对不同剩余角色取各自最佳卡的后缀前r项和，构成成员树UB。叶子再精算whole-deck leader条件与精确留影匹配。

必须重新核实最新版binary32/floor及整卡全局依赖，不能把标签相似当可加项。上界严格小于Kth主要目标才剪；等值分支继续展开，除非完整词典序次目标上界也足以排除。

### 8.2 Skip 的单调快路

在已检查域内，Skip是仅依赖power的非减`f(P)`。若主要目标是非减`g(f(P))`，而其余数值tie也与P相容，则 `(g(f(P)),P)` 和原 `(f(P),P)` 按P同序：

- 不同power在阈值/封顶平台用power破平；
- 同power的score与payoff相同，沿用同一public identity tie。

故当前培养的`score`、`scoreAtLeast`、`cappedScore`可共享该证明。若增加“达到阈值后优先更低升级成本”、不同动作时长/消费、event加成或其他与P无单调关系的次目标，必须重新分派，不能继续用raw-score Top-K裁掉那些解。

### 8.3 Live 上界

候选内完整模拟保留共同RNG、frame rollback及life缓存。树层需要逐音符/区间乐观包络：power UB、可达judgements、combo范围、life factor、能覆盖该音符的正倍率、延长次数、撃奏range与rank bonus。每一项放松必须只增不减，覆盖最新版全部副作用和f32误差累计。

旧`snaps.rs`/`docs/search.md`有特定域包络与效果class证明，可作审计材料，不能未经复核转成新概率目标、动态touch或Network模型的全域UB。统计chart weights及对某些测试组准确的拟合值不构成可采纳性证明。

### 8.4 分分布原子的partial UB

共同分母下，已完成原子贡献`N_done`，剩余原子分别有效用上界`U_i`时：

`UB = N_done + Σ_remaining w_i U_i`。

二值概率可用`U_i=1`；cappedScore可用目标t；score可用合法终值类型/已证明更紧界；客户端点数/条件资源需由实际类型、表、authority和cap证明界。未知服务器奖励不能以0或猜测最大掉落作界。

UB严格低于Kth主要分子可停止这个候选。等值保留全部tie可能性。CVaR、机会约束、路径失败/多次刷取等非单一加性效用需独立partial包络，不能直接套均值公式。

### 8.5 支配与预筛

“power更高、裸skill更大、同角色”不构成OurNotes全目标支配。leader适配、music条件、不同触发、概率draw数、life、留影匹配、任务/外部排名及精确平局都可能破坏它。Exact只接受完整替换证明；否则预筛属于Candidate并记录被限定域。

## 9. 首候选、预算与深搜策略

模型到位后再选正式默认。以下是待验证搜索策略，不是性能承诺。

### 9.1 一份预算贯穿整条计算

公共deadline覆盖解析/验证、建池、预计算、warmup、proposals、逐原子、逐帧及结果复算。冷WASM加载和素材下载另有墙钟记录，不能用热搜索elapsed替代点击后耗时。

同时设node/proposal/candidate/simulation-work/memory上限，分别计数。timeLimit、candidateLimit、proposalExhausted、cancelled与modelError为不同退出原因。帧内操作多时仅每帧checkpoint仍可能超时，需要确定的work checkpoint；合作deadline的可超预算量应实测，不能称硬实时保证。

WASM分片`step(work budget)`负责让事件循环有机会接收取消，并保存同一Γ的frontier与已完成候选。直接终止Worker只表示取消；它不能返回一个此前未输出的完整Top-K。resume不可跨roster/law/dataset revision。

### 9.2 快速获得一个真正完成的候选

优先完整评估玩家当前队伍（如合法）作为baseline；没有当前队伍时，由约束构造五不同角色的合法队伍，并尝试少量leader/留影选择。首候选预算与优化预算分开记录；不先用全部时间预筛、枚举首个power队伍的所有排列或跑全部随机重启。

首候选仍要完成所有本次joint atoms。单次完整评估超过预算时，给出“预算不足以完成一个候选”的准确状态与可继续计算选择，不能显示前几根均值。未核验/Unsupported效果导致Evaluator失败时，报告模型域；不能偷偷丢卡后称原全池推荐。

### 9.3 Candidate 快搜应覆盖多种偏好

候选来源至少分成：当前队伍、power-seeded不同成员集合、score技能不同触发/类型、life/转换保护、任务适配、event适配，以及随机合法重启。各来源仅提案，不更改主要目标。

先轮流覆盖不同成员集合，然后做有界placement/leader/snap细化；留预算给单成员替换、双成员交换、leader切换、留影重配与重启。只有单卡局部改进可能被协同门槛困住，需成组邻域。

PoC的`5*powerSeeds`轮转只解决“首队120排列耗尽预算”这一失败，不能证明其分配比例最佳或胜过其他策略。正式比例应由第12节质量门禁决定，不能因为一次真实大池变好就定默认。

### 9.4 深搜

已核验Power/Skip先用exact分支界限。复杂Live可先候选暖启动获得有效下界，再用已证明UB访问更有希望的成员/leader/snap/placement子域。前沿应覆盖整个合法域；beam丢弃、固定候选池或只从elite邻域继续均不再是全域Exact。

要输出成员集合替代方案，内层对每集合联合求leader/留影/placement最佳代表，外层Top-K；内层未穷尽而没有证明时，代表只能best observed。任意时间证书至少包含当前Kth下界、未搜索域的最大UB、仍可能改善平局的域，以及objective/identity hash。

frontier/缓存保持有界：选择DFS可低内存，但需要证明整个前沿没有遗忘；best-bound heap内存耗尽时只能显式中止/转入保真分区，不得丢分支后声称Proven。

缓存键至少包含Γ、law、human/external轨迹、physical deck、training plan和point-model语义。PoC的仅root复用只对同一候选、相同其他环境纯输入有效；扩展到多条H/B时不能仍只按root缓存。

## 10. 必须保留的启发式失败反例

以下是数学反例/回归设计，不是最新版真实卡效果声明；真实fixture还需由已核验规则构造。

| 误用 | 反例 | 必须避免的错误结论 |
|---|---|---|
| 只按power保留前N张/队 | 高power但无适配技能；稍低power在主要音符窗口有强加分 | power预筛不是Live支配 |
| 均值代替稳定达标 | A有20%得0、80%得200，均值160；B恒150，均值150。目标150时A概率0.8，B概率1 | 冲分与稳达不可共享排序 |
| 给平均分套奖励 | score为0/100、权重1/3，均分75；80起奖励10。奖励均分为0，平均奖励为7.5 | event/奖励必须逐原子算 |
| 少量root训练即真实最优 | 示例root总把某物理槽放在高权技能位；另一组root选择别的槽 | finite-law最优可能过拟合示例root |
| 仅边际uniform消排列 | shuffle顺序均匀，但与后续skill值/lottery状态相关 | 需联合等变，而非边际计数 |
| 移除看起来不加分的snap行 | 该行概率检查消耗随机数，或life查询改缓存，改变后续效果 | inert须覆盖全部副作用 |
| 最大power snap匹配后才选order | 较低power配对把延长/转换放到更有价值的成员/触发位 | 留影、成员、placement联合选择 |
| 只做单卡局部替换 | 两张一起换满足leader条件/任务门槛，任一单换均下降 | 要有成组邻域或exact全域 |
| terminal life即稳过 | 轨迹中归零，随后模拟继续恢复成正值 | 需失败/继续路径，不可仅看终值 |
| 物理Top5去重即集合Top5 | 前五全是同组不同placement，去重只剩一组；第六至更远集合未搜索充分 | 展示identity与证明identity分开 |
| 目标平台按错误tie裁剪 | 达标概率相同但次目标/公开ID更优的队伍落在被丢分支 | 等值UB不能只按主要数值剪 |
| 低阶默认等级即识别事实 | 新卡技能/等级未知，被默认1或满级使结果翻转 | 记录假设/校对，不静默赋值 |
| 单次活动preview即资源效率 | 比较队伍位于不同消费档/计数上限/结果时间，或cost为0 | 需要动作与状态转移 |
| 启发式运行完即Exact | proposalLimit到达、连续无改进，但未覆盖技能型队伍 | 状态仍heuristic |

## 11. 已证明域与PoC证据如何使用

已发布基线材料：[旧搜索证明](https://github.com/empty-sekai/ournotes-deck/blob/f755c9c0138b0de841f432b8103a2ec02c9ce27d/docs/search.md)、[推荐契约](https://github.com/empty-sekai/ournotes-deck/blob/f755c9c0138b0de841f432b8103a2ec02c9ce27d/docs/recommendation-contract.md)、[范围说明](https://github.com/empty-sekai/ournotes-deck/blob/f755c9c0138b0de841f432b8103a2ec02c9ce27d/docs/recommendation-coverage.md)。本轮模型审计与当前门禁见[验证矩阵](model-validation.md)，未发布的PoC回归保留实验身份。

- 旧Power/Skip上界与canonicalTop-K有独立穷举和域证明材料，前提绑定当时模型/数据/非负无wrap域。
- 旧有限root物理oracle保留原生洗牌与共同随机状态；其Complete仅证明给定law、轨迹和支持域。
- 旧原生ARM64逐字段比较证明特定版本、配置与链路，不认证所有效果/根/最新热更。
- 新目标/summary/轮转及Skip平台测试是PoC级回归，不能替代新版原生证据或大池质量门禁。
- 一个大池CLI速度样本和WASM smoke不能认证手机p95、完整网页链路、概率模型现实有效性或首候选服务等级。

本文件不引用旧比较次数作为新版覆盖比例。native bit equality、same-source跨平台一致、search oracle一致和human probability calibration分别登记，不能合计为一个“准确率”。

## 12. 进入正式实现前的门禁

### G0：版本与规则冻结

完成V1及所有本次目标涉及的待核项；输出版本化rule/effect inventory、master/chart identity与支持域。新增未知效果/条件/动作必须有处理策略，不能漏列。确认一个目标的完整依赖后才允许该目标进入正式实现；其他目标保持明确待核。

### G1：Point/Trace 模型对照

使用同一Γ、raw/finished inputs、frame clocks和root，在原始客户端与唯一Rust evaluator逐字段比较score、life、combo、转换、技能状态、RNG draws、任务快照与排名结算。记录独立输入数、原始哈希和差分字段；zero difference只覆盖被测域。

至少覆盖不同FPS/非恒定dt、迟判回退、life条件/恢复/guard、概率checker和共同root、snap/member绑定、强制/清理判定、Network早到/迟到/批到、目标阈值附近与可能wrap边界。完整过谱目标在失败/续关链验证前不得开放。

### G2：独立搜索oracle

用小域独立枚举legal decisions、leader、snap injections、physical placements、训练变体/动作和joint atoms。复用已经核验的point evaluator可以验证搜索，但oracle不得复用生产Top-K、支配、class folding、matching或上界。

对每个声明solver family比较完整排序与identity，K=1/5/30/最大可行；包含固定/排除冲突、同角色变体、None snap、各种平局、全达标/全不达标平台、半途预算、零预算、分布signed/duplicates/大质量、mode与特殊零值回退。

### G3：上界与反证回归

对抽样/构造节点枚举其全部补全，断言UB不低于真实最大排名值；关闭各剪枝独立对拍。mutation控制应能抓住`<`误成`≤`、遗漏snap概率副作用、signed-root折叠、洗牌后reseeding、强行canonical非leader、power-only snap、错误资源/mean reward变换和浮点JSON重序列化。

每个新trait/等价class需要书面前提与反例测试。不以大量随机一致代替可采纳性证明。

### G4：大池质量与预算

固定最新版区域数据，区分真实确认玩家状态、匿名授权状态、全持有mock和合成对抗池。覆盖新手/中等/大池、不同角色重复度、life/概率/任务/event组合、K与所有目标。

能穷举的域报告objective regret、tie-aware Top-K和集合替代覆盖；概率报告百分点损失，CVaR/机会约束报告其具体效用差，不能混成一个“准确率”。不能穷举的大池比较当前队伍、power baseline、随机/局部、多来源候选、独立更长搜索及可用UB，最佳已知值只是下界。

规定不同root/joint-law敏感性，不反复调参使held-out变成训练集。Candidate须复算每个返回值；还要记录无候选率、完整候选数、来源/集合覆盖、partial舍弃、cache/memory峰值和budget overrun。

延迟在参考桌面及至少一档中端/低端移动浏览器分别测冷加载、热建池、首完整候选、迭代提升与总取消时延。正式门槛在测量计划中冻结，至少多次冷测及足够热重复才能报告经验p50/p95；三次CLI样本只作探针，不作为生产p95或默认算法依据。

### G5：WASM唯一数学与输入语义

浏览器唯一数学实现为原Rust核心编译WASM，JS只解析展示/调度。原始UTF-8输入保留大整数与f32 token；同源native仅作验证工具，不能成为另一套近似规则。对同一Γ逐项比较point输出、整首轨迹、候选ranking/identity、exact fractions与声明终止。

取消/分片/恢复不改变随机draw序、完整候选值或law；旧revision/版本响应不能恢复失效队伍。平台clock只决定预算，不参与模拟音乐/frame时钟。固定work-budget对拍与wall-budget性能测试分开，不能要求不同速度平台wall timeout下恰好访问相同候选数。

### G6：设计审阅与正式契约

模型审计、搜索证明及玩家目标分别独立审阅。先决定Stable的次目标、Physical与MemberSet输出、真实与假设law、训练域、错误/取消状态和支持模式，再定正式API/SDK；PoC旧JSON结构不自动约束新版正确契约。

过G0/G1/G2/G3后才能称本目标在已声明域内模型/Exact到位；过G4/G5/G6后才允许定正式快速推荐默认、WASM网页契约和端到端验收。源代码PoC保留原身份，不因文档规划或旧CI绿色升格。

## 13. 当前决策与下一项核实

当前保持实现冻结。先等待根代理的最新版身份与模型审计矩阵，把第2节逐项变成可复查结论。搜索侧优先确定三类问题：

1. 当前培养的Power/Skip：核单调域与完整公开tie，形成可复用Exact族。
2. 明确条件的普通/撃奏Live：固定joint law和外部输入，确定是否必须保留全部物理placement，以及能证明的live/snap上界。
3. 人类稳定性、资源效率与养成预算：先补路径/状态/成本模型，再进入候选与Exact设计，禁止借一个新目标名字先接页面。

这三个结论完成后才比较候选来源与深搜分配，拿小域oracle和大池质量门禁定策略。截图→结果链路应消费已冻结模型与策略，而非反过来用网页已经需要哪些按钮决定游戏模型。
