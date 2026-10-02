# 浏览器识别：已有资产与待验证语义

2026-10-02，Draft。本文冻结浏览器研究输入和移植验收，不启动正式 UI 接入，也不解除 M/S/B。

## 当前资产可以复用什么

独立核验已有 JP `1.0.0.300/52355a9de56a475f691b10ef58acba58` 的 visual manifest、1,110 个文件 SHA、63 成员/64 Snap 身份集合，以及与原生研究同源 master 的 ID。两个 ONNX 与此前浏览器 WASM 可行性实验一致；图库按实际有序 `(kind,id)`、图像字节和 encoder 哈希重算 fingerprint 后一致。摘要见[资产审计](latest-browser-recognition-asset-audit.json)。

旧 122 卡图库不能作为该 JP 数据集：成员缺 61/62/63，Snap 缺 62/63/64，且旧 Snap 70 不在当前 JP 集合。它保留历史回归意义，正式运行不得静默回退到这个目录或按文件大小认定权重相同。

| 项目 | 已验证输入 | 浏览器状态 |
|---|---|---|
| encoder | 4,898,068 bytes；`[batch,3,160,128] → [batch,128]` | 已有 ORT Web 1.30.0 单线程 WASM 合成张量可行性；真实截图 tensor/retrieval 未验收 |
| fields | 1,356,782 bytes；`[batch,3,56,144] → [batch,106]` | 已有算子/形状对照；真实裁块、softmax/拒识未验收 |
| RootSIFT | 26,921×128 float32 descriptors、同序 points/owners | 已从实际 NPZ 无损导出 little-endian buffer，算法未移植 |
| 图库向量 | 127×128 float32，有序身份与 fingerprint 已核 | 无损原字导出；浏览器检索与拒识未验收 |
| 图像/模板 | 142 个最小运行文件共 22,133,066 bytes（含权重/catalog/127图像/12卡阶模板） | 静态资产已识别，未形成正式浏览器缓存/下载策略 |
| 数值 buffer | 解压 14,171,628 bytes，确定性 gzip 7,299,334 bytes | 压缩/解压后 SHA 一致；ORT/OpenCV WASM 运行库另计，不能报成全部下载量 |

训练字体和训练渲染器不因模型训练使用而自动列入每次运行下载。当前 mandatory fields 模型存在时 NumberReader 不走字体模板 fallback。运行模板是成员 `CardRank0..5` 和 Snap `snaplimit_0..5`，不能用角色立绘或展示卡框替代识别模板。

## 不能跳过的完整识别链

当前 BoxLens `2ea25d8` 中 `engine.py`、`inference.py`、`ocr.py`、`assets.py` 是语义来源。保留其角色：整屏 SIFT/RootSIFT → FLANN k2 与 ratio → affine RANSAC/几何/实际像素核验 → overlap 去重 → 有依据的网格补齐/图库 → 卡阶模板 → 参数模式与字段 → 多图冲突合并。

只传两份 ONNX 并按图库最高 embedding 接受所有卡，会改变定位、可见范围、拒识和未知身份语义，不能作为完整移植。OpenCV WASM 构建须实际提供当前用到的 SIFT、匹配与 affine/image 函数；不能从一个包能加载推导符号与算法都可用。可另做更快策略，但先以原链路同输入验收，并独立标明新策略覆盖与阈值。

## 输入、输出与拒识必须对齐

| 边界 | 源语义 | 必须验证 |
|---|---|---|
| 图片解码 | 解码 BGR 像素/shape 用于 source_id；文件 SHA 是另一身份 | JPEG/PNG/WebP、EXIF、ICC、透明/预乘、Canvas 与 OpenCV 色序；若像素不同如实记录 decoder/runtime，不伪造相同 source_id |
| 几何/裁块 | OpenCV resize/warpAffine、逆映射、border；成员212与Snap314比例及aspect-fill窗口 | 同一原图 bbox、卡面窗口与字段 patch 的坐标/像素对照，不能使用拉伸后的 UI 卡面代替输入 |
| encoder | BGR→RGB/NCHW、resize128×160、float32除255；有序 gallery | 同图 patch tensor、向量、分数/第二名margin、identity与拒识；operator容差不等于最终分类容差 |
| fields | patch144×56，106类；0=other，1..100=等级，101..105=特训；阈值.995且margin.5 | 某视图隐藏的字段为null；Snap不读特训；softmax/阈值边界、合法level上限和错误模式不能默填 |
| 索引 | 原有序owners与cards、points/descriptor同长度；float32/int32小端 | 长度/shape/dtype/endianness/id集合/哈希和所有owner范围；混版本或缺资产失败，不能错位匹配 |
| 合并 | `(kind,id)`，重复图保留观察事实；不同非null值产生conflict/最终null | 文件同名不同图、重复图、人工修正、来源/版本混合与冲突不丢失；不取最大值、不以最高置信度覆盖分歧 |

模型 confidence 是内部打分，尚未校准为真实正确概率。已有 Python 840 屏合成测试与十张同一用户真实回归不等于浏览器真实用户泛化；人工校对不能计入自动识别精度。

## 先做研究门槛，再正式接入

1. 冻结 JS/ORT/OpenCV WASM build、weights、catalog/索引/图像/模板、代码/阈值/decoder 的组成 manifest。先验证全部资产与每个数值 buffer；raw 与 transport SHA 分开。现有审计只含离线资产，没有认证运行库或浏览器检测。
2. CNB 同图 CPU/WASM fixture：从 decoded pixels、几何、patch、tensor、scores/fields到merge逐层对照。分别报告已接受值的精度、漏卡/漏字段、拒识、误接受和冲突，不只报 accepted accuracy。
3. 冻结后追加不同真实用户/设备/压缩/UI/新卡、未知身份、遮挡/渐隐/裁切数据。回归与独立泛化分开；不把模拟原生 mock 截图称真机像素一致。
4. B 正式放行前才接 OwnedSnapshot resolver：保留 observedOnly、unknown/conflict 和人工修正历史，ownedFacts与eligible/搜索排除分开；截图不能提供技能等级/VIP/角色Rank/全部持有覆盖。异步响应绑定 input revision 与全部来源身份。
5. 真机浏览器冷/热延迟、下载/缓存、峰值内存与取消实测。Worker 中限制 batch/并发并及时释放图像、ORT tensor和CV对象；适配单线程、无 WebGPU 的基线。不把 CNB CPU时间推算成手机 p95。

目标仍是截图上传到可靠推荐；文件准备、研究 loader 与 synthetic tensor通过仅推进前置证据。固定队伍、账号搜索和歌曲排行继续使用共享 evaluator，参见[主线门槛](primary-delivery-gates.md)。
