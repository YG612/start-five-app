# “先做5分钟”移动端发布准备草案

> **NON-BINDING / RELEASE NOT ATTEMPTED**  
> **非绑定草案 / 未尝试发布**

文档日期：2026-08-05  
适用范围：Android 与 iOS 商店发布准备、发布候选验收和分阶段上线门禁。  
当前结论：**NO-GO（仅表示证据尚未建立，不表示实现失败）**。

本文件是发布工作清单，不是测试报告、合规意见、商店审核承诺或发布授权。本轮未读取项目、未运行构建、未访问开发者账号、未检查二进制，也未在设备、模拟器、TestFlight 或商店轨道上执行验证。除“已知上下文”外，所有条目均为 `NOT VERIFIED`、`TBD` 或 `PENDING macOS`；不得据此宣称已经实现、已经通过或可以发布。

---

## 1. 已知上下文与证据边界

下表只记录上游提供的已知事实，仍须由发布候选源码、CI 产物和平台控制台证据复核。

| 项目 | 已知值 | 当前状态 | 不能推出的结论 |
|---|---|---|---|
| Android application ID | `com.startfive.app` | `KNOWN-UNVERIFIED` | 未证明 release AAB 使用该 ID，也未证明商店占位或签名归属 |
| Android 应用标签 | `先做5分钟` | `KNOWN-UNVERIFIED` | 未证明所有语言、图标、通知和商店名称一致 |
| Android SDK | compile 36 / target 36 / min 24 | `KNOWN-UNVERIFIED` | 未证明 release manifest、依赖兼容性或商店合规 |
| JavaScript 引擎 | Hermes 已启用 | `KNOWN-UNVERIFIED` | 未证明 release source map、崩溃还原或运行稳定性 |
| React Native 架构 | New Architecture 已启用 | `KNOWN-UNVERIFIED` | 未证明所有原生依赖在 release/arm64 下兼容 |
| Android debug APK | 据报已签名且 zipalign | `DEBUG-ONLY / NOT RELEASE EVIDENCE` | **不是** release AAB、Play App Signing、upload key 或生产签名证据 |
| Android 运行环境 | 无物理设备、无 AVD | `BLOCKED` | 没有设备级功能、权限、升级、性能或无障碍证据 |
| iOS 构建环境 | 当前为 Windows | `PENDING macOS` | 无法据此构建、归档、签名、上传或 TestFlight 验证 iOS |

### 1.1 状态与优先级

| 标记 | 含义 |
|---|---|
| `P0` | 发布阻塞项；未通过或无可追溯证据时必须 `NO-GO` |
| `P1` | 上线前质量项；未关闭时必须形成书面风险接受、负责人和期限 |
| `NOT VERIFIED` | 尚无可审计证据，不能视为通过 |
| `PENDING macOS` | 必须在受控 macOS/Xcode 环境完成，Windows 侧不得代签结论 |
| `TBD` | 所有者、阈值、路径或策略尚未决定 |

### 1.2 证据合格规则

每个验收 ID 的证据至少包含：版本、commit/tag、CI run、构建时间、平台/设备、执行者、原始日志或截图、产物 SHA-256、结论和复核人。屏幕截图不能替代机器日志；人工修改过的日志不能作为唯一证据。敏感密钥、令牌、个人信息和未脱敏用户内容不得进入证据包。

建议证据根目录（本轮未创建）：

```text
release-evidence/<version>-<build>/
  manifest.json
  android/
  ios/
  privacy-legal/
  security-sbom/
  store-listing/
  qa-device-matrix/
  accessibility/
  performance-battery/
  rollout-monitoring/
```

---

## 2. 产品身份与版本不可变策略

### 2.1 策略

- Android `applicationId` 以 `com.startfive.app` 为候选正式身份。商店应用建立、生产签名绑定或首次发布后不得静默修改；若必须更改，应按“新应用 + 明确迁移/下架/用户沟通”方案处理。
- iOS `Bundle ID` 尚未提供。必须在 macOS/Apple Developer 环境决定并注册 Explicit App ID；一经签名、TestFlight 或商店记录绑定，按不可变身份管理。不得默认它必然等于 Android application ID。
- 产品显示名候选为“先做5分钟”。首次 release candidate 冻结后，任何改名都须由 Product/Store Operations 批准，并同步应用标签、启动界面、通知、隐私政策、截图和商店文案；改名不得伪装成包身份变更。
- Android `versionCode` 必须严格单调递增，`versionName` 必须与发布说明和版本标签一致。iOS `CFBundleVersion` 必须满足 App Store Connect 构建号规则并可追溯，`CFBundleShortVersionString` 与产品版本一致。
- 每个二进制必须能反查到唯一 commit、依赖锁文件、构建工具链、签名身份和 SBOM。发布后不得用同一版本号替换内容不同的产物。

### 2.2 验收门禁

| ID | 优先级 | 可验证验收标准 | 证据路径 | 负责人 | 状态 |
|---|---|---|---|---|---|
| REL-ID-P0-001 | P0 | 发布负责人签署身份决策记录：Android ID、iOS Bundle ID、产品名、开发者账号/Team ID 与所有权均明确 | `TBD/identity-decision.md` | Release Manager + CEO | NOT VERIFIED |
| REL-ID-P0-002 | P0 | release manifest、已签名产物和商店后台三方显示同一 Android application ID | `TBD/android/identity/` | Android Owner | NOT VERIFIED |
| REL-ID-P0-003 | P0 | iOS target、Explicit App ID、profile、archive 与 App Store Connect Bundle ID 完全一致 | `TBD/ios/identity/` | iOS/macOS Owner | PENDING macOS |
| REL-ID-P0-004 | P0 | Android `versionCode` 和 iOS build number 均高于对应商店最近上传值，且映射到唯一 commit | `TBD/version-provenance.json` | Release Manager | NOT VERIFIED |
| REL-ID-P1-005 | P1 | 产品名及本地化在桌面图标、启动页、系统设置、通知和商店素材中一致，无截断或错误语言 | `TBD/store-listing/name-matrix/` | Product + QA | NOT VERIFIED |

---

## 3. Android 发布门禁

### 3.1 Release 构建与产物

| ID | 优先级 | 可验证验收标准 | 证据路径 | 负责人 | 状态 |
|---|---|---|---|---|---|
| AND-BLD-P0-001 | P0 | 由受控 CI 从干净 checkout 生成 **release AAB**；不以 debug APK 代替商店产物 | `TBD/android/build/release.aab` | Android Owner | NOT VERIFIED |
| AND-BLD-P0-002 | P0 | release AAB 的 application ID、label、min/target SDK、versionCode/versionName 与批准记录一致；当前候选值重新复核 | `TBD/android/build/bundle-inspection.txt` | Android Owner | NOT VERIFIED |
| AND-BLD-P0-003 | P0 | 依赖锁定；release 构建日志记录 JDK、Gradle、AGP、Node、包管理器、React Native、Hermes 与 NDK 版本 | `TBD/android/build/toolchain.json` | Android Owner | NOT VERIFIED |
| AND-BLD-P0-004 | P0 | AAB 通过官方 bundle/签名检查，未包含调试开关、测试 endpoint、示例密钥、明文凭据或调试菜单 | `TBD/android/build/inspection/` | Android + Security | NOT VERIFIED |
| AND-BLD-P1-005 | P1 | 第二次干净构建得到可解释的一致性结果；若不能位级复现，记录非确定字段与供应链风险 | `TBD/android/build/reproducibility.md` | Build/CI Owner | NOT VERIFIED |
| AND-BLD-P0-006 | P0 | 提交当日复核 Google Play 当前 target API、新应用格式和原生库政策；不能仅依赖本草案日期 | `TBD/android/policy/policy-check.md` | Store Operations | NOT VERIFIED |

注：截至本草案日期，官方 Google Play 帮助页说明自 2026-08-31 起新应用和更新需以 Android 16（API 36）或更高版本为目标。已知 `target 36` 只是候选配置匹配，仍须以提交当日政策及实际 release manifest 为准。

### 3.2 发布签名与机密

| ID | 优先级 | 可验证验收标准 | 证据路径 | 负责人 | 状态 |
|---|---|---|---|---|---|
| AND-SIGN-P0-001 | P0 | 书面决定 Play App Signing 与 upload key 模型，记录证书 SHA-256 指纹和账号所有者 | `TBD/android/signing/key-register.md` | Release + Security | NOT VERIFIED |
| AND-SIGN-P0-002 | P0 | release AAB 未使用 debug key；签名验证输出与批准的 upload certificate 一致 | `TBD/android/signing/verify.txt` | Android + Reviewer | NOT VERIFIED |
| AND-SIGN-P0-003 | P0 | keystore、口令、服务账号令牌不在仓库、AAB、日志或普通聊天中；仅由受控 secret manager 注入 | `TBD/security/secret-scan.txt` | Security Owner | NOT VERIFIED |
| AND-SIGN-P0-004 | P0 | upload key 有加密备份、最小权限、双人恢复演练、轮换/失陷响应和人员离职流程 | `TBD/android/signing/recovery-drill.md` | Security + Release | NOT VERIFIED |
| AND-SIGN-P1-005 | P1 | CI 发布权限与日常开发权限分离，生产上传需审批且有不可抵赖审计日志 | `TBD/android/signing/ci-access-review.md` | Security Owner | NOT VERIFIED |

### 3.3 R8/ProGuard、Hermes 与符号化

| ID | 优先级 | 可验证验收标准 | 证据路径 | 负责人 | 状态 |
|---|---|---|---|---|---|
| AND-SYM-P0-001 | P0 | 明确 release 的 R8 minify/resource shrink 策略；启用时所有关键路径在优化后构建上回归，禁用时形成体积/暴露风险接受 | `TBD/android/optimization/decision.md` | Android Owner | NOT VERIFIED |
| AND-SYM-P0-002 | P0 | ProGuard/R8 keep rules 来自最小必要集合；反射、序列化、原生模块及 New Architecture 绑定在 release 下验证 | `TBD/android/optimization/keep-rules-review.md` | Android + Reviewer | NOT VERIFIED |
| AND-SYM-P0-003 | P0 | `mapping.txt`、原生 debug symbols、Hermes/JavaScript source map 与 AAB/build ID 一一关联并安全留存 | `TBD/android/symbols/manifest.json` | Android + Observability | NOT VERIFIED |
| AND-SYM-P0-004 | P0 | 用人工制造的 Java/Kotlin、native（如适用）和 JS/Hermes 崩溃验证 retrace/symbolicate 能还原到正确版本源码 | `TBD/android/symbols/symbolication-test.md` | QA + Observability | NOT VERIFIED |
| AND-SYM-P1-005 | P1 | 监控上传的符号/映射不公开暴露源码或凭据，访问与保留期已审批 | `TBD/security/symbol-retention.md` | Security Owner | NOT VERIFIED |

### 3.4 ABI、64 位与原生库

| ID | 优先级 | 可验证验收标准 | 证据路径 | 负责人 | 状态 |
|---|---|---|---|---|---|
| AND-ABI-P0-001 | P0 | 检查 AAB split，包含产品声明支持的 64 位 ABI（至少对实际支持设备含 `arm64-v8a`），无仅 x86/debug 的误发布 | `TBD/android/abi/bundle-report.txt` | Android Owner | NOT VERIFIED |
| AND-ABI-P0-002 | P0 | 每个随包原生 `.so` 的 ABI、来源、版本、许可证和 hash 进入 SBOM；无未知或重复冲突库 | `TBD/security-sbom/native-libs.json` | Android + Security | NOT VERIFIED |
| AND-ABI-P0-003 | P0 | 在 arm64 实机安装 Play 生成的 APK split 并跑完核心路径；模拟器结果不能替代 | `TBD/qa-device-matrix/android-arm64/` | QA Owner | BLOCKED—NO DEVICE |
| AND-ABI-P0-004 | P0 | 提交当日验证 Google Play 对 64 位、页面大小及原生库的现行要求，依赖扫描无不兼容项 | `TBD/android/policy/native-policy-check.md` | Android + Store Ops | NOT VERIFIED |

### 3.5 图标、单色图标与启动体验

| ID | 优先级 | 可验证验收标准 | 证据路径 | 负责人 | 状态 |
|---|---|---|---|---|---|
| AND-UI-P0-001 | P0 | adaptive icon 前景/背景在圆形、圆角方形、方形等常见 mask 下不裁切、不留错误白边 | `TBD/android/visual/icon-mask-sheet.png` | Product Design + QA | NOT VERIFIED |
| AND-UI-P1-002 | P1 | Android 13+ monochrome icon 已提供并在主题图标/深浅背景上可辨识 | `TBD/android/visual/monochrome-icon.png` | Product Design | NOT VERIFIED |
| AND-UI-P0-003 | P0 | Android 12+ SplashScreen 与首屏衔接无双重启动页、闪白、拉伸、品牌错色或明显阻塞 | `TBD/android/visual/splash-recordings/` | Android + QA | NOT VERIFIED |
| AND-UI-P1-004 | P1 | launcher、系统设置、最近任务、通知小图标和 Play listing 图标符合各自素材规格 | `TBD/android/visual/icon-matrix/` | Product + Store Ops | NOT VERIFIED |

### 3.6 通知权限与精确闹钟策略

| ID | 优先级 | 可验证验收标准 | 证据路径 | 负责人 | 状态 |
|---|---|---|---|---|---|
| AND-NOTIF-P0-001 | P0 | Android 13+ `POST_NOTIFICATIONS` 在用户可理解的情境请求；首次拒绝、再次拒绝、永久拒绝、系统设置恢复均有可用路径 | `TBD/android/permissions/notification-matrix/` | Android + UX + QA | NOT VERIFIED |
| AND-NOTIF-P0-002 | P0 | 拒绝通知后核心“5 分钟任务”数据和计时流程仍可完成；不循环弹窗、不以暗黑模式胁迫授权 | `TBD/android/permissions/notification-denied.mp4` | QA Owner | NOT VERIFIED |
| AND-NOTIF-P1-003 | P1 | 通知 channel 名称、重要性、声音/震动与用户设置一致；点击、清除、重复和过期通知均验证 | `TBD/android/notifications/channel-tests/` | Android + QA | NOT VERIFIED |
| AND-ALARM-P0-004 | P0 | 产品决定是否确需精确闹钟；若不具备政策资格，不声明受限 `USE_EXACT_ALARM`，采用 inexact/WorkManager 等可接受降级 | `TBD/android/alarms/policy-decision.md` | Product + Android + Legal | NOT VERIFIED |
| AND-ALARM-P0-005 | P0 | 如使用 `SCHEDULE_EXACT_ALARM`，运行前检查 special access；默认拒绝、撤销、重启、时区/DST/手动改时均不会崩溃或丢任务 | `TBD/android/alarms/state-matrix/` | Android + QA | NOT VERIFIED |
| AND-ALARM-P1-006 | P1 | 在 Doze、省电模式和至少两个 OEM 后台限制环境验证提醒的用户可理解精度与降级说明 | `TBD/performance-battery/alarm-oem/` | QA Owner | BLOCKED—NO DEVICE |

### 3.7 备份、设备迁移与数据提取规则

| ID | 优先级 | 可验证验收标准 | 证据路径 | 负责人 | 状态 |
|---|---|---|---|---|---|
| AND-DATA-P0-001 | P0 | 明确 `android:allowBackup`、API 31+ `data-extraction-rules` 与兼容旧版本规则；行为与隐私承诺一致 | `TBD/android/backup/manifest-review.md` | Android + Privacy | NOT VERIFIED |
| AND-DATA-P0-002 | P0 | 对任务内容、完成记录、诊断数据、数据库、偏好、token、密钥、通知句柄逐项决定备份/迁移/排除；凭据和设备绑定秘密不得意外备份 | `TBD/android/backup/data-classification.csv` | Privacy + Security + Android | NOT VERIFIED |
| AND-DATA-P0-003 | P0 | 实测云备份恢复与设备到设备迁移；恢复到新版本、旧 schema、无权限和部分损坏数据时不崩溃、不静默清空 | `TBD/android/backup/restore-tests/` | QA Owner | BLOCKED—NO DEVICE |
| AND-DATA-P1-004 | P1 | 用户能理解哪些数据仅本机、哪些可恢复；清除数据、注销/删除账号（如有）和系统备份后的残留边界有说明 | `TBD/privacy-legal/backup-disclosure.md` | Product + Privacy | NOT VERIFIED |

### 3.8 Google Play Data safety 与商店资料

| ID | 优先级 | 可验证验收标准 | 证据路径 | 负责人 | 状态 |
|---|---|---|---|---|---|
| AND-PLAY-P0-001 | P0 | 从最终 AAB、SDK 清单和实际网络流量建立数据字典：收集/共享/临时处理/必需/可选/关联身份/用途逐项一致 | `TBD/privacy-legal/data-inventory.csv` | Privacy + Android | NOT VERIFIED |
| AND-PLAY-P0-002 | P0 | Play Data safety 表、隐私政策、应用内告知、权限和二进制行为逐字段一致，含所有第三方 SDK | `TBD/privacy-legal/play-data-safety-review.md` | Privacy + Store Ops | NOT VERIFIED |
| AND-PLAY-P0-003 | P0 | 隐私政策 URL 长期可访问、无需登录、版本化并含联系/删除方式；表单不存在未经证实的“零收集”声明 | `TBD/privacy-legal/privacy-url-check.txt` | Privacy + Legal | NOT VERIFIED |
| AND-PLAY-P0-004 | P0 | 内容分级、目标受众/儿童、广告、新闻、健康/金融等适用声明由产品和法律复核 | `TBD/store-listing/play-declarations.md` | Product + Legal + Store Ops | NOT VERIFIED |
| AND-PLAY-P1-005 | P1 | 应用名、短/长描述、图标、feature graphic、手机/平板截图（按支持范围）、支持邮箱和更新说明齐全且不夸大 | `TBD/store-listing/android/` | Store Operations | NOT VERIFIED |
| AND-PLAY-P1-006 | P1 | 商店截图来自 release 候选，覆盖核心流程、深色/大字体（如宣传），不含真实个人信息或内部环境 | `TBD/store-listing/android/screenshot-provenance.md` | Product + QA | NOT VERIFIED |

### 3.9 Android 设备、升级与质量矩阵

最低建议矩阵不是“全部组合穷举”，而是必须建立风险覆盖。最终范围由 QA 负责人签署。

| ID | 优先级 | 可验证验收标准 | 证据路径 | 负责人 | 状态 |
|---|---|---|---|---|---|
| AND-QA-P0-001 | P0 | 至少覆盖 API 24、26、30、31、33、34、35、36；arm64 实机为必选，模拟器只作补充 | `TBD/qa-device-matrix/android-matrix.csv` | QA Owner | BLOCKED—NO DEVICE/AVD |
| AND-QA-P0-002 | P0 | 覆盖小屏/大屏、浅色/深色、字体放大、中文/长文本、旋转（若支持）、低内存和进程被杀恢复 | `TBD/qa-device-matrix/android-layout-state/` | QA Owner | NOT VERIFIED |
| AND-QA-P0-003 | P0 | 覆盖全新安装、上一生产版升级、跨 schema 升级、中断升级、降级/回滚尝试；数据不丢失且失败可恢复 | `TBD/qa-device-matrix/android-upgrade/` | QA + Data Owner | NOT VERIFIED |
| AND-QA-P0-004 | P0 | 离线、弱网、DNS/TLS 失败、服务器错误（如适用）、磁盘满、数据库损坏/截断时核心数据有保护和可解释恢复 | `TBD/qa-device-matrix/android-resilience/` | QA + Android | NOT VERIFIED |
| AND-QA-P1-005 | P1 | 至少覆盖两类主流 OEM 的后台、电池、通知与存储差异；记录设备型号/系统补丁 | `TBD/qa-device-matrix/android-oem/` | QA Owner | BLOCKED—NO DEVICE |

### 3.10 Android 性能与电池

数值阈值必须在 release candidate 前根据设备档位和产品目标填写，`TBD` 本身不能通过 P0。

| ID | 优先级 | 可验证验收标准 | 证据路径 | 负责人 | 状态 |
|---|---|---|---|---|---|
| AND-PERF-P0-001 | P0 | 在 release/arm64 实机记录冷启动、热启动、首个可交互时间；阈值 `TBD` 并获 Product/QA 批准 | `TBD/performance-battery/android-startup/` | Android + QA | BLOCKED—NO DEVICE |
| AND-PERF-P0-002 | P0 | 大数据量下任务创建、列表、完成/撤销、恢复与启动无不可接受卡顿；p95/p99 阈值 `TBD` | `TBD/performance-battery/android-interactions/` | Android + QA | NOT VERIFIED |
| AND-PERF-P0-003 | P0 | 5 分钟计时在前台/后台、进程回收、锁屏、Doze、时区/DST 变化后以绝对时间恢复，无累计漂移 | `TBD/performance-battery/android-timer/` | Android + QA | BLOCKED—NO DEVICE |
| AND-PERF-P0-004 | P0 | 待机与计时能耗、wake lock、alarm/job 次数符合批准阈值；无无限循环、频繁唤醒或后台保活滥用 | `TBD/performance-battery/android-energy/` | Android + QA | BLOCKED—NO DEVICE |
| AND-PERF-P1-005 | P1 | 记录内存峰值、GC、OOM、ANR、卡顿帧与安装体积，和上一个候选版比较并解释回归 | `TBD/performance-battery/android-regression.md` | Android + QA | NOT VERIFIED |

---

## 4. iOS 发布门禁——全部待 macOS/Xcode

> 本节所有项目当前统一为 **`PENDING macOS`**。Windows 环境不能产出可接受的 iOS archive、签名、设备验证、TestFlight 上传或 App Store 提交证据。

### 4.1 Bundle ID、账号与签名

| ID | 优先级 | 可验证验收标准 | 证据路径 | 负责人 | 状态 |
|---|---|---|---|---|---|
| IOS-ID-P0-001 | P0 | 决定不可变 Bundle ID，注册 Explicit App ID，并与 Xcode target、profile、archive 和 App Store Connect 一致 | `TBD/ios/identity/` | iOS/macOS Owner | PENDING macOS |
| IOS-ID-P0-002 | P0 | Apple Developer Program 团队、Team ID、Account Holder/Admin/App Manager 角色与应急联系人有书面归属 | `TBD/ios/account-ownership.md` | Release Manager | PENDING macOS |
| IOS-SIGN-P0-003 | P0 | Distribution signing/certificate/profile 由受控机制管理，私钥不进仓库/日志，恢复与撤销流程已演练 | `TBD/ios/signing/` | iOS + Security | PENDING macOS |
| IOS-SIGN-P0-004 | P0 | Release archive 签名验证成功，entitlements 与批准能力相符，无开发调试 entitlement 或错误 Team ID | `TBD/ios/signing/archive-verification.txt` | iOS + Reviewer | PENDING macOS |
| IOS-VER-P0-005 | P0 | `CFBundleShortVersionString`、`CFBundleVersion` 与 App Store Connect 记录、release tag 和构建证据一致 | `TBD/ios/version-provenance.json` | iOS + Release | PENDING macOS |

### 4.2 Capabilities、entitlements 与 Info.plist

| ID | 优先级 | 可验证验收标准 | 证据路径 | 负责人 | 状态 |
|---|---|---|---|---|---|
| IOS-CAP-P0-001 | P0 | 逐项批准 Push Notifications、Background Modes、Associated Domains、Keychain Groups 等能力；未使用能力不启用 | `TBD/ios/capabilities-review.md` | iOS + Security + Product | PENDING macOS |
| IOS-CAP-P0-002 | P0 | App ID 能力、provisioning profile、target entitlements 与 archive 四方一致 | `TBD/ios/entitlements-diff.txt` | iOS Owner | PENDING macOS |
| IOS-PLIST-P0-003 | P0 | 所有隐私 usage description 准确、具体、本地化，且只为实际访问的 API 声明 | `TBD/ios/info-plist/privacy-strings.md` | iOS + Privacy + UX | PENDING macOS |
| IOS-PLIST-P0-004 | P0 | URL schemes、后台模式、方向/设备族、显示名、版本、加密出口合规问答等均与实现和商店声明一致 | `TBD/ios/info-plist/review.md` | iOS + Legal + Store Ops | PENDING macOS |
| IOS-CAP-P1-005 | P1 | 通知未授权/拒绝/设置恢复、后台挂起、进程终止、Focus 模式和时区/DST 下行为清晰且不丢数据 | `TBD/ios/notifications-state-matrix/` | iOS + QA | PENDING macOS |

### 4.3 Apple 隐私清单、SDK 与符号

| ID | 优先级 | 可验证验收标准 | 证据路径 | 负责人 | 状态 |
|---|---|---|---|---|---|
| IOS-PRIV-P0-001 | P0 | 最终 archive 包含有效 `PrivacyInfo.xcprivacy`；收集数据、tracking domains 与 required-reason APIs 基于实际代码/SDK，不靠猜测 | `TBD/ios/privacy/privacy-manifest-review.md` | iOS + Privacy | PENDING macOS |
| IOS-PRIV-P0-002 | P0 | 所有第三方 SDK 的隐私清单、签名（适用时）、版本和声明汇总复核；无损坏/无效 manifest | `TBD/ios/privacy/sdk-manifests/` | iOS + Security | PENDING macOS |
| IOS-PRIV-P0-003 | P0 | App Store privacy details 覆盖开发者及第三方合作方的数据实践，与隐私政策和实际网络流量一致 | `TBD/privacy-legal/app-store-privacy-review.md` | Privacy + Store Ops | PENDING macOS |
| IOS-SYM-P0-004 | P0 | archive、dSYM、原生 symbols 和 Hermes/JavaScript source map 与 build UUID/版本绑定并安全留存 | `TBD/ios/symbols/manifest.json` | iOS + Observability | PENDING macOS |
| IOS-SYM-P0-005 | P0 | 人工触发原生与 JS/Hermes 崩溃，Crash Organizer/监控平台能还原到正确 release 源码位置 | `TBD/ios/symbols/symbolication-test.md` | QA + Observability | PENDING macOS |

### 4.4 Archive、设备矩阵与 TestFlight

| ID | 优先级 | 可验证验收标准 | 证据路径 | 负责人 | 状态 |
|---|---|---|---|---|---|
| IOS-BLD-P0-001 | P0 | 受控 macOS CI/Xcode 从干净 checkout 生成 Release archive；记录 Xcode、macOS、SDK、Pods/SPM、Node/RN/Hermes 版本 | `TBD/ios/build/archive-manifest.json` | iOS/macOS Owner | PENDING macOS |
| IOS-BLD-P0-002 | P0 | archive validation/upload 成功，无未解释 warning；arm64 真机代码、New Architecture 与全部原生依赖兼容 | `TBD/ios/build/validation-log.txt` | iOS Owner | PENDING macOS |
| IOS-QA-P0-003 | P0 | 物理 iPhone 上覆盖产品决定支持的最低/当前 iOS、至少两档屏幕和性能档位；iPad 若声明支持则加入矩阵 | `TBD/qa-device-matrix/ios-matrix.csv` | QA Owner | PENDING macOS |
| IOS-QA-P0-004 | P0 | 全新安装、上一版升级、离线、数据库损坏/部分恢复、低存储、字体放大、深色、VoiceOver、后台恢复均有证据 | `TBD/qa-device-matrix/ios-resilience/` | QA Owner | PENDING macOS |
| IOS-TF-P0-005 | P0 | TestFlight internal build 完成 smoke/regression；外部测试若使用，测试信息、出口合规和 Beta App Review 均完成 | `TBD/ios/testflight/` | iOS + QA + Store Ops | PENDING macOS |
| IOS-TF-P1-006 | P1 | 测试组、测试说明、反馈入口、build 失效日期、个人数据处理和退出机制明确 | `TBD/ios/testflight/test-plan.md` | QA + Privacy | PENDING macOS |

### 4.5 App Store Connect 上架资料

| ID | 优先级 | 可验证验收标准 | 证据路径 | 负责人 | 状态 |
|---|---|---|---|---|---|
| IOS-ASC-P0-001 | P0 | App Store Connect 应用记录、Bundle ID、SKU、主语言和版本建立且归属正确团队 | `TBD/store-listing/ios/app-record.md` | Store Operations | PENDING macOS |
| IOS-ASC-P0-002 | P0 | App privacy、年龄分级、出口合规、内容权利、广告/儿童等问答由 Privacy/Legal 复核 | `TBD/store-listing/ios/declarations.md` | Legal + Privacy + Store Ops | PENDING macOS |
| IOS-ASC-P1-003 | P1 | 名称、副标题、关键词、描述、promotional text、截图/预览、支持 URL、隐私 URL 和版本说明完整准确 | `TBD/store-listing/ios/assets/` | Product + Store Ops | PENDING macOS |
| IOS-ASC-P0-004 | P0 | Review Notes 说明需关注的提醒/后台行为；如需账号或特殊路径，提供最小权限演示方式且不泄露生产凭据 | `TBD/store-listing/ios/review-notes.md` | Product + Store Ops | PENDING macOS |
| IOS-ASC-P0-005 | P0 | TestFlight 通过后才选择 build 提审；发布方式、分阶段发布、自动更新与停止发布权限已审批 | `TBD/store-listing/ios/submission-plan.md` | Release Manager | PENDING macOS |

---

## 5. 跨平台隐私、法律与供应链

### 5.1 隐私政策、用户协议与用户权利

本节是工程/产品准备清单，不构成中国《个人信息保护法》或其他法域的法律意见。适用性、措辞、未成年人、跨境、同意基础、保存期限、主体权利与监管申报必须由合格法律顾问按实际业务复核。

| ID | 优先级 | 可验证验收标准 | 证据路径 | 负责人 | 状态 |
|---|---|---|---|---|---|
| XPL-LEGAL-P0-001 | P0 | 发布前形成与实际数据流一致的隐私政策和用户协议；版本、生效日、主体、联系方式、用途、保存期、共享方、权利渠道明确 | `TBD/privacy-legal/policy-approved.pdf` | Legal + Privacy + CEO | NOT VERIFIED |
| XPL-LEGAL-P0-002 | P0 | 若存在账号，注销入口可发现、处理时限和影响清晰，完成后删除/匿名化及法定留存边界经验证 | `TBD/privacy-legal/account-cancellation-test.md` | Product + Privacy + QA | NOT VERIFIED |
| XPL-LEGAL-P0-003 | P0 | 提供适用的访问/复制、更正、删除和撤回同意流程；数据导出/可携带范围、格式和身份核验由法律与产品决定 | `TBD/privacy-legal/data-rights-tests/` | Privacy + Legal + QA | NOT VERIFIED |
| XPL-LEGAL-P0-004 | P0 | 删除覆盖本地、服务器、分析/崩溃平台、备份和第三方处理方；无法即时删除的副本有锁定与期限记录 | `TBD/privacy-legal/deletion-map.md` | Privacy + Data Owner | NOT VERIFIED |
| XPL-LEGAL-P0-005 | P0 | 同意/撤回、敏感个人信息、未成年人、跨境传输、自动化决策等仅在实际适用时启用对应机制，并保留合法证据 | `TBD/privacy-legal/legal-basis-matrix.md` | Legal + Privacy | NOT VERIFIED |
| XPL-LEGAL-P1-006 | P1 | 离线优先数据仍有清晰说明；无账号不应声称存在云端同步、云端删除或跨设备恢复 | `TBD/privacy-legal/offline-disclosure.md` | Product + Privacy | NOT VERIFIED |

### 5.2 第三方 SDK、SBOM 与许可证

| ID | 优先级 | 可验证验收标准 | 证据路径 | 负责人 | 状态 |
|---|---|---|---|---|---|
| XPL-SBOM-P0-001 | P0 | 从最终 Android AAB 和 iOS archive 生成机器可读 SBOM，覆盖直接/传递依赖、原生库、SDK、版本、hash、来源和许可证 | `TBD/security-sbom/sbom.cdx.json` | Security + Platform Owners | NOT VERIFIED |
| XPL-SBOM-P0-002 | P0 | 每个第三方 SDK 记录数据类别、目的、endpoint/domain、权限、默认开关、保存期、Data safety 与 Apple manifest 影响 | `TBD/security-sbom/sdk-register.csv` | Privacy + Security | NOT VERIFIED |
| XPL-SBOM-P0-003 | P0 | 高危已知漏洞、停止维护或来源不明依赖已升级/移除；例外包含到期日、缓解和签署人 | `TBD/security-sbom/vulnerability-report.json` | Security Owner | NOT VERIFIED |
| XPL-LIC-P0-004 | P0 | 开源许可证义务、归属、NOTICE、源代码提供义务（如适用）由法律复核，应用内/网站 notices 可访问 | `TBD/security-sbom/license-review.md` | Legal + Security | NOT VERIFIED |
| XPL-SBOM-P1-005 | P1 | 依赖升级有锁定、hash 校验和供应链来源控制；发布后能按 SBOM 定位受影响版本 | `TBD/security-sbom/supply-chain-controls.md` | Build/CI + Security | NOT VERIFIED |

### 5.3 崩溃与分析数据

| ID | 优先级 | 可验证验收标准 | 证据路径 | 负责人 | 状态 |
|---|---|---|---|---|---|
| XPL-OBS-P0-001 | P0 | 决定 crash/analytics 是否启用及 opt-in/opt-out/同意基础；决定由法律与产品签署，不由 SDK 默认值代替 | `TBD/privacy-legal/telemetry-decision.md` | Privacy + Legal + Product | NOT VERIFIED |
| XPL-OBS-P0-002 | P0 | telemetry 关闭/拒绝后应用核心功能和离线能力正常，重启/升级后选择保持且可撤回 | `TBD/qa-device-matrix/telemetry-choice/` | QA + Platform Owners | NOT VERIFIED |
| XPL-OBS-P0-003 | P0 | 崩溃、breadcrumb、日志、事件和 user properties 不包含任务标题/描述、自由文本、token、精确标识或其他不必要个人信息 | `TBD/privacy-legal/telemetry-payload-capture.json` | Privacy + Security + QA | NOT VERIFIED |
| XPL-OBS-P0-004 | P0 | 数据地区、保存期、访问角色、删除 API、供应商 DPA/条款和事件响应联系人明确 | `TBD/privacy-legal/telemetry-vendor-review.md` | Legal + Security | NOT VERIFIED |
| XPL-OBS-P1-005 | P1 | 监控事件有 schema、采样、版本和质量告警；无符号或错误版本的崩溃不被误判为已诊断 | `TBD/rollout-monitoring/telemetry-schema.md` | Observability Owner | NOT VERIFIED |

---

## 6. 无障碍与可用性发布门禁

| ID | 优先级 | 可验证验收标准 | 证据路径 | 负责人 | 状态 |
|---|---|---|---|---|---|
| A11Y-P0-001 | P0 | TalkBack 与 VoiceOver 均可完成创建任务、开始/查看 5 分钟、完成、撤销/恢复（如有）、设置通知和数据权利核心流程 | `TBD/accessibility/screen-reader-core/` | Accessibility + QA | NOT VERIFIED / iOS PENDING macOS |
| A11Y-P0-002 | P0 | 所有交互元素有准确名称/角色/状态/操作；焦点顺序稳定，弹层焦点被管理，动态结果会适度播报 | `TBD/accessibility/semantics-audit.csv` | Platform Owners + QA | NOT VERIFIED |
| A11Y-P0-003 | P0 | Android 触控目标按平台基线验证、iOS 触控目标按 Apple 基线验证；关键目标不依赖像素级精确操作 | `TBD/accessibility/target-size-audit.csv` | Design + QA | NOT VERIFIED |
| A11Y-P0-004 | P0 | 文本/非文本对比度、系统字体放大、粗体、深色模式和高对比设置下信息不丢失、不裁切、不重叠 | `TBD/accessibility/visual-matrix/` | Design + QA | NOT VERIFIED |
| A11Y-P0-005 | P0 | 减少动态效果开启时，无不必要缩放/闪烁/自动移动；完成反馈不只依赖颜色、声音或动画 | `TBD/accessibility/motion-feedback/` | Design + Platform Owners | NOT VERIFIED |
| A11Y-P1-006 | P1 | 至少一名不熟悉实现的测试者执行核心任务；问题按严重度、复现步骤、平台和修复版本记录 | `TBD/accessibility/usability-session.md` | UX Research + QA | NOT VERIFIED |

参考基线应至少结合 WCAG 2.2、Android Accessibility 与 Apple Accessibility 指南；商店文案不得在缺少审计证据时宣称“完全无障碍”。

---

## 7. 离线、损坏恢复、迁移与回滚

| ID | 优先级 | 可验证验收标准 | 证据路径 | 负责人 | 状态 |
|---|---|---|---|---|---|
| DATA-RES-P0-001 | P0 | 在飞行模式/无网络时可完成产品承诺的核心流程；联网功能失败不阻断本地任务，也不无限重试耗电 | `TBD/qa-device-matrix/offline-core/` | QA + Platform Owners | NOT VERIFIED |
| DATA-RES-P0-002 | P0 | 数据写入具备原子性或等效保护；强杀、断电/进程终止、磁盘满后没有静默回退到空数据库 | `TBD/qa-device-matrix/write-interruption/` | Data + QA | NOT VERIFIED |
| DATA-RES-P0-003 | P0 | 损坏检测保留原始文件的可恢复副本，错误对用户可解释；任何自动重建前需避免覆盖唯一副本 | `TBD/qa-device-matrix/corruption-recovery/` | Data + QA | NOT VERIFIED |
| DATA-MIG-P0-004 | P0 | 所有已发布 schema 到候选 schema 有显式、幂等、可中断恢复的迁移测试；样本含空库、最大量、特殊字符和旧数据异常 | `TBD/qa-device-matrix/migration-suite/` | Data + QA | NOT VERIFIED |
| DATA-MIG-P0-005 | P0 | 升级失败不会留下半迁移状态；前向修复和应用回滚对数据格式的限制已书面化 | `TBD/rollout-monitoring/migration-rollback-plan.md` | Data + Release | NOT VERIFIED |
| DATA-MIG-P1-006 | P1 | 用户可在不依赖云端的情况下导出可读数据（若产品/法律决定提供），导入/导出版本兼容和损坏提示经验证 | `TBD/privacy-legal/export-format-tests/` | Product + Data + QA | NOT VERIFIED |

---

## 8. 分阶段发布、监控与回滚

### 8.1 上线前必须填写的量化阈值

下表的数值刻意不在本草案中虚构。每项必须使用内部测试/预发布基线设值并由对应负责人签署；任何 `TBD` 都是发布阻塞。

| 指标 | 观察窗口 | 警戒阈值 | 停止扩量/回滚阈值 | 数据源 | 负责人 |
|---|---|---|---|---|---|
| Crash-free users/sessions | `TBD` | `TBD` | `TBD` | `TBD` | Observability |
| Android user-perceived crash / ANR | `TBD` | `TBD` | `TBD` | Play Console + telemetry | Android + QA |
| iOS crash / hang | `TBD` | `TBD` | `TBD` | App Store Connect + telemetry | iOS + QA |
| 启动失败/空白页 | `TBD` | `TBD` | `TBD` | synthetic + telemetry | Platform Owners |
| 数据损坏/迁移失败 | 即时 | `TBD` | **任何不可恢复用户数据丢失均停止扩量** | support + telemetry | Data Owner |
| 5 分钟提醒失败/严重漂移 | `TBD` | `TBD` | `TBD` | product telemetry/QA | Product + QA |
| 电池/后台异常 | `TBD` | `TBD` | `TBD` | store vitals + lab | Platform Owners |
| 隐私/安全事件 | 即时 | `TBD` | **确认泄露、密钥暴露或违规采集即停止扩量并启动响应** | security monitoring | Security + Privacy |

### 8.2 发布执行门禁

| ID | 优先级 | 可验证验收标准 | 证据路径 | 负责人 | 状态 |
|---|---|---|---|---|---|
| ROLL-P0-001 | P0 | 先通过 internal/closed 或 TestFlight 验证，再按获批百分比逐级扩量；每级有最短观察窗和人工 go/no-go | `TBD/rollout-monitoring/staged-plan.md` | Release Manager | NOT VERIFIED |
| ROLL-P0-002 | P0 | 上表所有阈值、基线、查询和告警已演练；负责人在发布窗口可达，告警不是发送到无人值守渠道 | `TBD/rollout-monitoring/alert-drill.md` | Observability + Release | NOT VERIFIED |
| ROLL-P0-003 | P0 | 明确“停止扩量、下架/暂停、回滚上一二进制、前向热修”的权限和步骤；商店实际能力与审核延迟已计入 | `TBD/rollout-monitoring/rollback-runbook.md` | Release + Store Ops | NOT VERIFIED |
| ROLL-P0-004 | P0 | 回滚前验证旧版可读取新 schema；若不可逆，采用兼容迁移/kill switch/前向修复，不以盲目降级扩大数据损坏 | `TBD/rollout-monitoring/data-compatibility.md` | Data + Platform Owners | NOT VERIFIED |
| ROLL-P0-005 | P0 | 发布说明、客服话术、已知问题、隐私/安全升级通知与状态页方案已批准 | `TBD/rollout-monitoring/comms-pack/` | Product + Support + Legal | NOT VERIFIED |
| ROLL-P1-006 | P1 | 发布后 24h/72h/7d 复盘（最终窗口可调整）覆盖质量、权限漏斗、提醒成功、反馈、卸载、耗电和数据事件 | `TBD/rollout-monitoring/post-release-review.md` | Release Manager | NOT VERIFIED |

---

## 9. 当前 Release Blockers

以下任一项存在时不得宣称“准备发布”或进入全量：

1. **没有正式 release AAB，debug APK 不可替代。**
2. Android release 身份、版本、upload key/Play App Signing 和账号所有权没有证据。
3. 无物理设备、无 AVD，Android 核心路径、权限、通知、闹钟、升级、性能、电池和无障碍均未验证。
4. 当前 Windows 环境不能完成 iOS Bundle ID、signing、archive、真机、TestFlight 或 App Store 验证；iOS 全部待 macOS。
5. 隐私政策、用户协议、PIPL/适用法域复核、数据权利流程、Play Data safety 和 App Store privacy details 未完成。
6. 第三方 SDK 清单、SBOM、许可证、漏洞和实际网络数据流未完成。
7. R8/ProGuard、Hermes/JS source maps、native symbols 和崩溃还原未建立。
8. backup/data extraction、数据库损坏恢复、升级迁移与数据兼容回滚未验证。
9. adaptive/monochrome icon、splash、商店文案/截图、年龄分级和支持/隐私 URL 未验收。
10. 通知拒绝路径和 exact alarm 合规/降级策略未决定或未验证。
11. TalkBack/VoiceOver、字体缩放、对比度、目标尺寸和减少动态效果的核心门禁未通过。
12. 性能、电池、crash/ANR、数据损坏和提醒可靠性的量化阈值仍为 `TBD`。
13. staged rollout、监控、值班、停止扩量与回滚演练没有证据。
14. 仓库或产物一旦发现生产密钥、token、个人数据或错误 endpoint，立即 P0 阻塞并启动事件响应。

---

## 10. 证据登记模板

每个验收项使用一行；不得删除失败记录，只能追加新的执行轮次。

| Acceptance ID | Version/Build | Commit/Tag | Artifact SHA-256 | Environment/Device | Evidence path | Result | Executed by | Reviewed by | Date | Notes/Risk |
|---|---|---|---|---|---|---|---|---|---|---|
| `TBD` | `TBD` | `TBD` | `TBD` | `TBD` | `TBD` | NOT RUN | Unassigned | Unassigned | `TBD` | `TBD` |

结果枚举：`PASS`、`FAIL`、`BLOCKED`、`NOT RUN`。只有满足验收标准且证据可访问、可追溯、经独立复核时才能填写 `PASS`。

---

## 11. 负责人模板与签署

### 11.1 角色

| 角色 | 核心责任 | 姓名 | 备份人 | 当前状态 |
|---|---|---|---|---|
| CEO / Release Approver | 最终业务 go/no-go 与风险接受 | `TBD` | `TBD` | UNASSIGNED |
| Release Manager | 门禁、版本、证据、节奏与回滚指挥 | `TBD` | `TBD` | UNASSIGNED |
| Android Owner | AAB、签名集成、权限、性能、设备质量 | `TBD` | `TBD` | UNASSIGNED |
| iOS/macOS Owner | Bundle/signing/archive/TestFlight/App Store | `TBD` | `TBD` | UNASSIGNED |
| QA Owner | 锁定测试、设备矩阵、回归与证据质量 | `TBD` | `TBD` | UNASSIGNED |
| Security Owner | secrets、SBOM、漏洞、供应链和事件响应 | `TBD` | `TBD` | UNASSIGNED |
| Privacy/Legal Owner | 政策、表单、同意、用户权利和法域复核 | `TBD` | `TBD` | UNASSIGNED |
| Product/Design Owner | 范围、商店素材、提醒策略、可用性 | `TBD` | `TBD` | UNASSIGNED |
| Accessibility Owner | 屏幕阅读器、缩放、对比、动作与审计 | `TBD` | `TBD` | UNASSIGNED |
| Data/Migration Owner | schema、备份、损坏恢复与回滚兼容 | `TBD` | `TBD` | UNASSIGNED |
| Observability/On-call | 符号、指标、阈值、告警和值班 | `TBD` | `TBD` | UNASSIGNED |
| Store Operations | Play/App Store 元数据、提交与政策复核 | `TBD` | `TBD` | UNASSIGNED |

### 11.2 最终签署条件

只有同时满足下列条件，Release Manager 才能建议 `GO`：

- 所有 P0 为 `PASS`，证据登记完整且由未参与实现的审查人复核；
- 当前 blockers 清零；
- 所有 P1 已关闭，或由 CEO 书面接受含期限、缓解和负责人在内的剩余风险；
- Android 与 iOS 各自基于最终商店候选二进制完成验证，不相互代替；
- 商店政策、隐私/法律表单、SDK/SBOM/许可证在提交当日重新核对；
- staged rollout、数值阈值、值班、停止扩量和数据兼容回滚均已演练；
- 最终代码、锁定测试、构建产物、符号和证据的 hash 被写入发布记录。

本草案当前没有任何签署，仍为：**NON-BINDING / RELEASE NOT ATTEMPTED / NO-GO DUE TO MISSING EVIDENCE**。

---

## 12. 官方依据与提交日复核入口

以下链接用于建立检查基线，商店政策会变化，必须在实际提交日重新确认：

- Google Play target API 要求（官方帮助，中文）：<https://support.google.com/googleplay/android-developer/answer/11926878?hl=zh-Hans>
- Android 发布准备与 App Bundle：<https://developer.android.com/studio/publish/>
- Play Console 应用设置、版本与 Play App Signing：<https://support.google.com/googleplay/android-developer/answer/9859152?hl=en>
- Android 13 通知运行时权限：<https://developer.android.com/about/versions/13/behavior-changes-all>
- Android 14 精确闹钟变化：<https://developer.android.com/about/versions/14/changes/schedule-exact-alarms?hl=en>
- Android Auto Backup / data extraction rules：<https://developer.android.com/identity/data/autobackup>
- Android SplashScreen：<https://developer.android.com/develop/ui/views/launch/splash-screen>
- Android adaptive/monochrome icons：<https://developer.android.com/develop/ui/compose/system/icon_design_adaptive>
- Android R8 优化与 Retrace：<https://developer.android.com/topic/performance/app-optimization/enable-app-optimization>、<https://developer.android.com/tools/retrace>
- Android Accessibility：<https://developer.android.com/guide/topics/ui/accessibility/views/apps-views>
- Apple 注册 App ID 与 capabilities：<https://developer.apple.com/help/account/identifiers/register-an-app-id>、<https://developer.apple.com/help/account/capabilities/capabilities-overview/>
- Apple Xcode 添加 capabilities：<https://developer.apple.com/documentation/xcode/adding-capabilities-to-your-app>
- Apple privacy manifest：<https://developer.apple.com/documentation/bundleresources/privacy-manifest-files>
- Apple 第三方 SDK privacy manifest：<https://developer.apple.com/documentation/bundleresources/adding-a-privacy-manifest-to-your-app-or-third-party-sdk>
- Apple App privacy details：<https://developer.apple.com/app-store/app-privacy-details/>
- App Store Connect 与 TestFlight：<https://developer.apple.com/help/app-store-connect/>
- Apple Accessibility：<https://developer.apple.com/design/human-interface-guidelines/accessibility/>
- WCAG 2.2：<https://www.w3.org/TR/WCAG22/>
- 中国《个人信息保护法》官方公开文本（法律适用仍需专业复核）：<https://www.ssf.gov.cn/portal/rootimages/uploadimg/1641708111970375/1641708111970375.pdf>

---

## 13. 变更记录

| 日期 | 版本 | 变更 | 作者角色 | 审查状态 |
|---|---|---|---|---|
| 2026-08-05 | Draft 0.1 | 建立非绑定 Android/iOS 发布准备门禁、验收 ID、blockers、证据及负责人模板 | Release Readiness Draft Author | NOT REVIEWED |

