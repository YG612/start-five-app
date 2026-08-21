# “先做 5 分钟”下一对话交接

> 当前状态提示（2026-08-22）：本文保留 P0–P6 历史交接背景，不再代表项目最新阶段。P19 已进入发布前可靠性收口；请先阅读 `docs/CURRENT_RESEARCH_ROUTE.md`、`docs/P19_RELEASE_CONVERGENCE_AUDIT.md` 和 `docs/CODEX_P15R_P18_PROGRESS.md`。

更新时间：2026-08-14（Asia/Shanghai）

## 0. 最新完成状态

Word 指定的四象限重构已经按 P0～P6 全部实现。默认首页、地图/清单双视图、真实 CRUD、长按拖动、移动/完成撤销、精确任务专注、轻量复盘、幂等奖励、提醒协调、备份兼容、深色/减少动态/无障碍和 Android internal 交付均已落地。不要在下一对话重新从阶段 0 或阶段 1 开始。

最终代码验证：TypeScript 严格检查通过；13 个定点套件、89 项测试全部通过；Android `lintInternal` 与 `assembleInternal` 通过。当前没有连接 ADB 设备，故真机手工走查留给有设备的验收环境；iOS 原生构建仍需 macOS/Xcode。

## 1. 下一对话首先要知道的决定

产品方向已正式调整。下列 Word 是新的最高产品与验收基线，优先级高于此前围绕“任务工作台、收尾、提醒、备份”等功能逐项补洞的方向：

- `docs/SOURCE_先做5分钟_APP_Codex完整重构指令.docx`

这次不是在现有 App 中“新增一个四象限页面”，而是把四象限改成默认首页和绝对核心。目标体验是：

1. 打开即看到：冷启动直接进入可交互四象限地图。
2. 点击即修改：点击任务节点或任务行，直接打开快速编辑面板。
3. 一键即开始：首页最多两次点击启动与该任务精确绑定的 5 分钟专注。
4. 完成立即成长：完成后约 1 秒内显示积分、原因和成长进度，不跳阻断式结算页。

不要继续以旧的 TaskWorkspace 功能入口为中心打补丁。已有专注、提醒、备份、历史、收尾等能力应保留在底层，并通过四象限上下文或“专注 / 成长 / 我的”二级入口服务核心闭环。

## 2. Word 的硬性范围

P0 必须完成：

- 默认四象限首页。
- 地图与四区纵向清单双视图，共用同一任务源并即时同步。
- 真实任务创建、编辑、拖动换象限、完成与撤销，重启后仍正确。
- 从首页到精确任务 5 分钟专注最多两次点击。
- 完成任务后即时且幂等地发放积分并展示成长反馈。
- 游客无需登录即可使用完整核心闭环。
- 旧任务、旧存储和旧备份兼容，任何 Schema 变化必须迁移。
- 无障碍、深色模式、减少动画可用，不能只靠颜色表达象限。

P1 仅在 P0 完成后接入：基础提醒、轻量修复、简化今日总结、推荐节点高亮、专注历史二级入口。

本轮明确不做：AI、社区/伙伴、宠物/城市/商店/会员、语音/图片识别、时间轴、复杂报告、新后端/账号体系，以及与核心闭环无关的架构重写。

## 3. 新的信息架构

底部主导航固定为：

- 象限：默认页；地图、清单、增改任务、拖动、开始 5 分钟、完成与即时反馈。
- 专注：当前专注、时长选择、最近记录和必要设置。
- 成长：成长总分、等级、进度、最近奖励原因和象限贡献。
- 我的：提醒、备份恢复、导出、主题、减少动画和帮助。

旧页面处置原则：

- `TaskWorkspaceScreen` 优先重构或适配为 `QuadrantHomeScreen` 容器。
- `FirstActivationScreen` 不再阻挡新用户看见四象限，只保留兼容状态/渐进提示。
- `CoreFlowScreen` 退出一级流程，其能力拆到任务编辑、专注页和结束面板。
- `PostFocusReviewScreen` 压缩为轻量底部面板。
- `FocusHistoryScreen` 进入“专注”的二级入口。
- `DayClosureScreen` 降级为可选“今日总结”。
- `LocalBackupScreen` 移到“我的”。

## 4. 当前源码与已经完成的基础设施

工程目录：

`D:/CodexData/Workspaces/Codex/2026-07-20/android-ios-app-readme-md-prd/outputs/start-five`

技术栈已确认：React Native 0.86.0、React 19.2.3、TypeScript 5.9、Jest 29.7、Android 原生 Kotlin/Gradle、本地 AsyncStorage/自定义仓储。

现有可复用基础能力已较完整，重构时不要重造并行数据系统：

- 任务 Repository、任务生命周期与稳定 operation ledger。
- 精确任务启动、5 分钟专注、重启恢复。
- 专注历史与专注后复盘。
- “明日第一项”/结束今天与恢复状态机。
- 本地通知、权限、冷/热点击、Android 重启恢复；提醒时间已经支持本地墙钟、时区/DST 和幂等替换。
- 版本化本地备份、严格校验、空安装恢复、恢复 journal、Android/iOS 文件选择桥。
- 首次激活与既有用户 fail-closed 判定。
- Android 可离线安装的 internal 构建脚本与包。

这些底层能力现已由新的四象限产品入口复用，P0～P6 重构完成状态与证据见 `docs/CODEX_QUADRANT_REFACTOR_SPEC.md`。

## 5. Android 当前可安装基线

当前 internal APK：

`android/app/build/outputs/apk/internal/app-internal.apk`

已核验：

- 大小：19,888,830 bytes。
- SHA-256：`252aa6d355e85b2fb3c0562f893da810c40d8dba04cfa9a16a01177018c7d706`。
- 已内置 `assets/index.android.bundle`，不依赖 Metro，修复了旧 debug APK 的 “Unable to load script” 红屏。
- APK Signature Scheme v2 有效；使用 Android Debug 证书，仅适合内部测试。
- `com.startfive.app`，versionCode 1 / versionName 1.0，minSdk 24，targetSdk 36。
- non-debuggable、cleartext=false、arm64-v8a。

可重复构建命令（项目根目录执行）：

`powershell -ExecutionPolicy Bypass -File .\scripts\build-android-internal.ps1`

正式 Play 上架仍需受管 release keystore、版本升级、AAB 和商店门禁；iOS 原生代码仍需要 macOS/Xcode 编译与真机验证。

## 6. 下一对话不要重复什么

- 不要重新复盘此前 GAP09～GAP13 的长审查历史；只把它们视为已存在的底层兼容能力。
- 不要继续新增提醒、备份、收尾等外围功能，除非四象限 P0 需要适配。
- 不要运行无边界全量测试。按 Word 的阶段执行，每个阶段只跑类型检查、与本阶段直接相关的测试和有限兼容。
- 不要删除旧数据、旧备份兼容或已有可靠事务。
- 不要覆盖用户未提交修改，不执行 `git reset --hard`。
- 不要只给建议、原型、伪代码或静态假数据；必须直接修改真实源码。

## 7. 后续只做外部验收或新需求

1. 有 Android 设备时安装当前 internal APK，走查冷启动、真实触摸拖拽、通知冷/热点、字体最大档和 TalkBack。
2. 在 macOS/Xcode 上完成 iOS 编译、VoiceOver 和真机验证。
3. Play/App Store 正式发布仍需受管签名、版本升级、AAB/Archive 和商店门禁。
4. 若继续产品开发，以新需求为起点；不要重做 P0～P6 或另建任务数据源。

## 8. 建议给新对话的开场指令

> 请先阅读 `outputs/start-five/docs/NEXT_CHAT_HANDOFF.md`、`outputs/start-five/docs/CODEX_QUADRANT_REFACTOR_SPEC.md` 和原始 Word。P0～P6 四象限重构已经完成，不要重做；如有设备，请直接执行 Android/iOS 真机验收，否则从用户的新需求继续。

## 9. 完成标准提醒

重构是否成功，不看新增页面数量，而看一个不了解产品的新用户是否能无需说明完成：

`打开 App → 看懂四象限 → 添加任务 → 点击修改 → 先做 5 分钟 → 完成 → 看见成长反馈`
