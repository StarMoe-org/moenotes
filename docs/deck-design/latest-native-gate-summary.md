# JP Android 1.0.4 / 10053 原生恢复与执行门禁

2026-10-01 在 CNB 完成。以下范围是 **offline-base；IFix 未加载**。线上实际生效 hotpatch 与当前 master 版本仍未认证；这份报告不声明最新线上计分模型等价。正式 SDK / UI 继续冻结。

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

通过最新原生 C API 实际取得 10 个目标 class 的字段 offset / type / flags、方法参数和返回类型。190/190 个方法的运行时 MethodInfo 首字 code pointer 与最新 dump 中相应 method entry 精确匹配，0 个 class unresolved。CardPower 的值类型大小与对齐另由 native `il2cpp_class_value_size` 读取。每个匹配 entry 附 64 字节代码前缀 SHA；它是明确长度的 entry 身份证据，不是完整函数语义 SHA。

这些分母分别是恢复区、字面量 offset、runtime boot、目标 class 与方法身份。**它们都不是已通过的计分、技能、击奏或失败生命周期用例数**。这些机制继续按 [模型矩阵](model-validation.md)逐项验证，并绑定单独的输入与观察字段分母。

## 允许继续的研究域

可以以已保存的 2026-09-30 JP master / resource 快照，开展“JP Android 1.0.4 / 10053 offline-base + saved JP snapshot”原生对照；明确冻结来源，不称 2026-10-01 当前线上版本。先做真实 entry 的 direct / runtime-invoke ABI pilot、卡力和计分原语，再扩展整场状态与随机 / 撃奏 / 失败生命周期。待单 worker 的准确性、负控制、耗时与 RSS 通过后，才将独立 case queue 分散到更多 worker。

本轮恢复工具和精简原始门禁保存在 `work/deck-improve-20261001/native-jp-10053`；此摘要不包含恢复 key、私人 API URL、账号数据或完整游戏 payload。
