# 微操 T1/T2 首批实验：说明与结果

状态：2026-10-02，Draft。承接[协作者任务书](collaborator-microtiming-scope.md)的“首批可领取工作”。机器可读清单见 [microtiming-t1t2-cases.json](microtiming-t1t2-cases.json)，T1 静态台账见 [microtiming-t1-input-ledger.json](microtiming-t1-input-ledger.json)。原游戏 payload、原始逐帧流和 harness 都留在私有目录，本仓库只放身份、SHA 和摘要。

## 路线与边界

最新 JP 1.0.4/10053 原生（restored SO `6059f40b…`）通过 Unicorn 运行，沿用 53056 AutoPerfect 隔离基线的 sealed harness（`local_factory_pilot.py` `87cfe323…`），只增加 12 处计数精确替换，生成 `physical_replay_pilot.py`（`452a4dd9…`）。没有 `--physical-replay` 参数时，原路径保持不变。

物理输入走游戏自带的 QA 回放提供器 `App.LiveLogic.InputPlayer`：

- 用原 ctor 构造 `LiveAutoSettings(false, Perfect, false, 0)`，自动演奏关闭（`0x5970F08`）。
- 用原 ctor 构造 `InputPlayer(string, laneCount, settings, false)`（`0x54F300C`）。它通过原 `InputRecordData.Load` → `File.ReadAllText`（VFS）→ `JsonUtility.FromJson` 读入记录。记录只用游戏声明的字段，`RandomSeed = 0`，因此不会触发 `LiveRandom.SetSeed`。
- 每帧调用顺序：`ResetFrameResult` → `UpdateFever(t)` → `InputPlayer.Update(t, dt)`（`0x54F387C`）→ `LiveExecutor.Update(t, dt, input)`（`0x54F7A08`）。
- 1.0.4 `LivePlayingStateNodeBase.Update`（`0x5A005E8`）的机器码地址顺序与此一致：`ResetFrameResult@0x5A006B4` < `UpdateFever@0x5A00980` < `OnBeforeUpdateGekisou@0x5A00994` < 两次接口派发 < `LiveExecutor.Update@0x5A00AB8`。这只是静态观察，接口派发目标尚未逐个解析。
- 设备时钟 `UnityEngine.Time::get_realtimeSinceStartupAsDouble()` 通过 `il2cpp_add_internal_call` 从声明的帧表提供；在 `InputPlayer.Update` 之外被查询即失败。
- 绑定身份：`InputPlayer`、`LiveAutoSettings` 和 `ScreenTouchInputProvider` 的 ScriptMethod 行逐字取自同一份 `script.json`（`42ee86e5…`），补充文件为 `1e3a2ecf…`；运行时 MethodInfo 和 ABI 仍由 `PilotBinding` 逐次核对。

本批未覆盖（不得据此声称已完成）：

- `ScreenTouchInputProvider` / EnhancedTouch 的设备投影（T1b）。
- SkillExecutor、NativeSkillContext、撃奏区间和 `OnBeforeUpdateGekisou`。
- flick、hold、slide。
- 同帧与多触点批次。

`InputPlayer` 是 QA 路径，不是正式玩家的提供器。

## 用例

谱面为 10000201 Normal。前 8 个音符都是 tap（NormalNote，op 1，判定类型 1），名义时间为 2352、3529、4705、5882、7058、7647、8235、8823 ms。触点放在 lane 中心，按下后 40 ms 抬起，两根手指交替使用。帧表在 9248 ms 截止，早于第一个 slide 判定窗打开的时间。

| case | 偏移（ms） | 帧表 | 目的 |
|---|---|---|---|
| mt-p001 | 0, −50, +51, −83, +84, −130, +20, −131 | 固定 16 ms，realtime 基点 37.0003 s | 判定窗边缘与计分 command 时间 |
| mt-p002 | 同 p001 | 16/17/16/17/33/8/16/15 ms 变步长，f32 dt，基点 1234.5678 s | 时钟负控制：判定与分数不应改变 |
| mt-p003 | 全 0 | 固定 16 ms | 与 sealed AutoPerfect 轨迹对照 |

三个 case 用单 worker 在独占目录 `/workspace/cache/collab-microtiming` 中依次运行，均为 exit 0。sealed 归档为 `d2d048cc…`，每个目录都带 `SHA256SUMS`，取回本地后已复核。

## 观察结果

1. **判定时间等于触控时间，而不是帧时间。**
   - 单元 `InputTimeMs` = 帧 realtime − 音乐时间 + 录制时间，例如 40488 − 3488 + 3479 = 40479。
   - 判定中 `_judgementTimeMs` = 3479、`_judgementDiffMs` = −50。判定发生在触控后的第一帧（3488）。
   - 每帧只查询一次设备时钟。
2. **计分 command 时间是谱面名义时间。**
   - 例如 3479 触控的 command 中 `_timeMs = 3529`，8 个音符全部如此。
   - 这和核心 `live/full/mod.rs` 用 `n.time_ms` 生成 `NoteCommand` 一致，也解决了 AutoPerfect 轨迹里两种时钟无法区分的问题。
3. **判定窗口与 master 一致，且本 live 开启了 Just。**
   - 0 → Just(6)，−50 → Perfect，+51 → Great，−83 → Great，+84 → Good，−130 → Miss。
   - −131 不判定任何音符，该音符之后过期为 Miss。
   - 每个判定的得分为 Just 1832 / Perfect 796 / Great 637 / Good 398，与 master 的 230/100/80/50% 一致；Miss 扣 100 血并断 combo。
   - 预先登记的 p001 期望把偏移 0 写成了 Perfect，实测是 Just，以实测为准。
4. **帧步长与设备时钟基点不影响判定和分数（无技能、tap 范围内）。**
   - p002 的 8 条 command（时间、类型、加分、combo、血量）与 p001 逐字节相同，终分都是 5096。
   - 只有判定所在帧不同。另外，未触控音符的过期 Miss 时间随帧变化（9248 和 9246），但不改变分数。
5. **零偏移物理触控 ≠ AutoPerfect 控制。**
   - p003 8 个音符都是 Just，分数 14656；sealed AutoPerfect 在同样 8 个音符上是 Perfect ×8（6368）。
   - 原因是 AutoPerfect 由控制显式指定 Perfect，它不是最优手打。
   - 预先登记的“应与 AutoPerfect 一致”不成立，按实测记录。
6. **过期 Miss 发生在 note progress > 1.1 的那一帧。**
   - 本例为 +409 ms，对应 4000 ms 可见时长的 10%。
   - 它与流速设置的关系尚未验证（见队列 q007）。

## 对微操理论的含义

后续原生 E1–E3 核对见 [技能时间与加成边界](microtiming-skill-window-proof.md)；它补充本节结论，不改变上面 p001–p003 的封存结果。

- 提前或延后不会移动音符的计分时间：command 时间始终取音符的谱面名义时间。
- **更正分桶解释：** `GetFrame(ms)` 在非负音乐时间上是 `ceil((float)ms / 40f)`。1.0.1 和 1.0.4 机器码均如此；旧 C 反编译遗漏了向上舍入，不能按 `(int)(ms/40)` 读成 floor。
- **40 ms 只用于计分分桶，不会吸附技能边界。** 同桶内按精确 `timeMs` 合并 factor 与 note；时间相等时先执行 factor。因此固定因子覆盖 `[startMs, endMs)` 内的名义音符时间。
- 1.0.4 `SkillEventUpdater.Update`（`0x62209CC`）不读取入口 `input`，只比较当前谱面位置、事件位置和已触发状态，回调携带事件自身时间。
- 在固定加成区间下，同判定的跨边界触控已经由原生 E2 证实净收益为零。“牺牲 Perfect 把音符挪进技能区间”不能改变加成归属；降档只会损失该音符的判定分。
- 判定变化仍可能影响 Just 分数、条件技能和撃奏任务。这些是另外的因果路径，不可由固定区间的零收益推成“所有微操都无收益”。完整 NativeSkillContext、条件解除与实际玩家设备投影仍保留后续验收。

## 下一步

1. 执行队列 q004–q007。它们只用现有路线，可以直接扩大运行。
2. NativeSkillContext 就绪后运行 q009：同判定和改判定两种情况，覆盖技能起止边界、40 ms 帧边界和变帧率。
3. T1b：`ScreenTouchInputProvider` 的设备投影（需要 InputSystem 状态）。
4. 用 T3 的同输入 Rust 对照验证核心 `raw_input` 路径。
