# JP Android 1.0.4 / 10053 原生恢复与执行门禁

2026-10-01 在 CNB 完成。以下范围是 **offline-base；IFix 未加载**。线上实际生效 hotpatch 与当前 master 版本仍未认证；这份报告不声明最新线上计分模型等价。完整截图到组卡的正式 SDK 尚未放行；Snap 排行 Draft 的 Worker / 展示证据应按其独立输入和支持范围阅读。

## 来源与恢复链

完整 Android `10053` APK 与 extracted SO / metadata 来源绑定见 [来源清单](latest-native-source-binding.json)。base 与 ARM64 split 的 APK 内容签名验证见 [apksigner 报告](apk-signature-verification.json)；三个 split 的证书解析见 [证书记录](latest-apk-certificates.json)。Unity asset split 的密码学验证未执行，source stamp 未验证；两项状态都不从 base 验证结果继承。

| 身份 | SHA-256 |
|---|---|
| 原始 `libil2cpp.so` | `b1600689ee83c435b4a3eaa1ef0709b1ed27783eeda90dace814515a54e0a7ce` |
| 原始 `global-metadata.dat` | `bbf82e20b16ac39ad14c6d3547250efb84daa6ae2c754e46ae9bae5270f9386c` |
| 原始 `libanort.so` | `47a9ceacb4850b311972ffebdde37905a3f7baa5c5588f2be7b2e1d2e9333b74` |
| 保护区恢复 SO | `e6c6970a2114020b4efaf2d6570803b1ddd62c9e90349de7e668a7d956bbbf8e` |
| loader table 恢复 SO | `6059f40b2f949cf028935dacf92df0636f7256150b8bb90e3b52ee1aabfebc70` |
| 完整结构核验的 decoded metadata | `8cf963bc5a32262c2ad3e21307dda14d144bcced6fe7731986933718dcf9a91d` |

保护区配置从最新 ELF 的 section name / VA / file offset / size 与最新 loader 记录重新匹配。3/3 保护区 CRC 精确一致；错误候选的 3/3 CRC 均失败。恢复动态表时，4 个辅助函数使用完整 FDE 代码 SHA 与最新文件的唯一匹配重新绑定；当前 275 个 import 轮转、1,096 个符号恢复在最新 ARM64 函数中执行，与分析转换结果完全一致。只修改 `.rela.plt` / `.dynsym`，保护代码和只读规则数据保持逐字节不变。符号策略 callback 明确 stub 为 false，这只验证恢复算术，不能证明所有实际部署都会公开所有符号。

metadata 的 31/31 table 范围与顺序、47,081/47,081 字面量偏移的单调性和精确起末边界通过；错误 AES 候选的完整偏移不变量失败。复制来的通用 CN helper 在 `0xff8..0x1000` 留下两个未恢复偏移；本轮按 BDON 文件物理边界修正后通过完整不变量。只检查 31 个 header table 不能发现该缺口。初始不合格 metadata 没有计入通过。

## 真正执行与验证分母

Il2CppDumper 锁定 commit `6fd1d13933f9a14a0a927d816720120894da8d96`，SDK `10.0.100`。最新静态注册位置为 CodeRegistration `0xb69cb90`、MetadataRegistration `0xbc2b828`。这里的静态产物是方法定位入口；数值规则需要独立原生实验。

两次独立的完整 runtime boot 都使用上述最新恢复链，均 `il2cpp_init = 1`，取得 218 个 assemblies（包含 App.Runtime.dll），各自创建新的 snapshot。没有读取旧 TW snapshot，没有替换游戏 image 内函数。执行时间分别约 16.666 s / 16.331 s；外部 libc / 文件 / 单线程同步环境由明确的 harness adapter 提供。

一次先前使用 Unicorn 内部时间片的 boot 在 runtime allocator 路径失败。通过移除共享内部计时、在进程外设置 timeout 后，上述两次无时间片执行独立通过；失败没有算入通过分母。批量规则执行也须维持无内部时间片与外部 deadline。

通过最新原生 C API 实际取得字段 offset / type / flags、方法参数和返回类型。补充 `native-class-layout.json`（SHA `c38742bc7079c1c19450fdab82a18dbbd4a9c3f895997f2eb8f63ff76b6239cc`）现有 11 类、199/199 个 MethodInfo 首字 code pointer 与最新 dump entry 一致，0 unresolved；早期 10 类/190 方法是先前范围。CardPower 大小与对齐另由 native `il2cpp_class_value_size` 读取。每个匹配 entry 附 64 字节代码前缀 SHA；它是明确长度的 entry 身份证据，不是完整函数语义 SHA。

这些分母分别是恢复区、字面量 offset、runtime boot、目标 class 与方法身份。**它们都不是已通过的计分、技能、击奏或失败生命周期用例数**。这些机制继续按 [模型矩阵](model-validation.md)逐项验证，并绑定单独的输入与观察字段分母。

## 允许继续的研究域

可以以已保存的 2026-09-30 JP master / resource 快照，开展“JP Android 1.0.4 / 10053 offline-base + saved JP snapshot”原生对照；明确冻结来源，不称 2026-10-01 当前线上版本。先做真实 entry 的 direct / runtime-invoke ABI pilot、卡力和计分原语，再扩展整场状态与随机 / 撃奏 / 失败生命周期。待单 worker 的准确性、负控制、耗时与 RSS 通过后，才将独立 case queue 分散到更多 worker。

本轮恢复工具和精简原始门禁保存在 `work/deck-improve-20261001/native-jp-10053`；此摘要不包含恢复 key、私人 API URL、账号数据或完整游戏 payload。

## 后续已经实际执行的 pilot

- LiveRandom：6 个 signed root、每 root 4 个 stream、每 stream 5 个操作，共 120 个独立 event 输入；交错 stream、stream 顺序和 reset 重复形成 360 个实际原生 event 调用，连同 24 个派生 seed 及 setup/read 调用共 420 个 bound calls。原生重复 / 交错性质和变 root 负控制通过；实际输入包含 i32 两端及 float32 返回原字。与生产 Rust 的对拍由独立实验报告维护，不能用原生自重复当作跨模型一致。
- NoteJudgement：最终有效 capture 为 25 个独立声明输入（窗口边界 ±1、中心与时间 i32 wrap）、50 个原生调用。每 case 先设置 position 再构造 native Note，并从 Note 实际持有的 position getter 回读时间，核实 `inputContractVerified`。特定 20 B / align 4 结果的 direct hidden-x8 返回与真实 runtime-invoke / object-unbox 逐字一致，5 个字段由 native API 核实。冻结 f755 生产 `raw::note_judgement` 的独立对拍为 25/25 inputs、125/125 fields、0 differences；比较阶段新增 native 调用 0、model 调用 25。初始 capture 因先构造 Note 再改变外部 position，未改变 native 缓存时间，出现 64 个字段差异，已归类 input-contract-invalid 并保留，未归类模型差异。修正与补契约 gate 的重复 capture 共进行 3 次有效重复（各 50 调用），加初始无效 capture，实际历史 NoteJudgement 调用为 200；仍只有 25 个有效独立输入。这是声明的 synthetic timing units 上的无状态判定，未执行真实谱面或 Touch 生命周期。
- saved JP 数据：两份 MasterManifest SHA 均为 `f4534fe8bf340b7a9bd99eb9b43ab384e9e3895a7e1eb3113cbb371e65780735`，版本与 9/30 provenance 一致。最新客户端实际 Loader / CryptProvider 读取 MemberCard / LiveMusicScore / LiveJudgementTiming 三个二进制表，bin SHA 全部匹配 manifest；原生解密 / 解压后 payload 的 canonical JSON SHA 与独立 saved JSON 一致。63 / 340 / 276 行分别核实，9 个 first / middle / last ID 使用实际 native GetByID 一致，JSON 桥未知字段为 0。Unity JSON / 路径 / allocator 外部服务通过原生 icall registration 提供，game image 函数替换数为 0。没有认证其余 master 表、完整 JsonUtility 语义、整场技能或失败生命周期。

最新同文本 generic method usage 可指向不同程序集实例：例如 MasterLoader 的显示名同时对应 AdvSystem / App / Common。适配器现在拒绝重复显示名的自动选择，并用 native MethodInfo declaring type 与返回对象的真实类型绑定目标；方法身份不能只用反编译显示名。

- MemberDataContainer：6 个 signed root、5 张真实 saved-JP member master（character 各不相同），构造器 shuffle order 与独立 native Range(stream 3, max 5→2) 完全一致；shuffle 后四 stream 的下一次 float32 Value 也一致。实际为 6 次 constructor、24 次独立对照 Range、48 次 poststate Value。用户 / power 对象是明确的 placeholder，无留影，totalPower 75,038 是注入值；未执行完整 profile、skill factory 或留影跟随路径，不扩大为整条技能 / Luck 共同 root 链认证。
- 原始 JP chart：从 JP9/30 专用缓存中解析已绑定 SHA 的官方 catalog，核实 addressable key `Live/MusicScore/0002/0002_01` 及唯一 bundle dependency；提取 `10000201` 的原始 TextAsset 1,277 B，SHA `d52034d539e10651eeb896d10c0d9ef2e5f5e054d115a920e8d6b0d7bdd52c1d` 与 saved JP export 的 asset SHA 逐字一致。cache bundle 为解密后 UnityFS，cache SHA 不能当成加密 CDN 字节 SHA。没有默认采用 TW cache。
- 最新原生 chart parser：实际调用本版本 `App.Live.MusicScoreLoadUtility.ParseMusicScoreBytes`（新 entry `0x5a1ad8c`），取得 24 lanes / 364 notes；ID、timeMs、operateType 三列逐 note 与独立 saved JP export 对照，1,092 / 1,092 字段一致。Unity JSON bridge 调用为 0、game image HLE 为 0。当前声明 parser 参数 startNoteId 0、slideNoteComboRhythmicUnit 8、mirror false；未核实真实 LiveSettings factory 的参数选择，也未认证 lanes / judgement types、fever、skill events 或完整 gameplay。
- Local 初始阶段：[独立摘要](latest-native-local-factory-pilot.json)绑定 input SHA `0deba3333f6b2e80f607945e61bf17efc9cc99f582e59498b745b64a3909c16a` 与 report SHA `9cd0e5aafaae91719e10a5789c9a61e6ee00a38f878ed9ad00a7805e9ce9fb6f`。真实 `Local.MemberCard(MasterMemberCard)` / `Local.SupportCard(MasterSupportCard)` 各五张，成员 exp 0 / level 1 / awake 1 / rank 1 / ordinary 与 GK skill level 1，Snap exp 0 / level 1 / rank 1；真实 Player 构造、Add 与 public Get 返回同一个注册对象。此阶段 152 次绑定调用已返回，game image HLE 0、无手写 vtable。三项未知 JSON 字段的外部 adapter 契约逐项绑定独立 proof SHA；它们没有执行 libunity serializer，也没有游戏规则比较。
- 后续真实 factory / Live 初始化：[最新 455-call 摘要](latest-native-settings-pilot.json)绑定 input SHA `2e6f6c7d95a0270392003abf955ade79576e0129701989c54b0cd031faae3e9e` 与 report SHA `b60d1f024f574830a6f28b971d47c3765e773e8267b2bc8bb5338c36b49391b4`，同一培养 fixture 的真实全局 cache、MemberDataContainer / SkillDataContainer、五个实际 CardPower 的非空技能字典、Player options、score/note/life/撃奏 settings 与原始谱面 parser 均已返回。rhythmicUnit 8 / mirror false 是实际 note-settings getter 读回；startNoteId 0、noteSpeed 1、timingAdjustment 0 仍为声明校准控制。三个 mission getter 与原生 utility 数组均 `[3,3,3]`，pattern 独立值 1；真实 master rank source 已取得，但评级表、LiveMusicScore/ranges、SkillStatus/Executor 尚未执行。六份 harness 源码前后 SHA 一致，game image HLE 0、无手写 vtable，49 表文件身份绑定；23.420 s / 830,896 KiB。VIP ctor rank 0、Unity 主循环尚不完整，`wholeLiveCertified = false`；455 个 setup/readback 调用不能当作独立技能用例或 455 场对局。

在 options 初始化中先前观察到的 native Crypto 异常来自外部字符设备 `/dev/urandom` 不存在。恢复明确的 libc open/read/fstat/lseek 外部边界后，实际 RNGCrypto/MessagePack 链成功；只记录每次 entropy read 的长度与 SHA，不保存随机字节、不替换游戏 image 函数。游戏 LiveRandom 使用原生 SetSeed(root 0)，与这些外部 serializer entropy 分开。options/settings 返回不等于所有窗口、Assist、Life 参数已认证，完整参数读回仍在下一步。

恢复机后续已通过真实 `MasterLiveScoreRankBox.GetScoresByRank` → `LiveScoreRankTable` 及六档 threshold getter，直接原生 LiveMusicScore 七参 ctor 读回 24 lanes、364 判定 notes、converted count 233 与三个实际撃奏 range。完整 `MusicScoreLoadUtility.CreateLiveMusicScore` 仍在 Unity.Object 的外部 icall 初始化处抛异常；直接 ctor 路径没有冒称完整 utility 已通过。真实五成员、五 Snap、五个 native CardPower 与范围已输入 SkillStatus，但本地化 manager 的初始化尚未完成，SkillStatus 构造异常保留。

由上述 factory 的实际 IL2CPP fields/type/array 读回形成[计分设置独立对照](latest-native-score-settings-comparison.json)：两个 f32 原字、16 个音符倍率、6 个判定倍率，共 24 数值字段和 22 键身份，0 差异。capture 的 499 次 bound attempts 为 498 返回/1 异常；比较阶段新增 native 调用 0。只读 Rust probe 复用 current-core `4e1f1ce` 与此前已验证的 native-target 依赖 lock，独占目录的 124 源文件前后 SHA 一致；37.49 s 的 release 编译在 CNB 完成，校验容器已停。它只验证设置转换，不认证整局、命中/未命中或累计技能。

455 capture 的完整字节、六份实际执行源码、method records 与 case 已封存；三份旧外部 JSON adapter 合同的完整 proof 未在回收前保存，原 SHA/源码/负控制摘要仍在 capture。恢复机实际重跑三份合同并保存新 proof，新 capture 引用新 SHA；不会从摘要仿造旧 proof。这个保留缺口单列在[初始化摘要](latest-native-settings-pilot.json)中，不影响已明确保存的原生返回字节，也不解除 external adapter 的独立验证边界。

另有[JP Snap 静态依赖清点](latest-snap-static-inventory.json)：615 条普通、1,050 条撃奏 effect；19 个结构签名仅为排序研究队列，不能折叠真实行或证明搜索等价。790 行被当前 SupportCard 直接引用且有声明 rank 映射；875 行没有该直接引用，保留数据覆盖义务。所有非零 condition/target/cumulative 引用可解析，但培养合法性、AND/OR/释放/累计语义、命中与未命中、时钟及整场行为仍需实际原生对照；静态清点的原生规则比较数为 0。

## Whole Live / 原生技能容器与 SkillExecutor 最小下一步

原生隔离执行已补充一条[无技能整谱轨迹](latest-native-isolated-live-trace.json)：真实 AutoPerfect 输入，5,634 帧、364 判定、终分 209,797，29,790 次绑定调用返回，完整调用流和 111 组状态采样已独立审计。这条轨迹没有 SkillExecutor 或撃奏 driver hooks，也未触发完整游戏自动结算；原生长谱执行不能扩大为合法成员/Snap whole-live。

后续重新执行并完整保留每帧 SpanList ID、实际判定时间/enum/raw diff 与 364 条实际 score commands，形成[同输入整谱差分](latest-native-frame-comparison.json)：53,056 次绑定调用返回，118 文件/7 源码独立核验；5,634 帧的 score/frameScore/life/combo 共 22,536 输出与 11,268 frame/time 身份比较，全部一致。输入来自原 native ctor 的 musicLength 90,411 ms、真实 calculator/music/life 原字段与实际判定流，不用 nominal time 补判定时间；所有整数精确比较，无时间平移或误差容忍。它仍是相同 AutoPerfect、无 SkillExecutor/GK/physical touch 的组件隔离场景，不增加新玩家行为覆盖。

当前冻结核心的[随机原语差分](latest-native-random-comparison.json)也已复核：24 派生 seed 加 120 独立事件的 stream-major/interleaved/reset-repeat 三模式，384 结果零差异，Value 按 binary32 原字；本阶段重用已保存原生 golden，新增 native 调用 0。六个边界 root 只验证实现与消费历史，既不证明真实 root 分布，也不解除有技能整场调用链门槛。

真实技能链继续取得[组件证据](latest-native-skillstatus-component.json)：matching engine 的原 callback、managed wrapper 和 Object.cctor 通过后，原 Localize Awake 实际发布 singleton，SkillStatus 工厂和字典为 509/509 绑定返回。后续 SkillExecutor 原工厂、四个 normal-node target 的原 Func delegates、初始 BeginFrame/phase1/phase2/EndFrame/Collect 为 549/549 返回。该 549 阶段明确 GK=false、Clear 后 musicLength 0、native ctor query clock 0、无 applier/正常完整 driver；不能把初始组件返回当作效果、时钟或真实 whole-live。正常 driver 的 life getter 使用自己的查询时钟，需要由原 Update 推进，不能用当前生命 getter 或手填字段替代。

同一来源另有[完整音符输入投影](latest-native-note-input-projection.json)：364 个真实音符的 ID、时间、操作类型和判定类型，2,240 次绑定调用均返回。判定类型全部由真实 updater getter 返回，其中 1/21 各 146 个、10/11 各 36 个；没有按操作类型或旧服模型补值。输入 ID 与实际三个原生字典集合一致，13 个保留文件及 7 份执行源码已独立核验。它补齐输入契约，不能把尚未保留的整谱逐帧事件认定为已观察；下一条隔离轨迹需另存实际 judged-ID 顺序、判定时间和分数命令时间，再对照冻结核心。成员/Snap、撃奏、真实触控微操和活跃 IFix 的门槛继续保留。

1. 从同一 saved JP manifest 加载歌曲、计分、Assist、combo、skill / target / condition 等实际所需表；每个被读取 bin 保留 manifest hash 和 native 解码 payload 身份。现已通过的三表和 chart projection 不重复采集来增加分母。
2. 使用最新 MethodInfo / 签名和原生字段 API，构造真实 Local options 与 LiveSettings factory 路径，读取实际 rhythmicUnit / 窗口 / 计分 / Assist 设置。用已绑定 chart 构造 LiveMusicScore、LiveExecutor，在真实培养的普通 Live 基线保留实际技能，核实 note 时间、阶段、life、combo 与分数。无技能短轨迹仅作为显式实验隔离对照，记录 harness 控制和构造范围；未验证玩家能关闭成员技能前，不将其计为合法玩家动作或完整 factory 认证。
3. 用户 / power placeholder 必须替换为明确培养状态的 native Local Member / Support 数据，验证真实 factory 的 member / support 配对与 native shuffle 后共享 RNG 状态，再按最新 metadata 绑定技能 data 容器、SkillStatus / SkillExecutor 与 ordinary / support / Gekisou 技能。共享模型中的 SkillManager 是概念/实现名，不当作已找到的原生类。使用真实 JP 卡与技能 level / effect / condition / target 形成覆盖分母；不从构造成功推导 condition / effect 全部正确。
4. 先以一个单 worker 的短轨迹核实 setup / enter / frame / trigger / settle 的观察阶段和负控制，再增加长谱、边界、重叠、pool 限额、Gekisou 排名和零生命 / 继续 / 重试生命周期。重放同一 capture 或更换运行端不增加独立 native trace 数。

当前实验阻断已经从“缺少最新包 / 原始 JP chart”转为**最新合法 gameplay / skill 上下文与调用边界尚未完成绑定和验收**：旧 capture 的 TW VA、硬字段、generic display-name 与手工 vtable 不能直接套用。C++ / managed 异常路径须区分 harness 退出与游戏规则结果。现有 APK、metadata、saved JP 三表与真实 chart 已足够继续 offline-base 研究。已有[Windows 成功 Version 观察](latest-version-observations.json)，但完整资源与活跃 IFix 尚未绑定，仍不能扩大为最新线上完整认证；后续实验与浏览器接入门槛见[主线记录](primary-delivery-gates.md)。
