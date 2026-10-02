# 微操：技能时间与加成边界的原生证明

状态：2026-10-02，Draft。范围为 JP 1.0.4 / 10053 原生基础代码。承接 [T1/T2 pilot](microtiming-t1t2-pilot.md)，没有修改公共核心，也不包含游戏 payload。19 个动态用例、14,206 帧通过；另核验 20 个完整原生函数共 1,976 条指令。原始输入、流、源码及 SHA 清单已取回校验。

## 结论与适用范围

对起止时间固定的普通加分因子，音符是否吃加成由 **谱面名义时间是否处于 `[startMs, endMs)`** 决定。触控时间负责判定，不负责移动计分 command。因此，同判定地提前或延后，跨过因子起止点，不能改变加成归属；这个机制的净收益为零。

计分按 `ceil((float)ms / 40f)` 分桶，但桶内仍按精确 `timeMs` 排序。不能把两个时间落在同一桶理解为同处技能区间。旧文档的 floor 公式来自 C 反编译遗漏舍入语义；1.0.1 和 1.0.4 机器码都使用向上舍入，属于解释更正，并非版本行为变化。

以下证据分开覆盖：E1 原生谱面技能事件生成；E2 原生加分因子的计分机制；E3 两条链路及桶内合并的机器码。E2 的因子由 harness 调用真实 API 加入，属于机制隔离，不是玩家可执行操作，也不是完整 NativeSkillContext。

## E1：技能事件时间

从真实 `LiveMusicScore.get_SkillEventList` 读取事件，前两项为 `(0,11764)`、`(1,28235)`。逐帧调用原 `LiveExecutorFrameResult.GetCurrentFrameExecuteLiveSkillEventList`（`0x54F23B8`）观察结果。

返回值通过原生 `runtime_invoke` 装箱，再用原 `il2cpp_object_unbox` 读取。运行时字段校验确认 Span 的 boxed `_pointer@16`、`_length@24`，以及 `SkillExecuteEvent` 的 boxed `<Index>k__BackingField@16`、`<TimeMs>k__BackingField@20`；每项有效载荷为 8 字节。没有把值类型返回寄存器当对象指针。

对照包括：不触控；前八个 tap 偏移触控，并在每个技能事件前后 1 ms 各安排一个触点；相同输入换成 8/33/16/17/31/9 ms 变步长和不同 realtime 基点。只比较 `(index,timeMs)` 的原字，不比较进程内地址。原始帧流同时保留当帧输入单元。

| 用例 | 返回事件时间 | 观察到事件的帧时间 | 事件帧活动输入单元 |
|---|---|---|---|
| e1a 不触控 | 11764 / 28235 | 11776 / 28240 | 0 / 0 |
| e1b 偏移触控 | 11764 / 28235 | 11776 / 28240 | 2 / 2 |
| e1c 变帧率、相同触控 | 11764 / 28235 | 11783 / 28263 | 2 / 2 |

三组均只返回这两项事件，事件有效载荷原字完全相同。帧率改变了报告帧，没有改变技能时间。

## E2：固定因子与触控解耦

调用原 `AddNoteScoreUpFactor(ownerId,timeMs,1.0f,false)`（`0x54F9818`），保留原返回 factor ID，再调用原 `DisableNoteScoreUpFactor(timeMs,id,false)`（`0x54F98FC`）。调用安排在到达声明时间的第一帧，并有 Update 前后相位对照。同判定对照组的八个 tap 的原始和转换后判定都核对为 Perfect。

| 音符名义时间 | 因子区间 | 两种触控时间 | 原生最终单音符分数 |
|---|---|---|---|
| 3529 | `[3540,3600)` | 3509 / 3549，跨起点且与起点同桶 | 796 / 796 |
| 4705 | `[4720,4800)` | 4685 / 4725，跨起点且与起点同桶 | 796 / 796 |
| 5882 | `[5860,5910)` | 5862 / 5842，触控由区间内移到区间外 | 1593 / 1593 |
| 7058 | `[7000,7040)` | 7038 / 7018，触控在区间内、名义时间在外 | 796 / 796 |

无因子基线为 `796 × 8 = 6368`。同时启用表中四个区间后，仅 5882 ms 的音符受益，总分 7165；跨边界移动保持这个结果。1.0f 加分因子使正控制从 796 到 1593，差值并非恰好 796，是最终整数截断的结果，不能把已截断单音符分数再次乘二作为 oracle。

验证读取最终原生 command 的 `_addedScore`，不以判定当帧的临时累计分代替回溯完成后的结果。相同因子区间、同判定的触控/帧率/相位配对要求 command 原始字段字节、桶号和桶内顺序全部相同。

边界组另外覆盖起点 4719/4720/4721、终点 5919/5920/5921、音符名义时间两侧 ±1 ms，以及精确相等时的提前/延后触控。逐案例实测结果、SHA 和失败尝试保存在 [机器可读证据](microtiming-skill-window-evidence.json)。

精确边界实测：名义 4705 ms 的音符，因子分别在 4704/4705/4706 ms 开始，得分为 **1593/1593/796**；名义 5882 ms 的音符，因子分别在 5881/5882/5883 ms 结束，得分为 **796/796/1593**。把恰好等于边界的两个音符从提前 20 ms 改为延后 20 ms，最终 command 原字仍完全相同。

`e2p` 专门验证牺牲 Perfect：名义 3529 ms 的音符迟按 51 ms，在 3580 ms 触控，已经进入 `[3540,3600)`，但 command 时间仍是 3529。原生给出 Great、637 分，没有技能加成；与迟按 20 ms 的 Perfect 对照相比，总分 **7165 → 7006，净损失 159**。

首次 E1 探针因使用属性名 `Index` 查询实际 backing field 而失败，随后改为元数据中的完整字段名。失败目录保留，不算成功样本；没有修改原生返回值绕过失败。

## E3：机器码数据流

- `LiveScoreController.AddNoteScore`（`0x5513AD4`）：从 note result 取得 `INote`，再经 `IReadOnlyMusicScorePosition` 槽 4 读取名义毫秒；该值流入原 `LiveNoteScoreCommand`。这条时间链没有取 judgement time 或帧时间。
- `SkillEventUpdater.Update`（`0x62209CC`）：保留 this 和 position，入口 x2 没有被保存或读取；后面的 x2 都是接口派发或回调重新赋值。比较 frame position 与事件 position，通过 `_executed` 保证单次回调，回调携带事件时间。
- `ScoreCalculationUtility.GetFrame`（`0x550F308`）：负数返回 0；非负时间转 binary32、除 40，`frintp` / `fcvtps` 向上舍入。
- `LiveScoreCalculator.ExecuteCommand`（`0x55123E0`）：同桶 factor/note 分别排序，再逐项合并。`0x55126F8` 取 factor time，`0x551271C` 取 note time；`cmp` 后只有 factor time **大于** note time 才先计 note，否则先应用 factor。开始时间相等时先生效，停止时间相等时先失效，得到 `[start,end)`。

机器码范围由 ELF `.eh_frame` 的函数范围确定，按 ELF VA 映射字节并计算 SHA；完整反汇编与原字保留在私有归档。公开证据仅列来源身份、函数范围和哈希。

## 与核心及后续工作的关系

现有 `deck-draft-cnb` 的 `live/score.rs::get_frame` 已是 ceil，`live/full/scorecalc.rs` 已按精确 time 排序且 factor 同时刻先执行，与本次原生证据一致。没有由这次更正推出核心分数 bug，也未改公共核心。

本结论不等于 T1–T6 全部完成。还需验证设备投影、flick/hold/slide、完整 NativeSkillContext、条件触发/解除、实际 RNG 消费及统一 evaluator。Just 和条件技能可能有真实微操收益；搜索应为“移动进固定技能窗”返回已证实的零收益，把其它路径单独验证。
