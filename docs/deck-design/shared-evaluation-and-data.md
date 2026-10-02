# 统一求值与最新日服数据契约

状态：数据调查与模型 / 搜索前置方案；正式页面实现继续冻结。

## 当前实际调查状态

- 完整日服 APK 对应 1.0.4、versionCode 10053，原生条目已按内容哈希绑定，见[来源记录](latest-native-source-binding.json)。是否可执行为 latest-native oracle 由模型线检查，不能仅凭文件名通过原生 gate。
- 当前 nnnotes 源码真实支持 JP provider；本次研究配置尚需补齐日服配置，不能把配置缺项解释为“不支持日服”。
- 按当前 `nnnotes.jp.Session.observe` 实际匿名调用 Version 返回 `UNAVAILABLE`，没有取得本次有效版本。错误类别已匿名记录；不是借用旧文件标成最新，也不是模型结果。
- 2026-09-30 保存的日服数据是 master `1.0.0.300/52355a9de56a475f691b10ef58acba58`、资源版本 `1.0.0.300`。在新的 Version / manifest 确認前，它只能标为“已保存快照”。

正确链路是 `Config(provider=jp) → Session.observe → Version body + response metadata → 同一快照的 master / catalog / asset`。实际 request metadata 是 `x-platform=android`、`x-client-version`，不是自行猜测的 `x-client-platform`。CDN credential 仅保留在 Session 内存，配置地址保留私有目录，公开清单只含版本、哈希与状态。

## 一个引擎，三个遍历对象

```text
SharedEvaluationContext
  version / native-model identity
  resolved scenario + chart + duration clocks
  physicalDeck + paired Snaps OR validated skill/effect profile
  player / progression / targets
  play + root law + external multiplayer/event conditions
               ↓
same Rust whole-live evaluator
               ↓
terminal atoms + metrics + scope + completion

DeckSearch:  枚举合法编成 / leader / paired Snaps
SongRanking: 枚举已选范围的谱面 / 已明确技能 profile
FixedDeck:   只评估用户给定物理编成
```

以上三者的不同是输入遍历与结果排序，不是另写歌曲分数公式。共享 context 要进入同一个整数 / binary32 / 帧事件与随机流实现；每次换歌必须重新 resolve 歌曲属性 / tag、难度、撃奏任务、队伍综合力和适用条件，不能把一首歌的 power 固定套到全部歌。

结果必须区分三个 scope：

1. **固定卡组排行**：当前培养、成员与 paired Snap 已确定；按各歌实际加成逐首求值。
2. **标准技能 profile 排行**：用户选择可验证的标准 profile，展示在这些条件下的歌曲特点，不表示实际账号持有或实战表现。
3. **实际持有搜索排行**：卡池 / 培养 / 玩家状态参与每首歌的组卡搜索；快速候选与已证明结果分开，不把 profile 排行当成账号最优。

原生技能洗牌和随机效果属于求值输入，不能作为玩家可控制的“最佳技能顺序”。多个根 / 判定流的权重来源、实际时钟与多人条件必须随排行输出，缓存 key 也必须包含它们。

标准 profile 可以声明固定的测量综合力，但必须将其标为 `standardMeasurement`，与真实卡组按歌曲重新算出的 `computedDeck` 分开。这是共享 evaluator 的显式测量输入，不是网页另乘一个技能系数。任何依赖角色、乐队、卡型或配对的 Snap，仍需完整声明对应成员 context；效果选项由版本化的支持 profile 生成，不能让未验证的自由组合进入排行。选择实际卡组时则使用该卡组的真实培养和条件。

歌曲 meta 的“需要综合力”与“分数”也要区分。对任意 Snap profile，不能直接以目标分除以线性 score rate 得到最低综合力；只在该目标和参数域的单调性已经证明时，使用同一 evaluator 求门槛。尚未证明单调或不在线性域的 profile，可以展示明确测量综合力下的分数结果，最低综合力指标保持 unsupported。

## 导出 / 消费核对矩阵

| 对象 | 当前 exporter / consumer 已提供 | 进入统一 context 还需要确认 | 验证与失败行为 |
|---|---|---|---|
| 快照身份 | nnnotes provenance 含 region、APK versionName/code、master version / 表哈希、catalog SHA、模型 commit | 本次有效 Version 观察、同一 manifest / source sidecar、latest-native 身份与支持域；decoded JSON 内容哈希与原始 master 文件哈希分开 | 版本或实际字节不匹配拒绝混用；只保存旧快照时不标最新 |
| 成员 / 留影 ID 与培养组 | `deckdata.TABLES` 包含成员、SupportCard、level / rank / awake 组、技能 ID | 每个 ID 的合法等级与卡阶对应行，rank 派生 Snap 普通 / 撃奏技能等级 | 未知身份和断链行报错；不以 max-power Snap 配对替代 Live 技能配对 |
| 歌曲属性 / tag / 难度 | full data 包含 MasterLiveMusic、Score IDs；song meta 有 musicType、bestMusicTagIds 与 easy/normal/hard/expert | 标准曲 / Arena / Challenge / Mission / Battle 对应的 resolved scenario；特殊行 ID 与 base song ID 分开 | score ID 必须属于选定 resolved song，不能只靠 difficulty 名称 join |
| 谱面与 note enumeration | chart TextAsset SHA 与 runtime id/op/judgementType/timeMs；原客户端枚举顺序保留 | converter / native 版本、raw fields 对求值的依赖及合法 enum；完整 play 覆盖全部评分 note / event | ID 重复、枚举缺口、来源 chart bytes 改变均拒绝；不能按时间重排后冒充原枚举 |
| 技能事件与 fever | chart skillEvents/timeMs、fever start/end、song 撃奏 missions | native 时钟、触发 / release、range ordinal、Finish8 与 multiplayer arrival/application | 逐事件 / range 对拍；超过支持 range、未知场景要 explicit unsupported |
| BGM 与 score 生命周期长度 | music meta 有 ACB cue length / waveform samples/rate/duration；chart `musicLengthMs` 当前是 last note + tail 派生值 | 原生到底使用 BGM 长度、score length、music length 的哪个时钟；liveFinished / deltaTime 语义；不可把 chart fallback 标成实测 BGM | 同时记录 raw BGM facts、chart-derived length、实际选择与来源；缺值保留 null；长度边界列入 native 对照 |
| 演出技能原始行 | LiveSkill / Effect、target、condition sets、cumulative、release、limit 与 reset 等 full master 表 | 引擎是否覆盖每种存在的 effect / trigger / condition / phase / target；profile 依赖闭包 | 分母是实际 master 语义签名和行，不是仅列已支持 effect 种类；缺分支单独记录 |
| Snap 普通与撃奏作用 | full TABLES 已包含 supportSkill01/02、GekisouSupport01/02 与 effect 表，以及 rank 对应等级 | 关联成员 / band / card type / skill category / mission，普通 vs 撃奏触发与执行时机；paired Snap 跟随 member 洗牌 | 先分别对拍纯 power 匹配、Live 成对作用及全场组合，再测搜索；不能把 power matching oracle 当 Live 配对 oracle |
| 曲目技能权重 | 当前 `chart-stats/2` kinds / seeds / offSeeds / rangeWeights，有误差 bound 和 check-deck 校验 | 哪些 effect/profile 可合法线性分解、在哪个 play / scenario / target 域有效；非线性 Snap profile 不适用 | 无 proof scope 或依赖不符合时走 whole-live；不能给 Snap 随手加一个 coefficient |
| 文字与展示 meta | nnnotes music-data 有五语言 title / credits / band / character / tag；MoeNotes 消费 song/chart facts | 内容语言 fallback、meta 的 source snapshot 与求值 snapshot；前端不能把未校验 profile 的名字当求值定义 | VM 只负责显示，分数与排序来自共享 evaluator。现有 card components 复用不构成评分正确性 gate |

## Validated SnapEffectProfile 的最小契约

它必须是原始 master 行与依赖的可核查视图，不能只是 `{snapId, coefficient}`。

- identity：region、client / native-model、master、catalog / chart bytes、engine commit；profile 自身实际字节哈希。
- origin：实际 SupportCard ID / rank 或明确标准 profile；区分普通 skill 01/02 和撃奏 support 01/02，不自动复制最大等级。
- effect 行：skill ID、level、effect type / phase、值 / max 值、activationTime、trigger / execution timing、target IDs、condition / release groups、cumulative ID、effect / execute limits 与 reset groups。
- dependency closure：linked character / band / card type / song tag / judgement / mission / member skill categories，condition sets 与 leaf condition 行，相关 settings。
- coverage：原始行数与语义签名数、引擎支持 / 未覆盖列表、原生 oracle 验证版本及 case IDs；不存在验证的分支不写 validated。
- applicability：普通 / 撃奏、resolved scenario、play / frame law、额外 peer/event 输入要求；是否可线性处理以及对应证明 / bound。

判定转换、回血、护盾、combo、累计 / 限次 / reset、扩时、随机 trigger 和共享随机流可能改变后续状态。这些必须 whole-live 重新运行。只有经过验证、满足完整依赖的线性域，才可复用权重作为透明快路；快路结果仍与共享 evaluator 对拍，不能形成独立公式分支。

## 当前消费端的已发现限制（证据先于修复）

- `MoeNotes/src/lib/chart-data/ranking.ts` 明确以全队、5 秒、无 target / condition / limits 的 plain 2000 score-up 为模型域；`plainKind` 也只选择该种类。它目前不是可任意选择 Snap / 普通 / 撃奏 profile 的动态排行求值器。
- 同文件对 sampled seed means、uniform permutations 和线性 time-efficiency 建模，`scenario.ts` 的 Great / Just 比例处理也是近似。不能将这些说明和公式直接推广到实际完整技能 profile、共同随机流或真人通过率。
- `chart-data/client.ts` 当前只检查 object、songs 数组及已出现的 format；`MusicData` provenance types 也只保留部分字段。正式动态 meta 需要实际 snapshot / profile / engine 身份检查。这是契约缺口；本轮尚不绕过模型 gate 修改正式页面。
- `nnnotes.deckdata.TABLES` 原始导出已经含 Snap 所需主要 master 表；“full data 没有 Snap effects”不成立。缺的是 validated profile / coverage / applicability 与统一全场求值接口，而不是给网页造简化系数。
- `musicdata.chart_deck` 已检查 music ID、difficulty、level、note count、last note、derived length、skills、fevers、rank bonus 与 check bounds；这证明该导出检查域，并不证明 actual audio / lifecycle clock、所有 Snap 条件及最新客户端已经覆盖。

## 原生批次输入与覆盖分母

新版本的批次只在 **有效 Version + manifest / catalog 身份 + latest-native 可执行 oracle** 三个 gate 通过后配置为 current。之前可以准备清单、依赖闭包与只读校验器，但不得把 9/30 数据或旧中文 oracle 的 pass 重标为最新日服 pass。

| 批次 | 覆盖分母 | 输入构造 | 至少保留的反例 / 未覆盖分支 |
|---|---|---|---|
| D0 快照 / 导出一致性 | 所有实际歌曲、Score ID、chart SHA、原始表和引用边 | manifest→decoded→full export→Rust loader；原始 f32 token 不经 JS roundtrip | 缺表 / 缺列 / enum、跨版本 ID、缺 sidecar、derived vs real duration、表哈希与 decoded 内容不等价 |
| D1 全卡与培养 / power | 每张成员 / SupportCard、每个合法培养组值、歌曲属性与 tag 组合 | 最低 / 合法上限 / 临界相邻值；角色 / band / link 独立改变 | 只验证满级、最大P Snap、缺 tag / character / band 引用，无法表达的合法组值 |
| D2 Snap 普通效果 | 每个实际 support skill 01/02 的 level / effect 行及语义签名 | 同一 member 单独 paired / unpaired，target 命中 / 不命中、condition 真 / 假，普通 live | phase、release、cumulative、执行限次 / reset、边界 duration、转换 / life / combo / 扩时 / 随机等逐项分开 |
| D3 Snap 撃奏效果 | 每个 GekisouSupport01/02、rank level、mission 与 exec timing 组合 | range 前 / 中 / 后、Solo / 明确 multiplayer、Just / luck / combo 条件 | 忽略共同 Skill/Luck/Shuffle 流、跨 range 冻结快照、条件联动、network arrival 不等于应用帧 |
| D4 歌曲全场 | 全 Score ID × 实际可用场景；按依赖缩减仅须有证明 | AP / 明确错误流、时钟边界、实际配对 deck/profile；BGM / score lengths 原样声明 | 不可玩 >3 fever / 当前空 Arena、完整流遗漏、错误 stream 的活跃条件、patch / region 等价未证 |
| D5 组合与搜索 | 能改变排名的真实 member / Snap / profile 案例，以及候选 vs exhaustive 域 | 高P低收益 vs 低P高收益、不同 profile 排歌、同行配对 / 非leader物理槽交换 | 用单件 effect pass 代替组合、用power matching代替Live pairing、partial候选进入Top-K、快速候选被标最优 |

每条 case 保存：快照与 oracle 身份、真实 master 引用、支路标签、全部输入、原生与共享引擎结果、bitwise / integer 比较方式、耗时和退出状态。失败、unsupported、未枚举、不可执行和版本 gate 未通过分别计数。分母和 pass 数绑定同一份输入清单，不能累加异版本或重复语义样本制造覆盖率。

## 依据

本轮已只读核查 nnnotes `src/nnnotes/{jp.py,gameapi.py,deckdata.py,musicdata.py}` 与 `docs/music-data.md`，MoeNotes `src/lib/chart-data/{ranking.ts,scenario.ts,types.ts,client.ts}`、`src/lib/music/data.ts`。尚未观察到本次成功的匿名最新 Version；也尚未将现有歌曲权重模型扩展为 Snap 全场模型。所有实现与最新对照必须在前述 gate 后继续。
