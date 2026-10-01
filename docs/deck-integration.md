# 卡池截图与组卡：MoeNotes 接入方案（Draft）

MoeNotes 是玩家入口。`ournotes-boxlens` 负责截图中的身份与可见培养字段，`ournotes-deck` 负责游戏规则、计分和搜索，MoeNotes 负责校对、目标选择、结果解释与本地保存。各层复用已有版本化契约，不在页面里另写一套评分公式。

这个 PR 提供运行端选择、数据版本绑定和 Worker 消息契约，以及对应回归。它尚未添加上线路由、模型运行时、权重附件或组卡页面；不会把可行性方案标成已上线功能。上游依赖是 [BoxLens PR #1](https://github.com/empty-sekai/ournotes-boxlens/pull/1) 与 [Deck PR #3](https://github.com/empty-sekai/ournotes-deck/pull/3)，后续发布需要固定具体 commit 和文件 SHA256。

## 玩家路径

```mermaid
flowchart LR
  A[选择成员和留影截图] --> B[浏览器识别 Worker]
  B --> C[累积卡池与人工校对]
  C --> D[确认培养与完整持有集合]
  D --> E[选择歌曲、打法、目标]
  E --> F[Rust WASM 搜索 Worker]
  F --> G[五槽队伍、队长、留影与结果依据]
```

1. 玩家可以分批导入等级、特训、留影视图；重复截图去重。冲突保留原始来源，不能取较大的数字。选择文件不等于上传服务器，本地运行时只在设备里读图。
2. 校对页展示身份、等级、卡阶、特训、技能等级及缺失字段，支持替换误识别身份、排除和补漏。修正记录与原始识别分别保存。
3. 全局培养采用可复用玩家档案：角色 Rank、道具、VIP、回忆、活动上下文。截图未出现的字段不会默认为真实的最低或最高培养；批量设值需要玩家主动选择并显示假设。未确定完整持有集合时，结果标为“已确认卡池中的推荐”。
4. 推荐页首先选歌曲和难度，再选玩家目标。直接展示五个物理槽位、第三槽队长、每槽留影与无留影状态。演出顺序遵循游戏的随机打乱，不能提示玩家靠排演出顺序取得保证收益。
5. 结果先提供一组合法且精确计分的队伍，再允许继续优化。显示耗时、已评估候选、目标、条件、与玩家当前队伍的差值。每个卡池/校对/目标变更增加 `inputRevision`；旧响应不得恢复已失效队伍。

## 推荐目标

| 玩家意图 | Deck 指标 | 需要玩家声明 | 结果含义 |
|---|---|---|---|
| 单曲冲分 | `score` | Live 模式、谱面、打法、有限根分布 | 声明条件下的结算分数期望；理论 AP/Just 明确标示 |
| 达到目标分 | `scoreAtLeast` | 目标分与同上条件 | 达标概率，不等于平均分最高 |
| 达标后不追溢出分 | `cappedScore` | 分数上限 | `E(min(score, threshold))`；用于比较未达标损失 |
| 分数与结算血量 | `scoreAndLifeAtLeast` | 完整判定流、目标分、最低结算血量 | 同时满足两个终值的概率；不是已验证的失败/续关/退出模型 |
| 跳过演出 | `score` + `skip` | 歌曲、现有培养 | 游戏跳过公式下的分数，与手打 Live 分开 |
| 活动积分 | `clientEventPoints` | 活动时钟、计数与模式 | 客户端预估积分；评分榜与累计积分不能混为同一目标 |
| 指定奖励数量 | `conditionalClientEventItems` | 明确奖励选择与完整上下文 | 所给奖励条件下的客户端数量，服务器实际选择另有边界 |
| 查看综合力 | `power` | 可选歌曲/活动加成 | 队伍属性诊断指标，不能替代 Live 分数排序 |

“稳过谱”需要失败生命周期与人的失误分布，当前不能由一个准确率百分比直接证明。“提升卡片最划算”需要经核验的培养成本与玩家预算；在该契约完成前只使用已确认培养，不静默假设满级。Battle/Arena 需要外部排名确认时间线；Solo 第一名、固定假设名次和真实对手排名必须分别标识。

## 浏览器运行决策

可以把权重发给浏览器，但需要分两条链路。

| 部件 | 首选实现 | 当前已具备 | 尚需接入与验证 |
|---|---|---|---|
| 身份编码与字段识别 | ONNX Runtime Web，WASM 基础后端，WebGPU 可选加速 | `encoder.onnx` 4,898,068 B；`fields.onnx` 1,356,782 B，合计约 6.25 MB 原始权重 | 浏览器模型加载/张量/前后处理一致性与清晰/压力截图验收 |
| 截图定位、裁切与匹配 | 专用 Worker，移植现有图像处理 | Python OpenCV SIFT/FLANN、模板/布局处理、索引与冲突合并 | 不能只传两份 ONNX 就声称完整 BoxLens；需确认自建 OpenCV WASM 支持所需算法，或单独训练定位模型并重新测覆盖 |
| 固定队伍复算 | 原 Rust 规则编译 WASM | 上游已有 `wasm/replay` 与原生/WASM 对拍 | MoeNotes 数据/Worker/渲染适配 |
| 完整推荐 | 原 Rust 搜索编译 WASM，独立 Worker | 生产 JSON 推荐 API 与有限分布搜索 | 新增 recommendation WASM export；统一浏览器时钟；取消/渐进输出与实际浏览器门禁 |
| 候选预筛 | Rust WASM；以后再评估 GPU 预筛 | 综合力 warmup、随机/局部提案与精确逐候选模拟 | 大池/手机延迟基准；统计权重不能取代技能、血量与随机交互 |

ONNX Runtime 官方支持 [WASM 和 WebGPU](https://onnxruntime.ai/docs/tutorials/web/ep-webgpu.html)。WebGPU 的启用以实际能力、模型算子与设备测试为准；不能仅凭 `navigator.gpu` 存在认定模型可用。轻量模型的 GPU 上传/读回开销可能超过计算收益，先测热启动与整批截图耗时。

2026-10-01 的 [实际浏览器 smoke 报告](evidence/boxlens-onnx-wasm-20261001.json) 已验证现有两份权重可直接在 Chromium 153 + ONNX Runtime Web 1.30.0 的单线程 WASM 中运行：batch 1/8 共四组相同合成 float32 张量对照 Python CPU，最大绝对误差分别约 `5e-7`（encoder）与 `1.53e-5`（fields），按 `atol=1e-5, rtol=1e-4` 无不一致元素。云 CPU 上热 batch-1 encoder 5.7–7.0 ms、fields 3.5–3.6 ms。这只证明模型算子/形状/runtime 可行，不是完整截图准确率、WebGPU、手机 p95 或逐位浮点等价证明。

WASM 计分保留 Rust 的整数和声明 binary32 运算。暂不把精确计分改写成 GPU shader，避免引入新的浮点、取整和随机顺序差异。已有 WASM replay 对拍不是完整搜索可用的证明：目前多个搜索路径仍用 `std::time::Instant`，现有 bridge 没有导出 `recommend`。浏览器版本需替换全部 deadline/计时路径，并从 JSON 字节建会话，绕过 CLI 文件系统。参见 [Rust 目标平台限制](https://doc.rust-lang.org/stable/rustc/platform-support/wasm32-unknown-unknown.html)。

默认单 Worker + WASM，避免先要求站点全局跨源隔离。ONNX 多线程需要 [crossOriginIsolated](https://onnxruntime.ai/docs/tutorials/web/env-flags-and-session-options.html)；启用前需检查 MoeNotes 的图片、音频、嵌入播放器与第三方资源。同步搜索期间 `postMessage(cancel)` 无法中断同一个阻塞调用：第一阶段通过终止专用 Worker 取消，第二阶段实现分片 `step`/进度快照，保留已完成候选。不能把 UI 的取消按钮当作引擎已支持优雅取消。

## 文件分发与缓存

用公开发布产物的 manifest 固定 region、masterVersion、模型/索引/DeckData SHA256、格式、文件大小、输入输出定义与相对资源路径。权重与 JS/WASM runtime 版本绑定；游戏图像和 master 沿用站点资源发布管线，不提交到源码仓库。不能把当前约 120 MB 的 Python 运行目录原封不动发给手机，它包含原生模板、图库和生产/复现资源，需要导出最小浏览器包。

- 首屏不下载模型。打开卡池工具才按需加载 runtime 和约 6.25 MB 权重，识别图库另计。
- DeckData 分成区服规则核心与按歌曲加载的谱面；卡池和识别数据必须绑定同区服、同一 master 与实际文件哈希。跨区服重识别/迁移需要明确映射依据。
- 模型、索引和谱面进入现有按内容哈希的浏览器缓存，沿用容量上限与清理入口；玩家档案独立存储、导入导出，不因清模型缓存丢失。新存储类型按 AGENTS.md 补全五个核心 locale。
- 权重、下载进度、缓存占用与缺少 WebGPU 时的 WASM 路径对玩家可见。预期速度必须来自冷/热浏览器实测，不能从本机 Python 或 64 核 CNB 推算手机速度。

## 接口与回退

`src/lib/deck/runtime-plan.ts` 定义运行端选择和消息绑定。浏览器完整识别能力、ONNX provider 和浏览器完整搜索是三个独立 capability，不能互相代替。远端识别与远端搜索也分别要求截图上传/卡池上传选择；本地失败不自动上传。可选远端服务采用有界队列、取消和原始输入绑定，运行同一 Rust 模型。该 Draft 不定义未经实现的生产服务 URL。

Worker 传输 `rosterJson`、`requestJson`、`resultJson` 原始 UTF-8 文本。不能先经过 `JSON.parse`/`JSON.stringify` 丢失超过 `2^53` 的整数、活动时钟或明确 f32 数值 token；语法与重复键由严格边界校验。大文件用 Transferable ArrayBuffer 降低拷贝，首版协议文本用于保证输入语义。消息绑定 `jobId`、`inputRevision` 和 dataset identity，迟到响应及跨版本响应丢弃。

搜索返回 `Complete`/`TimedOut`/candidate termination 和 optimality 原样保留。“Complete”仅是所给卡池、约束、打法、外部条件、有限根分布下的证明；候选策略是精确计分的启发式推荐。平均分、范围、P10/P50/P90、达标概率使用整数质量和精确分数，展示层不参与排名。实际 TickCount 分布未知时不能称无条件最优。

## 实施与验收

1. 合入契约后发布上游版本化 SDK：推荐 WASM 导出、可用 clock、手动卡池/固定队伍复算和单曲 power/skip 对拍；此阶段不依赖 OCR。
2. 按 MoeNotes route registry 添加卡池工具入口与 React island；复用卡面、名称本地化与现有缓存。先把校对/玩家档案/目标/五槽结果接齐，核心五语言同批完成。
3. 移植完整截图识别，发布最小 manifest；清晰截图、重叠批次、冲突、遮挡、未知新卡、误识别纠正与漏卡补充均验收。两份 ONNX 的可运行 smoke 只覆盖神经网络步骤。
4. 接入 bounded Live 搜索：产品目标先定热启动 2 秒内有首组候选、10 秒优化预算；这是待测验收目标。低端手机未达到时提供缩小范围/后台继续/明确远端选择，不能承诺“瞬间全池最优”。
5. 浏览器端和原生端对相同 UTF-8 输入逐项比较槽位、留影、分数、逐根 outcome、精确期望和终止状态。必须包括大于 `2^53` 整数、不同 FPS、遗漏判定、撃奏随机、技能改变排序、取消与过期响应。
6. 大池（真实区域全持有仅作声明 mock）与 7 成员/3 留影样本分别记录冷启动下载量、热启动 p50/p95、峰值内存、前台交互和推荐质量。小样本穷举差分证明不能替代大池手机速度验收。

数值模型的已验收范围以 Deck 的原生验证 manifest 为准；离线 1.0.1-25 证据不能自动认证 JP 1.0.4、所有 IFix、触控投影、完整失败/续关和服务器奖励行为。该方案通过共用原 Rust 模型减少漂移，同时保留尚未验证边界。
