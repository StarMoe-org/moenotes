# 歌曲 meta 刷新与两曲源表回归

状态：2026-10-01。本次核对确认 TW 元数据快照的两曲原始评级门槛已改变；它不证明谱面字节或原生评分公式发生改变。代码方案仍为 Draft，不表示生产已经更新。

## 源与观察边界

当前线上 music-data 为 TW、客户端 1.0.1/25、master `0b21c9f4a3911370d5f981fb894c7544`，文件 SHA-256 `983896151d3ed69d9dfe26044225907e33be037e4b74589e110ded64780f8738`，85 首歌。

唯一 force/dry-run [36817548100](https://github.com/StarMoe-org/nnnotes/actions/runs/36817548100) 已完成 success，验证 main `c5f39f8` 的按源 resource version 固定 catalog 修复，未写生产。该任务读取 TW master `74639bc3f98486a22b1232f232213def`、241 文件。随后使用相同元数据服务与请求头读取 index、MasterManifest 和三张歌曲表；每个 decoded 文件 SHA 都与冻结 index 一致，manifest version 与 entry 一致。这是 **metadata 服务的已验证快照**，不是游戏 API Version 直接观察；最新 JP Version 查询仍不能据此标成成功。

新快照客户端 1.0.1、resource 1.0.0.201，86 首歌，新增 `100109`，未移除歌曲。它与旧失败任务缺少 `10010900` 资产的事实对应；新 main 完整 build/gates/dry-publish 已通过。Manifest SHA `5955c092fd1991f2996aad38bca6eea799e831907e7dee9c739895a03f7a587e`，index SHA `9c0083913f6189cda5c25eae2b6e4da8f5d39ced58bed692c8549083cd5d88c8`，decoded 文件映射 SHA `ce42c57606a197ff9d37ba8a2bbaffd61250eb2e8e3f92ca397f5cc55c5503cb`。

## 门槛差分与截图解释修正

表中顺序均为 C / B / A / S / SS；D 始终为 0。`requiredScore` 是原始单人门槛，`battleLiveRequiredScore` 是原始房间门槛；派生 `requiredPower` 不属于源表。

| 歌曲 / 原始字段 | 旧 TW 0b21… | 新 TW 74639… |
|---|---|---|
| 青春コンプレックス 100021 / 单人 | 415687 / 1204973 / 3429867 / 4638937 / 5637904 | 495117 / 1731771 / 4389644 / 6133727 / 7577522 |
| 青春コンプレックス 100021 / 房间 | 415687 / 1204973 / 3429867 / 4638937 / 5637904 | 879019 / 3064079 / 8031441 / 11405008 / 14303737 |
| Ave Mujica 100026 / 单人 | 432065 / 1174499 / 3210324 / 4318471 / 5660978 | 553488 / 1919628 / 4468859 / 6270852 / 7778519 |
| Ave Mujica 100026 / 房间 | 432065 / 1174499 / 3210324 / 4318471 / 5660978 | 863848 / 3208525 / 8108416 / 11897425 / 14630714 |

此前只能证明第二张截图数字匹配已保存 JP 单人表；**新 TW 源证明它同样匹配 TW 新版单人门槛**。因此不能继续把两图差异仅归因区服。现已确认同区 TW 的原始门槛变化，同时仍须核对截图的歌曲、单人/房间单位与显示场景。截图并未证明新版门槛是新的 note-score 系数。

两曲的 `MasterLiveMusic` 行与各自四个 `MasterLiveMusicScore` 行在此次旧/新 TW 对照中没有字段差分。尚未做两个 catalog 下谱面 TextAsset 原始字节/notes/events/fevers 的完整对照，也未据官方公告确认修复机制；不能声称谱面 bug 或原生评分改动已复现。对应匿名来源与逐字段报告见 `latest-tw-sentinel-diff.json`。

## 自动刷新与评分接入

[nnnotes Draft #7](https://github.com/StarMoe-org/nnnotes/pull/7) 以 manifest、decoded 文件映射、resource、客户端、模型/exporter 与消费端 pin 触发重建，默认独立检查 TW/JP；发布前复核源，避免过期结果覆盖新源。最新验证 **183 passed / 5 skipped**，workflow actionlint 通过。新的 rank 参数可按原始源导出并检查，不应等待完全无关的原生语义认证，也不应手工降低两曲排名。

[nnnotes Draft #8](https://github.com/StarMoe-org/nnnotes/pull/8) 增加 `nnnotes.replay-labels/1` 的 13 表标签资源与 manifest SHA 指针，使普通/撃奏技能、实际等级描述、条件目标与卡图编号随同源快照更新。它没有评分公式；两曲、五个 Snap 与任意技能 profile 的分数均交给同一个 Rust whole-live evaluator。最新客户端/新增效果语义的原生 gate 仍独立，标签、数据新鲜度、评分正确性不能互相替代。
