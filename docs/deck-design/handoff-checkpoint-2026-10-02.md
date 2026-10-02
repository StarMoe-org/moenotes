# 暂停检查点与恢复说明

2026-10-02。用户要求 handoff 并优雅暂停，随后明确要求「不要停机，马上有人接上」。本会话停止新增实验，CNB、共享容器与 WebIDE 保留。目标未完成，M/S/B 均不能因交接而放行；模型、搜索、接入 PR 继续保持 Draft。

## 目标与不能丢失的要求

最新日服模型与原生对照、玩家目标和合法搜索先做好，再正式接入 MoeNotes 的截图上传→卡池校对→可靠推荐。FixedDeck、DeckSearch、SongRanking 共用一套数据与 evaluator；包含 Snap 和合法提前/延后微操。WASM-only，无 WebGPU；复用既有组件及 nnnotes/Player 的真实 prefab 拼装，保留中间 leader、比例、出框、弧形编队及原排行语义。歌曲 master/meta、评级和自动导出/压缩同样是维护对象。

完整需求/分工见[协作说明](collaboration-brief.md)，外协最难工作包见[真实触控与微操任务书](collaborator-microtiming-scope.md)，阶段门槛见[主线门槛](primary-delivery-gates.md)。传闻的自由 Live B/活动任务 S 对比已由用户撤回，不再追查。视频消息已被用户取消，不向视频会话发送后续素材。

## 已验证与未验证

| 项目 | 当前检查点 |
|---|---|
| 来源 | JP Android 1.0.4/10053；冻结 master `1.0.0.300/52355a9de56a475f691b10ef58acba58`。恢复原生 SHA `6059f40b…bfebc70`、metadata `8cf963bc…f9a91d`；active IFix 未加载/未认证。2026-10-02 官方 Version 的 master/resource 与冻结源一致 |
| 成员/Snap 与参数 | 一组真实 factory 初始五成员/五 Snap：36 数值/10 身份字段零差异，总力 59,223；计分参数 24 数值/22 身份字段零差异。不是账号与培养全域证明 |
| 无技能整谱 | 原生 AutoPerfect 隔离 5,634 帧/364 事件；当前冻结 Rust 同输入 33,804 字段零差异，终分 209,797。不是玩家触控/有技能整局 |
| 随机 | 当前核心与 JP 原生 golden 384 项比较零差异，f32 原字一致。完整技能消费历史与玩家 root 分布仍待验证，不能挑幸运 seed |
| 技能主链 | matching engine callback、Localize Awake、SkillStatus、四个真实 normal-node target delegates、初始 SkillExecutor/applier 和空事件 span，最新封存 555 次调用返回。GK=false、初始 life-query=0、Clear 后 musicLength=0 等控制仍存在；正常 driver、实际触发/应用/Snap/撃奏/结算尚未认证 |
| 声音依赖 | 真实正常 `M_Hitosizuku` bundle 已用官方 Session 取得；同源 catalog 新 GET 已核 SHA。静态长度链定位到 Source→GetSourceLength→ACB.GetCueInfo.length；实际 cue 解析/CRI 有效 handle/native getter 未执行 |
| CLI/WASM | Draft #5 冻结 head `67e07a1`：274 测试、28 合成 CLI/WASM 对拍已完成。未覆盖新 S 修复、正式账号 resolver、真实截图闭环或手机性能 |
| 搜索 | 审计证实零预算契约、底层 K=0 panic、f32 溢出逃过 Skip 检查并导致错误 Top-1。独立修复草稿已保存，尚未编译/测试/提交/推送 |
| 浏览器识别 | JP 63 成员/64 Snap、1,110 文件与图库 fingerprint 核验；数值 buffer gzip 可无损还原。完整检测/裁切/检索/拒识/字段/合并未移植验收。最后 OpenCV runtime 探针未生成报告，不计通过 |

查看[原生同输入整谱](latest-native-frame-comparison.json)、[随机对照](latest-native-random-comparison.json)、[搜索审计](latest-search-gate-audit.json)及[浏览器移植契约](browser-recognition-port-contract.md)。静态代码定位、组件返回、宿主/Rust/WASM 对拍各有不同范围，不能合并成完整原生一致性声明。

## 分支与源码边界

工作区基址：`F:/ournotes-reverse/work/deck-improve-20261001/`。

| 工作树/分支 | 状态与下一步 |
|---|---|
| `deck-draft-cnb`，`research/cnb-cli-wasm` | [Deck Draft #5](https://github.com/empty-sekai/ournotes-deck/pull/5)，head `67e07a1470f0913f1fdaf5ae7cbd2f9afe2988e1`。旧编译/对拍仅绑定该 source，勿在原目录覆盖成新证明 |
| `search-gate-repair`，`research/search-gate-repair` | 同一 head 起点；8 个改/新文件、10 个测试草案，未编译/未执行。仅 whitespace diff check 通过；完整未验证源码已封存。先 review，再隔离 CNB 编译 |
| `model-search-gates`，`docs/deck-primary-gates` | [MoeNotes Draft #12](https://github.com/StarMoe-org/moenotes/pull/12)，目标 dev `23671aa16ac69814234860fcce226228a1e5c0eb`。交接前 head `750a236`，此文为后续文档提交；以实际 git/PR head 为准 |
| `meta-snap-ui` | [MoeNotes Draft #11](https://github.com/StarMoe-org/moenotes/pull/11)，head `66225909ee76a4717c245e9edfab5c605fa908c9`；相关 [Player Draft #16](https://github.com/empty-sekai/ournotes-player/pull/16)。正式接入前核最新目标路由/名称，不固定旧 `/tools/chart-data` |

S 修复涉及 `bonus.rs`、`lib.rs`、`live/skip.rs`、`search/{mod,power,tables,budget,gate_tests}.rs`：K=0→Input、统一合作式 deadline、Skip 全域 lower/P_UB 和非有限/绕回守卫。原生数值求值保留原行为，不将 MIN 改成饱和 MAX。尚需 Rust 类型/语法、独立 oracle、预算确定性控制、JP 真实 profile 影响统计；不能提前报告通过。微操搜索不能直接继承旧剪枝、缓存或等价类证明。

## 本地产物与恢复顺序

以下目录相对工作区基址，都是已有私有/忽略产物，不随公开 PR 发布游戏 payload 或凭证：

1. `helpers/native-pilot-prep/native-handoff-20261002.json`：原生负责人 handoff，8 份 sealed archive 身份、本轮 cue 文件与准确恢复入口；SHA `3fe91726f171ade3dbfbc59792d225ee0e5da4f2fa5a1c18bd87f0c159051165`。
2. `helpers/native-pilot-prep/cnb-working-checkpoints/native-working-checkpoint-20261002T004508Z.tgz`：935 文件、141,381,450 bytes、SHA `650ddb97f25ced277e7c2d5fbc77429e7e8e2f125cffb6f37a9d731212a46c86`，snapshot 时 changed=0。已取回并逐文件核验全部 935 项，readback 在同目录；这是工作备份，不能当完成 proof。
3. `helpers/search-gate-repair-checkpoint/checkpoint.json` 与 `source-unverified.tgz`：8 文件改动和完整源码，archive 596,462 bytes、SHA `1dbd43a677440b040085eb6564fa8efd0d83aad62b849dedd15147b0031879fc`。
4. `helpers/sound-clock-static/HANDOFF.md`：实际 Sound/CRI 静态调用与缓存合同。先绑定 matching APK 的插件和 ABI、真实初始化/handle，再由原 getter 取长度，不能手写缓存或拿最后音符代替。
5. `helpers/native-pilot-prep/jp-cue-bundle-py314/`：新官方 catalog 与正常 cue bundle、`catalog-and-transport-interpretation.json`；bundle SHA `9c8206cc8241dbd0a8bd0206769233b457f073db38a40be012f6b6685374a610`。77 文件 reader archive 和 cue 读取脚本仅准备完成，未上传/执行。
6. `helpers/browser-recognition-gate-audit/`：资产审计、原字数值 buffer 与 gzip、CNB 已同步 bundle。`probe-opencv-runtime.cjs` 是未验证研究脚本；所需资产在 `numeric-buffers/` 子目录，恢复时先核路径。未下载成功的 `opencv.js` 与缺失 report 不构成 WASM 能力证据。

恢复优先级：先领取外协物理 touch 的当前产物并核身份/范围；主线闭合真实 cue/正常 SkillInput/driver，再做技能/Snap/撃奏原生同输入整局差分。并行审核 S 草稿、编译及独立 oracle；M/S 通过后才正式接入公共账号/目标门面和浏览器闭环。

```powershell
git -C F:/ournotes-reverse/work/deck-improve-20261001/search-gate-repair status --short
```

先审核差异再编译；所有 Rust 编译、原生批量实验和无头浏览器继续在 CNB。新 source/lock/artifact 必须新记录身份，不复用旧 head 的绿色证据。

## CNB 交接状态

机器 `cnb-j3p-1k3s982pu`，8 核/16 GiB，启动分支 `jp-native-local-pilot8`，配置提交 `a3537e6`；容器 `workspace-pilot-1` 保留。WebIDE [入口](https://cnb.cool/emptysekai/ournotes-box/-/workspace/vscode-web/cnb-j3p-1k3s982pu-001) 保持打开。SSH 不保活，恢复者先运行 cnb-workspace 的 status/alive，并核实际 HTTP 客户端连接。不要新开机器或停止同机外协任务。

当前主线 `/workspace/cache/native-jp-104` 无本会话新实验；本会话的 Rust/search probe 容器均已退出。外协独立目录 `/workspace/cache/collab-microtiming/base` 已有真实任务：最后只读观察 PID 1213/1219 执行 `mt-e2c-factors-crossing`，1500s timeout。PID/状态随工作改变，必须当场重查；这只是运行状态，未审计其结论。不要因某个旧 PID 消失或查询超时而重启 case。

机器按 18 小时上限规划；当前实例已约 7 小时。接手者立即维护 WebIDE、在阶段结束封存/pull；不要依赖平台备份保留 `/workspace/cache`。不要输出 SSH 用户、私钥、Session 或 CNB token。官方配置只在本地读取，handoff 不包含凭证。
