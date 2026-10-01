# 最新游戏建模：证据矩阵与版本冻结门禁

状态：2026-10-01 只读模型审计及验证设计。当前没有完成 JP 最新客户端的数值模型认证。正式 SDK、网页组卡和搜索优化实现应等待版本身份与模型语义门禁；已产生的 SDK / UI 实验保留为未验收 PoC，不以实验能编译或旧版本差分通过替代前置证据。

## 两个输入门禁的当前状态

| 门禁 | 当前状态 | 已核实的事实 | 现实缺口与解除条件 |
|---|---|---|---|
| G1：目标客户端、平台与运行时 patch 身份 | **PARTIAL：Android 1.0.4 / build 10053 APK 与 SO / metadata 已绑定；恢复、签名完整验证、patch 与语义尚待验证** | [来源绑定](latest-native-source-binding.json)核实 APKPure 的完整 `10053` 包：XAPK manifest 和 AndroidManifest 一致为 `com.bushiroad.sirius`、`1.0.4` / `10053`；APK 文件 SHA 与 manifest 一致，SO / metadata 与下表逐项匹配。[证书记录](latest-apk-certificates.json)读取三个 split 的 v2/v3 证书，SHA 一致为 `34fd32c2860f454dd320930f6ba0876ea8cc8e60a3d8320b3277aa761072508e`，尚未完成 APK 内容签名密码学验证。[Apple 官方读取](official-store-read.json)另证明日本 iOS 商店 `1.0.4`，App ID `6771716739`，发布日期 `2026-09-29T11:38:20Z`；两平台证据独立。 | 对已绑定的最新 ARM64 SO 恢复保护区并校验 CRC、metadata、注册关系和原生执行；完成内容签名验证或保持明确限制；冻结实际生效 IFix 集合/哈希/加载条件，或证明指定实例没有生效 patch。取得完整 APK 解除了“没有最新包”的身份阻断，但未解除最新规则认证门禁。 |
| G2：当前 JP master / resource 的新鲜度与一致快照 | **UNAVAILABLE：当前版本未重新确认；最后可信快照可用于离线研究** | 本轮 Windows 与 CNB 的匿名 `MasterdataService/Version` 查询均返回 `UNAVAILABLE`；[读取记录](latest-game-read.json)不是有效 Version 响应。最后可信 2026-09-30 快照来自 `runtime-data/provenance.json`，版本见下表。 | 成功取得官方 Version 响应及其时间/来源，下载或核验对应 master/resource manifest 和所需文件哈希。将规则表、谱面、音频长度、活动上下文绑定同一个快照。未解除前不得把 `1.0.0.300` 描述为“2026-10-01 当前最新版”。 |

两个门禁独立：读取到新 master 不会补齐客户端机器码证据；取得新 APK 也不会自动证明使用的是它在当前区服实际加载的 master、资源和 patch。**老 native + 新 master 只是一种明确的混合输入实验，不能代替最新客户端建模。**

本轮原生恢复进展：最新保护区的三个 CRC 已逐项匹配，错误候选均失败；loader 的 275 个轮转与 1,096 个编码符号，已在最新 ARM64 对应函数中执行并与恢复结果比较一致。metadata 已校验 31 个表区和全部 47,081 个 string offsets 的单调性及边界，并修正恢复工具在头部 XOR 终点的错误。当前正在执行首次完整运行时启动验证。上述计数属于恢复与结构检查，**不是新增计分/技能原生用例**；完整启动、对象布局、激活 patch 及游戏语义仍须独立通过。

最后可信 JP 快照（来源为本轮 `runtime.tar` 内的 `runtime-data/provenance.json`，不是本轮成功的在线 Version 读取）：

| 输入 | 冻结值 |
|---|---|
| region | `jp` |
| masterVersion | `1.0.0.300/52355a9de56a475f691b10ef58acba58` |
| resourceVersion | `1.0.0.300` |
| resourceHash | `223330d93bcef18aa092c73dbe3ac64d` |
| officialCatalogSha256 | `409e188690ab1147fbdfbe69b15729d8f86e76f815388c06fef9a33072f0975e` |
| masterManifestSha256 | `f4534fe8bf340b7a9bd99eb9b43ab384e9e3895a7e1eb3113cbb371e65780735` |

## 已有原生基线究竟是什么

[Deck 原生来源清单](https://github.com/empty-sekai/ournotes-deck/blob/f755c9c0138b0de841f432b8103a2ec02c9ce27d/docs/validation/native-source-2026-09-30.json)记录：客户端 Android ARM64 **1.0.1-25**，区服 **TW**，master `0b21c9f4a3911370d5f981fb894c7544`，原始恢复 ELF SHA-256 `5a79dd5d9c479ed5a636193394f040f21a1f7b070d0869095e1af63b3f84ef88`。ELF、重定位内存映像、初始化只读快照和 Rust 源码的哈希是不同身份，不能互换。

[原生验证报告](https://github.com/empty-sekai/ournotes-deck/blob/f755c9c0138b0de841f432b8103a2ec02c9ce27d/docs/native-validation.md)与其独立清单记录了音符/综合力/技能/逐帧普通与撃奏、排名、部分 PlayingState、特定 Touch 输入等对照。它们支持所声明输入和观察阶段上的精确一致，不能把旧 TW 验证日期更新成新 JP 认证日期。

[共同 root 原生链](https://github.com/empty-sekai/ournotes-deck/blob/f755c9c0138b0de841f432b8103a2ec02c9ce27d/docs/recommendation-coverage.md)实际新增两组各 7,500 帧，总 15,000 原生帧、506,414 基线字段比较，仍是 `1.0.1-25` + TW master。R3 的两份显式数字步长请求复用了这些捕获并比较 18 个输出字段，新增原生帧为 0；其 144 个生产候选中，新增完整原生区分用例证明的是指定卡组，其余候选属于模型计算。

最新 JP 文件已与完整 Android `1.0.4` / `10053` 包绑定。以下 `_tmp/jp-apk` 副本的 hash 与 APK 内条目一致，可作为只读恢复输入；其原生语义尚未认证：

| 文件 | 大小 | SHA-256 | 目前能证明什么 |
|---|---:|---|---|
| `_tmp/jp-apk/lib/arm64-v8a/libil2cpp.so` | 207,718,136 B | `b1600689ee83c435b4a3eaa1ef0709b1ed27783eeda90dace814515a54e0a7ce` | 匹配 `split_config.arm64_v8a.apk` 条目；身份区别于旧基线。整库 hash 不提供算分语义差异证明。 |
| `_tmp/jp-apk/assets/bin/Data/Managed/Metadata/global-metadata.dat` | 28,386,492 B | `bbf82e20b16ac39ad14c6d3547250efb84daa6ae2c754e46ae9bae5270f9386c` | 匹配 `base.apk` 条目；ACE 原始头标记 `0x12724394`，须按最新输入恢复及结构/运行时核实。 |
| `split_config.arm64_v8a.apk!/lib/arm64-v8a/libanort.so` | 1,883,272 B | `47a9ceacb4850b311972ffebdde37905a3f7baa5c5588f2be7b2e1d2e9333b74` | 最新保护 loader；恢复需从本文件重新定位配置/函数，旧版脚本的 VA、偏移及 key 不能直接复用。 |

## 验证分母与证据层次

每行必须先定义分母，再报告 covered / not_run / incomplete / mismatch。没有最新快照时，最新规则分母记为 **TBD after G1/G2**，不填一个根据旧表猜出的“100%”。至少维护以下彼此独立的分母：

- **规则分母**：目标版本实际可达的 mode/action、effect/condition/cumulative/target 类型、技能等级与数据形状、判定类型和资源格式。未在当前 JP master 出现的 Arena 等分支只保留 synthetic 身份，不能计入线上支持覆盖。
- **分支分母**：关键函数正常/边界/异常路径，触发与不触发、释放与不释放、限次、池耗尽、生命归零、早/迟输入、取整/溢出与回退路径。列出每个缺失分支及其最小区分输入。
- **交互分母**：按真实可持有成员/留影建立机制交互类别；逐卡单测不等于组合条件、持续效果、判定转换和随机调用顺序全覆盖。代表性用例必须记录选取理由，不能把抽样称为枚举全部卡组。
- **动态实验分母**：独立输入 trace、原生执行帧、原生函数调用、观察字段数分别计数。复跑、typed 恢复、负控制和 WASM 对拍复用同一 capture 时不增加原生样本数。
- **搜索分母**：合法物理队伍/配对/槽位域、根质量、目标和约束；独立穷举的候选数与点模型 native 证明分开。算法能找到同一模型的最优解，不证明该模型就是最新游戏。

验收状态建议使用 `verified-in-declared-domain`，附完整版本与覆盖范围；“全部完美还原”不能由大量零差异字段数推出。

## 模型验证矩阵

| 机制 | 旧版本已有证据与不能扩大的结论 | 最新版本必须核实的分母 / 区分用例 | 严格通过条件 |
|---|---|---|---|
| 综合力、培养、场景加成 | 旧基线数值原语与槽位证据；共同 root 新链的综合力 75,038 是注入控制量，未执行完整玩家 profile 合力构造器。 | 最新培养状态/等级/特训/卡阶/技能、角色 Rank/道具/VIP/回忆；歌曲属性/标签、队长、留影连携、Challenge/Arena/活动分支。新增字段、枚举、表列与合法状态边界逐项列出。 | 新版本对应函数/ABI/查表路径可定位；对相同合法输入逐项整数或 float32 位模式一致；模型默认值、真实玩家输入和缺失信息明确区分。 |
| Skip 与音符计分 | 旧 native 单元、评级与 skip 计算；不自动证明新模式仍允许 Skip。 | 当前各 mode/action 资格、分数类型/operate type 映射，连击/生命/幸运因子，取整、40 ms 帧边界、非计分 Pass 门控、正/负/溢出边界。 | 同输入执行最新 native 与 Rust，整数完全相等、声明 f32 字段 bit-equal；不通过容差掩盖分歧，Unknown/Unsupported 与原生异常区分记录。 |
| 整场普通 Live 与回退重算 | 旧混判 × 30/60/120 fps、长谱与同帧多判定证据；仅覆盖记录的卡/谱/输入。 | 真实早/迟判定、同帧顺序、rewind、技能触发/结束同帧，音频/技能长度与计分表长度的独立来源，Pass 回调、显示缓存与 settled score。 | 不移动帧、不删除失败字段，逐帧身份/阶段/分数/生命/连击/池与因子一致；额外复核终分相同但中途状态不同的负控制。 |
| 普通 / 留影 / 撃奏技能与条件 | 旧真实技能和 4011 定向成功分支；大量字段不等于所有真实卡交互或重复触发池耗尽已证。 | 最新 master 中所有使用的 effect/condition/cumulative/target/level 形成分母；AND/OR、选择门槛与持续状态、扩时/重叠/释放/限次/五池耗尽，多个技能改变同一状态的先后顺序。 | 最新代码可达分支与实际 master 形状逐项映射；核心被测逻辑不可 HLE 代替；触发结果、内部状态与效果应用三层各自通过。未知种类/组合不得默认成支持。 |
| 撃奏与排名阶段 | 旧 Combo/Just/Luck、Solo 时间查询与 Network 冻结快照、部分 packet 队列证据。 | 三种 mission 的 Start/End/Delay/Complete/Finish；Just 开关恢复、幸运/连击/累计 Just、排名前后两种 score、同帧区间完成、迟到/批量确认、每帧单结算。旧“第四 fever 开始异常”必须在目标版本重新确认。 | 最新逐阶段 native 对照；固定 Solo 名次、外部确认与真实对手模式分别标识。外部排名时间线只能证明条件结果，不能称为对手预测。 |
| 随机与成员/留影配对 | 旧 common-root 构造器、4 次 shuffle 与 Skill/Luck 子流、4011 f32 值及负控制；真实 TickCount 人口分布未知。 | 最新根来源、派生种子、洗牌算法、完整 post-shuffle 状态、真实留影跟随、更多 signed root/生命条件/概率与 Luck 交互；逐次返回值与调用顺序。 | 构造器→配对→条件→幸运→结算共享同一声明 root 的 native 对照通过；不得洗牌后重置或替换 root。有限根结果继续注明条件分布，不能据一个成功分支估计总体概率。 |
| 原始输入、窗口与 Assist | 旧仅一份 1,239 帧/50 事件 Touch 私有适配样本；生产完成判定流不等于完整设备触控。 | 最新投影/输入时钟、Flick/Trace/长条、同帧竞争、动态窗口/Assist、末尾/Force、判定 type/timing/原始 diff 与转换后结果。 | 输入同源、保留原始顺序/字段/阶段；设备资源适配与核心算法分别列明。完成判定流和物理 Touch 分两份契约与覆盖报告。 |
| 失败、继续、重试、退出 | 旧生命归零后的离线继续步进只约束计分状态。`scoreAndLifeAtLeast` 是结算分数与血量联合条件，不是通关概率。 | 各正式 mode 的零生命状态迁移、同帧 damage→heal/guard、失败暂停、继续的成本/恢复/扣分、重试的 RNG/池/缓存重置、退出/断线与结算门控。 | 真实 PlayingState / 生命周期 trace 完整；明确什么时候演出停止、是否登记成绩/奖励。仅比较 finalLife 不足，未证生命周期不得输出“稳过谱”。 |
| 活动、成绩登记、客户端奖励 | 旧客户端 preview 和部分模式结算证据；不能证明服务器实际奖励选择/发放或当前榜单规则。 | 当前活动时间、评级、计数、消耗倍率、失败门控、可登记的歌曲/难度/模式与最高记录规则；当期分数排名与 pt 收集分开。 | 客户端计算按最新冻结输入与阶段差分通过；服务器 / 官方规则证据单独认证。无服务端证据时维持 `client-preview` / `conditional` 标签。 |
| 搜索合法域、目标与完整性 | 现有独立穷举证明的是声明点模型上的 Top-K；candidate/cap 结果的点值精确而排名未证。 | 最新规则认证后的合法队伍/队长/留影/槽位与资格域，score/threshold/cap/joint-life 等目标、tie 顺序、共同根质量、未知字段、超时 partial、剪枝边界。 | 独立枚举和排序不复用剪枝/Top-K；结果、槽位、配对和精确 payoff 一致；剪枝有可采纳证明，等值 tie 不误剪；部分候选丢弃，终止/optimality 保真。搜索速度门禁在模型和策略冻结之后。 |

## 新旧版本迁移怎样验

建立三个互不替代的版本运行格：旧 native + 旧 TW 输入是已有基线；**新 native + 新 JP 输入才是目标认证格**；旧 native + 新 JP 输入仅用于定位数据敏感性并标为混合实验。不能从第三格推导第二格的等价结论。

先对 manifest 与规则数据建立稳定 ID、字段、表 schema、枚举和引用差异清单，分类为新增/删除/数值变化/重命名/迁移未知。只按 ID 相同或表 hash 相同不能证明语义或账号数据可跨区服迁移。再由新 metadata/ABI/注册关系定位关键函数；旧 VA 和 TypeDefIndex 不能直接当新版本地址。保留相同、已变化和未解析的函数清单，关键路径的异常与间接调用也要检查。

对每项差异做最小区分输入，在旧、新 native 和对应 Rust 实现下记录结果；预期发生变化的案例不要求“旧新终分相同”，而要求新模型解释并精确复现新行为。新增 skill/mission/生命周期分支有自己的 native 实验；未变分支只有在实现、调用约定、常量/查表、patch 选择与拼接顺序等关键依赖都匹配时才能继承证明。

用户卡池迁移只保留已验证映射的身份与培养，不能把新上限当成玩家已经升级。模型/图库/master identity 改变时，旧识别来源与校对记录继续保留，缓存的 prepared pool / simulation / recommendation 失效；未映射卡、变化中的枚举和缺失的培养字段要求明确校对。相同 UTF-8 大整数/数字 token、重复字段处理、未知字段和缺失值契约另做兼容回归，不能通过 JS Number 往返或静默默认掩盖变化。

## 输入冻结与正式实现放行

每个受测版本记录 `region`、平台、appVersion/versionCode、应用签名/取得来源、APK/base/split SHA、SO/metadata SHA、恢复/重定位过程与映像 SHA、实际生效 patch 清单/哈希、master/resource Version 原始响应与时间、manifest SHA、相关表/谱面/BGM SHA。每次对照另记录 Rust 源快照/commit/dirty 状态、编译产物 SHA、工具版本、输入 trace/root/时钟、观察字段及阶段、HLE 清单和原始输出。

放行顺序：

1. G1/G2 通过，并发布一个明确、可重查的目标版本快照；若主动选择研究旧版，则单独命名旧版研究，不宣称当前版本。
2. 最新关键规则与状态模型认证，覆盖分母、差异和未支持范围可审阅；缺轨迹为 `not_run`、缺字段为 `incomplete`、真实不相等为 `mismatch`，任何一种都不写成通过。
3. 确定玩家目标、输入与合法域，冻结搜索策略、可采纳上界与结束条件；小池独立 oracle 和必要差分通过。
4. 才开始正式浏览器 SDK / Worker / UI 接入；原生与 WASM 的同源对拍证明运行端移植，不新增最新游戏原生证明。性能与首组候选时限是另一个验收项。

当前待解除的是**最新已绑定 APK 的原生恢复、规则与运行时 patch 认证，以及当前 master 新鲜度核验**。已授权在 CNB 进行最新原生恢复、最小执行和大规模差分；每阶段通过自身门禁后才扩大实验。未验收 PoC 和旧版实测保留各自身份，不推进 SDK 安装、编译或新的浏览器组卡验收。
