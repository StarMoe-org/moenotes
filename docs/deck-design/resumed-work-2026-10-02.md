# 接手后的执行记录

2026-10-02，从 `9f47088` 的[暂停检查点](handoff-checkpoint-2026-10-02.md)恢复。用户已要求接手整个任务；目标仍为[协作说明](collaboration-brief.md)中的完整玩家路径，M/S/B 尚未通过。暂停检查点保留为历史记录，不覆盖旧证明。

外协固定技能窗批次声明“不考虑补丁”，实际执行 JP 1.0.4/10053 基础代码且未加载 IFix。这是该批次证据范围，不是用户对整个模型任务的新授权，不改变 M 的来源认证要求。最新外协固定技能窗结论由 [Draft PR #1](https://github.com/nichinichisou0609/moenotes/pull/1) 的 `942afece5da5990646f29ff12aef04f45b1269a9` 提供，补充下文早期 10-case 领取：19 个动态用例、14,206 帧，另有 20 个完整函数/1,976 条指令；固定因子按谱面名义时间和 `[start,end)` 归属，40 ms ceil 分桶后桶内仍按精确时间合并。同判定跨边界净收益零，Great 反例损失 159 分。条件技能、设备投影、连续触控和完整技能生命周期仍待验证。

## 恢复与并行边界

接手时已核 GitHub 状态：MoeNotes Draft #12 为 `9f47088abd0d314c4159e92368387845134330cd`，Draft #11 为 `66225909ee76a4717c245e9edfab5c605fa908c9`；Deck Draft #5 为 `67e07a1470f0913f1fdaf5ae7cbd2f9afe2988e1`；Player Draft #16 为 `f97bcdbec302a5595dfc5f9b961f20ebe6d2c8a1`。四个 PR 当时均 OPEN/Draft；这些 head 是接手快照，后续搜索修复另见下文 fork Draft。

现有 CNB `cnb-j3p-1k3s982pu` 的 status 为 running，alive 可见 WebIDE 进程。继续复用该实例，未新开机器、未停止共享容器或外协任务。Rust 编译、原生实验和浏览器执行仍在 CNB；各线使用独立源码、实验和 target 目录。Windows 技能脚本需经 Git Bash 调用；WSL 中同名默认路径不存在。

## 外协触控产物：已领取并独立核验

已取回两份既有封存包，远端与本地 SHA 一致：

| 归档 | bytes | SHA-256 |
|---|---:|---|
| `e1e2-stage1.tgz` | 6,425,515 | `3945a8761df756dc678471c23ab3ec3bb99dc91d900bd4c10639b8d01a754964` |
| `runs-t1t2-pilot.tgz` | 3,855,522 | `d2d048cc1897baaed8769714a0797c6f65615567161e2f52d615cf12e516fa94` |

独立 readback 核验 10 个 case、249 个封存文件，零差异。实际 `bindings[*].sourceNativeSha256` 均为 `6059f40b2f949cf028935dacf92df0636f7256150b8bb90e3b52ee1aabfebc70`，与各自 fixture 一致；不是新跑 10 个原生 case。外协分析器从错误字段取得的 `nativeSha256: null` 不用于身份判断；后续 19-case 证据已从真实 binding 修正该字段。

`mt-e2b-factors-early`、`mt-e2c-factors-crossing`、`mt-e2d-factors-variable` 的 command 原字、40 ms bucket 及顺序一致，终分均 7165。音符 3 的 nominal time 为 4705 ms；touch 从 4685 改为 4725 ms，实际判定帧从 4688 改为 4736 ms（变 dt 时为 4731 ms），Perfect 判定不变，command 仍为 4705 ms / bucket 118 / addedScore 796。该八 tap 隔离域的同判定移动净收益为零，不能推广成所有微操均无收益。baseline 6368 与 factor case 7165 的差额来自原生 factor API 的显式注入，不是触控移动收益。

这些 case 使用游戏 QA `InputPlayer` 的 lane/time replay，尚未执行 `ScreenTouchInputProvider` 的屏幕投影。`JsonUtility.FromJson` 和 realtime clock 有宿主桥；factor case 无 `SkillExecutor`，完整 driver、技能和撃奏 hooks 未认证。共享求值必须继续区分 nominal command、judgement、frame、device time，不能把延后的判定时间直接移入技能窗。T1/T2 和 M 均不因此放行。

早期私有原始包、分析器输出及独立核验保留在工作区基址下 `helpers/touch-handoff-audit-20261002/`。当时 `mt-e1b-offset-touch` 仅在运行，现已由后续封存产物独立核验，不能继续沿用旧“尚无成功 E1”状态。

最新完整 `runs-e1e2-complete.tgz` 为 22,413,857 bytes、SHA `dc993084206c6a1aaed1f220ed7329c84f37373bd0b0cc1c86815001cd71cfb3`；静态 `e3-results.tgz` 为 76,574 bytes、SHA `30bad07b02855fd1216dc0bb058f4e96f77d49fa739b2274e1adc60bd6134579`。独立重读核验 19 个成功 case 的 475 个封存文件、14,206 帧、5 对 command 原字/桶序相等及 159 分损失；20 个完整函数的 1,976 条指令重组字节 SHA 均匹配。私有记录在 `helpers/touch-window-pr1-audit/independent-readback.json`，公开[技能窗证明](microtiming-skill-window-proof.md)与[证据清单](microtiming-skill-window-evidence.json)已接收。19 case 不含旧 p001–p003 或失败 E1 attempt。

这次接收固定普通加分因子的时钟证据，不要求修改已有 ceil/精确 factor-first 核心实现，也不等于完整 T1–T6 已验收。外协 PR 的五个文件是文档与 JSON；harness 仍在私有封存包，不把文档接收说成公开可复跑实验工具包已交付。

## 原生声音依赖：资源解析与独立插件组件

同源正常 `M_Hitosizuku` bundle 经 UnityPy 1.25.3 和冻结 nnnotes reader，按真实 `_chunks` PPtrs 顺序读出 10 个 TextAsset，拼接/XOR 后取得 2,941,216-byte ACB，SHA `931fef4b7357e9076ab196c993fffcd08ad129dbbe7164e7fa472403751a26b2`。实际 cue 17 的元数据长度为 91,800 ms；未写入游戏音长缓存，尚不是原生 getter 结果。

matching JP10053 split APK SHA `940b70c049e32cdff488608bca8cd40b716e6bec80763b480a191904e7b2e237` 的 CRI 插件 SHA 为 `66f2b608e79c7c2e4f1425e96d9fef4719782bf1f2ffda134bce8343cd0a2fec`。在独立 image/cache 执行原 `DT_INIT_ARRAY[0]`、`criAtom_GetVersionString`、`criAtomEx_IsInitialized`，3 次调用返回。真实版本字符串为 `CRI Atom/Android_ARMv8A Ver.2.31.181 Build:Jul 1 2026 19:27:50`，initialized 为 0；没有游戏 image HLE，仅调用 `memset` 和 `__cxa_atexit` OS 边界。这不是完成音频初始化、有效 ACB handle 或正常 driver 的证明。

三份阶段包均已取回，逐项文件 SHA 核验无差异；下面的文件数不含 manifest 本身：

| 阶段包 | bytes | 核验文件数 | SHA-256 |
|---|---:|---:|---|
| `sealed-cue-source-and-cri-static-20261002.tgz` | 7,900,736 | 93 | `5ae27562442185d1c9c910faf00c272c6c1b88296c1bffb753117336a221b692` |
| `sealed-cri-initial-component-20261002.tgz` | 2,379,622 | 14 | `a2fd3c55b5f5ed681d5c6357e4c1f42bb42dfb65e54cb0730011c46bc2fb1e27` |
| `sealed-cri-init-attempts-20261002.tgz` | 4,743,778 | 26 | `ea1c2966bacb77c217953753d6f2a4984f034520ad030edc10ab031c994222b6` |

前两包的 root 独立核验在 `helpers/native-pilot-prep/resumed-root-independent-readback.json`；三包的执行与保留范围在同目录 `resumed-native-summary-20261002.md`。源 bundle、APK、ACB 和二进制保持私有。

现有 IL2CPP harness 的 `dlopen/dlsym` 仍返回 0，不能以假 handle 接通。matching managed PInvoke `CRIWARE9097DE07` 的原初始化入口已执行，先在缺失 `pthread_condattr_init` 处停止；按 AOSP bionic 语义补齐属性存储/销毁/时钟选择和 EINVAL 检查后，新的独立运行停于缺失 `pthread_getschedparam`（LR `0x1d6134`）。第三包保留失败，两次 matching wrapper 均未返回或成功初始化。这里是当前模拟器 OS 接口缺实现，不是 Android 或原 CRI 初始化本身被证明失败；仍在继续实现真实 scheduler/thread 外部合同，不能用假成功绕过。后续还需真实配置/FS/Android 初始化、动态链接和正常生命周期。隔离插件组件与先前 555-call 主链分别保存，不合并成完整原生一致性声明。

## 搜索修复：已提交独立 Draft

最终提交为 `4166daa90d1733f947c23a46991a0b0049b53582`，[Deck fork Draft #1](https://github.com/nichinichisou0609/ournotes-deck/pull/1)。从 `67e07a1` 的修复包括 K=0 输入错误、超大 K 不预分配、不可表示 deadline 的输入错误、准备/遍历/最终验证共用合作式 deadline，以及 Skip 全可行域的非负 lower bound、全局 P_UB 与完整 f32 链/非绕回检查。原 unrestricted evaluator 保留 infinity→MIN 等原数值行为；不把定界证明扩展给 Live 或微操。

隔离 CNB Rust 1.88.0 容器限 2 CPU/4 GiB，最终 `cargo fmt --check`、Clippy 全 targets/deny warnings、release 测试 **287 通过、0 失败**、**14 条新增 gate 测试**及 `wasm32-unknown-unknown` 编译检查通过。WASM 检查不是浏览器执行，也不是旧 28 组 CLI/WASM 对拍在新源码上重跑。

- 26,040 个 canonical 成员集合/leader/Snap 独立枚举，对 regular point evaluator 核 signed lower/upper bounds；不枚举不影响 Power 的所有非 leader 物理排列。
- 追加 16 个 constrained lower case，覆盖 required/fixed、五个 required（picks=0）、同角色替代与 signed effects：12 个接受、4 个正确拒绝。约束枚举按 ID 独立过滤，组件 bound 算术仍共享。
- 既有 brute-force 对 8,680 个 canonical deck / 56 个成员集合核 K=1/5/30/all；它共享 `resolve_allowed` 与 point evaluator，不能作为独立账号合法性或原生计分证明。
- 一组冻结 JP 初始五成员/五 Snap fixture 保持总力 59,223，其 340 首冻结谱面均被新 Skip guard 接受。这是 **1 个培养 fixture、340 个 chart**，不是 340 个账号 profile；没有增加原生调用或原生 Skip 对拍。

执行源码 manifest SHA `ea40c314ae6d5266244701cbe0073b4e0721658549315ef5911350d9c8d63fe9`，最终验证日志 SHA `c8405a5685d0f782c574205755e2228aaba43996eda7122d288c68df493469c7`，私有证据包 SHA `fe921027f49cb2e5e4c88c0c1acf37f995cacd369bd783c18ca8518ad272782d`。15 个留存文件与 134 个编译源码文件取回核验一致；研究说明在编译后添加，不计入编译源码 manifest。完整可公开说明见[固定提交中的修复记录](https://github.com/nichinichisou0609/ournotes-deck/blob/4166daa90d1733f947c23a46991a0b0049b53582/docs/research/search-repair-2026-10-02.md)。S 仍未通过：账号全域合法性、GoalSpec/OwnedSnapshot、联合环境 law、微操搜索及可分片恢复继续推进。

## OpenCV runtime：已完成能力探针

已从[官方 OpenCV 5.0.0 GitHub 文档发行物](https://github.com/opencv/opencv/releases/download/5.0.0/opencv-5.0.0-docs.zip)提取未修改的 `js/bin/opencv.js`。ZIP SHA 为 `c6fca369db63b6f00ff3d30ae28a74d6a49093f5bb21fb10d3849a37a446c768`；runtime 为 16,211,109 bytes、SHA `bf6130c3d755915e5d005b69e574225817f98dc5556fe640628f8f18c1eb568f`。这不声明与受 challenge 的 docs.opencv.org 端点字节相同。

CNB 独立 Node v22.23.1 容器真实执行后，四组 JP 数值 buffer 共 14,171,628 bytes 的 gzip/原字 SHA 全通过，owner 范围为 0–126；2×2 BGR 转灰度 `[0,255,76,29]`、缩为 1×1 的 BGR `[128,64,128]` 均吻合独立预期。仅这两个图像 primitive 被执行，不能把其他符号存在算作算法通过。

实际缺少 **SIFT、FlannBasedMatcher** 的 JS binding。构建信息里出现 C++ 模块不代表 JS 接口可调用；后续需明确绑定构建或经过独立等价性验证的替代。完整检测、裁切、检索、拒识、字段、合并、真实截图和手机资源开销仍未通过，也没有正式 B 集成。

探针另修复真实 `numeric-buffers/` 路径以及发行物 `Module.then` 自解析循环。第一次初始化超时 exit 124，修订后以普通对象承接 callback，第二轮 exit 0，未改 runtime。约 203 ms 初始化仅属于本次 Node/CPU 条件，不是浏览器或手机延迟。源码 SHA `deccdf76f10a17a520347ddf0c7d70bd0405e575bf051b7700b1cd6d2230b5bf`；回收报告包 SHA `f3fe7f4b00300393a50ccc0f1c1ab4a0399fb5b841b89eee892a2cff9c357ac5`，6 项 manifest 本地核验一致。私有完整材料在 `helpers/opencv-runtime-audit-20261002/`。

## 后续依赖

原生线继续闭合真实 cue → matching CRI 初始化与 handle → 原 getter → 正常 SkillInput/driver，再做有技能、Snap、撃奏同输入整局差分。资源元数据长度不能直接写入游戏缓存作为原生 getter 证据。

搜索反例修复已形成上述独立 Draft 和新源码验证，不再把它描述为未编译交接草稿。后续继续公共账号 resolver、GoalSpec/统一求值与 SearchSession，保留合作式预算不等于抢占或 step/resume 的边界。

主线继续执行正常 driver 和公共账号 resolver 的实现与验证，文档更新仅保留进展和证据，不能代替这些未完成工作。浏览器完整闭环仍是未完成项；资产/runtime 探针可独立研究，正式 B 集成仍须等待 M/S。所有模型、搜索和接入 PR 继续保持 Draft。
