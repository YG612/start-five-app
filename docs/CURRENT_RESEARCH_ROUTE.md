# Start Five 当前研究路线与阅读指南

更新时间：2026-08-22（Asia/Shanghai）  
R20-01 启动 HEAD：`418b785f62c4bc71e48d56317a90d033ffa6d75b`
兼容修复基线：`f2a79b0 fix: reconcile interaction reliability and legacy gates`
仓库：`https://github.com/YG612/start-five-app`

## 1. 当前结论

Start Five 已从“功能原型”进入“发布前可靠性收口”阶段，当前产品判断为 `INTERNAL_BETA / NOT_RELEASE_READY`。P0–P18 的产品能力、P19 的共享交互可靠性源码和 R20-01 历史契约收口均已落地；当前多视角问题审计已形成 `docs/CURRENT_PRODUCT_RISK_AUDIT.md`。完整 Android 人工验收、iOS 构建与真机、首次用户测试尚未完成，且设置失败闭环、错误诊断、真实指标采集、备份边界和反馈渠道仍需收口。

当前有效状态：

| 维度 | 状态 | 真实证据 |
| --- | --- | --- |
| 四象限核心闭环 | `DONE_AUTO` | `src/screens/QuadrantHomeScreen.tsx`、`src/components/QuadrantTaskMap.tsx` |
| P19 全局交互审计 | `AUDIT_CONFIRMED` | `docs/P19_RELEASE_CONVERGENCE_AUDIT.md` |
| P19 P0/P1 源码修复 | `DONE_AUTO` | `src/components/AppBottomSheet.tsx`、`src/data/taskDraftStore.ts`、`src/domain/localDate.ts` |
| P15R/P19 本轮复验 | PASS | 6 suites、28/28 tests；2026-08-22 重跑 |
| TypeScript strict | PASS | `tsc --noEmit`；2026-08-22 重跑 |
| Android 自动设备冒烟 | PASS（有限范围） | OnePlus 9R 冷启动、语义树、无致命日志、Sheet 返回与下拉 |
| Android 完整人工验收 | `PENDING_EXTERNAL` | `docs/P19_DEVICE_UTEST_ACCEPTANCE.md` |
| iOS 构建、VoiceOver、真机 | `PENDING_MACOS_XCODE` | 尚无 macOS/Xcode 证据 |
| 首次用户测试 | `PENDING_EXTERNAL` | 尚无至少 5 名目标用户的无指导记录 |
| R20-01 契约处置 | PASS | `docs/R20_01_CONTRACT_DISPOSITION.md`；KEEP 1、MIGRATE 3、RETIRE 0、ISOLATE 4 |
| 全量历史质量门 | PASS | authoritative accepted roots 连续两次：77/77 suites、839/839 tests PASS |
| Android internal 构建 | PASS | `:app:assembleInternal`；APK SHA-256 `611cda1c846869a1a257f7c44b11ce67aa2d3d5dc235fe0b055c90241a2ef2df` |
| R20-02 Android 设备矩阵 | `IN_PROGRESS / PENDING_DEVICE` | `docs/R20_02_ANDROID_DEVICE_MATRIX_PROGRESS.md`；runner 与 4/4 契约测试完成，当前 ADB 设备数 0 |
| 当前产品问题审计 | `AUDIT_CONFIRMED` | `docs/CURRENT_PRODUCT_RISK_AUDIT.md`；区分源码确认、设备待验证和用户研究假设 |

## 2. 先用哪条阅读路线

### 2.1 十五分钟了解产品现状

按顺序阅读：

1. 本文：理解阶段位置、证据边界和下一步。
2. `docs/CURRENT_PRODUCT_RISK_AUDIT.md`：查看当前仍存在的问题、研究缺口和优先级。
3. `docs/P19_RELEASE_CONVERGENCE_AUDIT.md`：查看真实界面清单、P0/P1/P2 和共同根因。
4. `docs/CODEX_P15R_P18_PROGRESS.md`：查看 P15R–P19 的真实路径、schema、测试和 APK。
5. `docs/P19_DEVICE_UTEST_ACCEPTANCE.md`：理解为什么当前还不能宣称正式发布完成。

读完应能回答：核心闭环是否存在、P19 修了什么、当前还存在哪些问题、哪些仅有自动证据、正式发布还缺什么。

### 2.2 六十分钟理解产品研究演进

按阶段阅读：

1. `docs/SOURCE_先做5分钟_APP_Codex完整重构指令.docx`：最初产品目标与四象限基线。
2. `docs/CODEX_QUADRANT_REFACTOR_SPEC.md`：P0–P6，四象限成为默认首页和核心闭环。
3. `docs/CODEX_P7_P10_USER_METRIC_SPEC.md` 与 `docs/CODEX_P7_P10_PROGRESS.md`：本地指标、提醒治理和用户行为证据。
4. `docs/CODEX_P11_P14_USER_VALUE_OPTIMIZATION_SPEC.md` 与 `docs/CODEX_P11_P14_PROGRESS.md`：长期任务、恢复可靠性、性能和无障碍。
5. `docs/CODEX_P15R_P18_UNIFIED_INTERACTION_AND_PAGE_EXPERIENCE_SPEC.md` 与 `docs/CODEX_P15R_P18_PROGRESS.md`：页面架构、专注日程、语义成长、设置与持续布局。
6. `Start Five P19：全局交互可靠性与发布收口 Codex 指令.md`：P19 的约束和验收定义。它是历史执行指令，不替代本文的当前状态。
7. `docs/P19_RELEASE_CONVERGENCE_AUDIT.md`：P19 的真实实施结论。

### 2.3 工程实现阅读路线

不要从 5,000 多行的根页面顺序通读。按一条用户链纵向阅读：

| 用户链 | 阅读顺序 |
| --- | --- |
| 添加/编辑任务 | `src/screens/QuadrantHomeScreen.tsx` → `src/app/taskWorkspaceRuntime.tsx` → `src/application/coreAppService.ts` → `src/data/taskRepository.ts` |
| 四象限持续布局 | `src/components/QuadrantTaskMap.tsx` → `src/domain/quadrantTaskLayout.ts` → `src/data/quadrantTaskLayoutStore.ts` → `QuadrantHomeScreen.commitTaskLayout` |
| Sheet 关闭与脏状态 | `src/components/AppBottomSheet.tsx` → 各 Sheet 的 `dismissPolicy` / `onRequestClose` → `tests/p19-release-convergence/bottomSheetReliability.test.tsx` |
| 草稿跨进程恢复 | `src/data/taskDraftStore.ts` → `src/app/taskWorkspaceRuntime.tsx` → `tests/p19-release-convergence/taskDraftRestart.test.tsx` |
| 专注开始、恢复、结算 | `src/app/focusSessionRuntime.tsx` → `src/application/currentFocusSessionService.ts` → `src/application/focusSessionService.ts` → `src/data/focusSessionRepository.ts` |
| 专注备份兼容 | `src/data/focusSessionBackupValidation.ts` → `src/application/localBackupService.ts` → P18 备份测试 |
| 本地日期与统计 | `src/domain/localDate.ts` → `src/presentation/focusSummary.ts` → `src/application/dayClosureService.ts` / `src/screens/PostFocusReviewScreen.tsx` |
| Android internal 隔离 | `android/app/build.gradle` → `tests/p19-release-convergence/internalBuildIsolation.test.ts` |

## 3. 阶段研究地图

| 阶段 | 核心研究问题 | 已形成能力 | 当前处理原则 |
| --- | --- | --- | --- |
| P0–P6 | 用户能否打开即看懂并完成四象限核心闭环 | 默认四象限、真实 CRUD、精确 5 分钟专注、成长反馈、备份兼容 | 已完成，不重做数据源或一级导航 |
| P7–P10 | 如何用本地证据改善开始率而不制造打扰 | 指标、推荐、提醒预算、延后/跳过治理 | 作为效果证据层维护，不扩展云端分析 |
| P11–P14 | 长期使用是否可靠、可恢复、可访问 | 长任务、计划、恢复事务、5000 条规模、无障碍 | 备份合并仍受 P14-02B 安全门阻断 |
| P15R–P18 | 页面和交互是否围绕核心行动统一 | 四页架构、日程、语义成长、设置、1000ms 持续布局 | 已完成自动门；保持 schema 兼容 |
| P19 | 能否安全退出、恢复、避免重复提交并进入发布验收 | 统一 Sheet、返回优先级、脏状态、草稿恢复、本地日期、独立 internal 包 | 自动能力已落地；继续设备与用户证据 |
| R20-01 | 当前契约与历史质量门能否在不弱化断言的前提下统一 | 8 个根因有审计裁决；17 个 accepted roots 全绿 | PASS；下一门为 R20-02 Android 完整设备矩阵 |
| R20-02 | 当前 Android 包能否通过尺寸、字体、主题、手势、可访问性与生命周期设备矩阵 | 48 组自动采集 runner 和可恢复设备设置边界已落地 | IN_PROGRESS；当前没有 online 设备，不伪造 DEVICE PASS |

## 4. P19 最新进展学习教程

### 4.1 第一课：把界面按类型治理，而不是统一加手势

先读 `docs/P19_RELEASE_CONVERGENCE_AUDIT.md` 的“界面清点”和“返回优先级”，再读 `src/components/AppBottomSheet.tsx`。

重点理解：

- Bottom Sheet、全屏二级页、Dialog、持续布局 Overlay 是四种不同退出契约。
- 返回优先级是：键盘 → 确认框 → Sheet → 布局模式 → 二级页 → 主页面/App。
- 一个返回动作只能关闭最上层，关闭回调必须单飞。
- Sheet 内容未滚到顶部时优先滚动；到顶部继续下拉才转成交互关闭。

对应验证：`tests/p19-release-convergence/bottomSheetReliability.test.tsx`。

### 4.2 第二课：临时输入也属于可靠数据

阅读 `src/data/taskDraftStore.ts` 和 `src/app/taskWorkspaceRuntime.tsx`。

重点理解：

- 正式任务 schema 没有为草稿而改变。
- 草稿使用 `start-five.task-drafts.v1`、version 1、30 天 TTL。
- 创建草稿和编辑草稿按 ID 隔离；坏记录单独丢弃，不能阻止 App 启动。
- 成功提交或用户明确放弃后删除草稿；异常终止后能够恢复。

对应验证：`tests/p19-release-convergence/taskDraftRestart.test.tsx`、`draftAndDateReliability.test.ts`。

### 4.3 第三课：手势只负责意图，业务提交仍走服务层

阅读 `QuadrantTaskMap.tsx`、`quadrantTaskLayout.ts` 和 `QuadrantHomeScreen.commitTaskLayout`。

重点理解：

- `idle / armed / dragging / committing` 是单一状态机。
- 1000ms 长按进入持续选中；同一手势或第二次触碰都能拖动。
- 位置以象限内容区内归一化中心坐标保存，视图尺寸变化后仍可恢复。
- 同象限只写布局；跨象限先更新任务语义，再写布局；失败时回滚并刷新真实 repository 状态。
- 无障碍操作必须能替代自由拖动。

对应验证：`tests/p15r-task-layout-mode/quadrantTaskLayout.test.ts`、`quadrantTaskGesture.test.tsx`。

### 4.4 第四课：日期口径必须显式本地化

阅读 `src/domain/localDate.ts`、`src/presentation/focusSummary.ts` 和 `src/application/dayClosureService.ts`。

重点理解：

- “今日”必须使用显式 IANA 时区，而不是截取 UTC 日期。
- 非法时区安全回退 UTC。
- 不足一分钟不能误导性显示为“0 分钟”。
- 结算、今日汇总、今日回顾和历史入口必须共享同一口径。

### 4.5 第五课：运行中专注与历史记录是不同职责

阅读 `src/app/currentStartFiveApp.tsx`、`src/application/currentFocusSessionService.ts`、`src/data/currentFocusSessionRepository.ts`、`src/data/currentFocusSessionStorage.ts` 和 `src/data/focusSessionRepository.ts`。

重点理解：

- 当前活动会话需要独立恢复入口，不能依赖页面内存。
- 活动会话、已结算历史和 durable receipt 必须避免重复结算。
- 备份导入必须经过 `src/data/focusSessionBackupValidation.ts`，保留旧版本兼容并拒绝不一致状态。

### 4.6 第六课：internal 构建不能覆盖用户正式数据

阅读 `android/app/build.gradle` 与 `tests/p19-release-convergence/internalBuildIsolation.test.ts`。

当前 internal 使用：

- applicationId：`com.startfive.app.internal`
- versionName：`1.0-internal`
- 与设备上的 `com.startfive.app` 并存

此隔离只解决内部测试覆盖正式包的问题，不代表已具备 Play Store 发布签名、AAB、版本治理和商店合规。

## 5. 从现在开始的研究路线

以下顺序是门禁，不建议并行引入新产品模块。

`docs/CURRENT_PRODUCT_RISK_AUDIT.md` 中的 P0/P1/P2 不建立第二条阶段主线：设备、字体、拖动、通知和生命周期证据进入 R20-02；iOS 证据进入 R20-03；认知、可发现性和心理安全假设进入 R20-04；定点界面优化进入 R20-05；版本、签名、诊断和反馈治理进入 R20-06。设置静默失败、启动空白态和错误诊断属于进入发布候选前必须关闭的源码可靠性项。

### R20-01：历史契约兼容性收口

状态：`PASS`（2026-08-22）。完整处置证据见 `docs/R20_01_CONTRACT_DISPOSITION.md`。

完成结果：

1. 原始 18 suites / 32 tests 已逐项映射到 5 个稳定根因；本轮运行环境另识别 3 个隔离根因。
2. 最终裁决为 KEEP 1、MIGRATE 3、RETIRE 0、ISOLATE 4；没有删除断言、跳过测试或恢复过时产品行为。
3. Android 自定义生成目录只在测试 inventory 层隔离，生产源码扫描和污染断言保持不变。
4. 17 个 accepted roots 的完整 77 suites / 839 tests 在规范化 Windows TEMP 下连续两次全绿。
5. TypeScript 与 Android internal 构建均通过。

结束结论：R20-01 已关闭；当前主线转入 R20-02，不能把自动回归结果替代设备矩阵。

### R20-02：Android 完整设备矩阵

状态：`IN_PROGRESS / PENDING_DEVICE`。当前执行记录见 `docs/R20_02_ANDROID_DEVICE_MATRIX_PROGRESS.md`。

以 `docs/P19_DEVICE_UTEST_ACCEPTANCE.md` 为唯一执行表，至少覆盖：

- 320dp、360dp、412dp；fontScale 1.0、1.3、1.6、2.0。
- 浅色、深色、减少动态、TalkBack。
- 所有 Sheet 的把手、内容滚动、下拉、遮罩、关闭按钮和系统返回。
- 四象限两种拖动路径、页面滚动竞争、跨象限失败回滚。
- 通知点击/延后/跳过/开始、后台、杀进程、系统重启。
- 备份、安全替换、全量清除和快速连点。

结束条件：形成逐项设备、系统、fontScale、结果、截图/录屏和复现步骤；不能只写“真机通过”。

### R20-03：iOS 构建与可访问性

需要 macOS/Xcode：

1. 编译当前 iOS 工程并记录 Xcode/iOS 版本。
2. 验证 VoiceOver、动态字体、安全区、键盘、Sheet 手势。
3. 验证通知动作、前后台计时和常亮恢复。
4. 记录失败路径，不用 Android 结果替代 iOS 证据。

### R20-04：首次用户测试

至少 5 名未阅读说明的目标用户，无指导完成：

`创建并编辑任务 → 调整象限和位置 → 开始并结束专注 → 安排下一次 → 关闭主要 Sheet → 修改设置 → 找到备份 → 返回象限首页`

记录卡住、误点、找不到出口、需要解释的位置和用户原话。开发者提示后完成不计为通过。

### R20-05：P2 定点优化

只依据 R20-02/R20-04 的证据修复：

- 320dp + 最大字体的间距与换行。
- Sheet 回弹、奖励条和 Snackbar 动效节奏。
- 真实用户反复出现的可发现性问题。

不做全量品牌重设计，不新增 AI、社区、账号或新后端。

### R20-06：发布候选工程

前置条件：R20-01 至 R20-04 有可接受证据。

需要补齐：受管 release keystore、versionCode/versionName 升级、AAB、签名与供应链检查、隐私说明、崩溃与回滚方案、Play/App Store 门禁。完成前保持 `PENDING_EXTERNAL`，不得写 `RELEASE_READY`。

## 6. 当前明确不做

- 不重做 P0–P18，不另建第二套任务、专注、成长或备份数据源。
- 不开放 P14-02B 备份合并；引用重映射服务未完整前保持 `BLOCKED_SPEC_GUARD`。
- 不用自动测试替代 TalkBack、VoiceOver、通知和首次用户测试。
- 不为缩短 `QuadrantHomeScreen.tsx` 而机械拆分。
- 不引入新的全局状态框架或大型手势依赖。
- 不在没有设备证据时进行全量视觉与动效重做。

## 7. 当前可重复验证命令

在项目根目录执行：

```powershell
$env:TEMP = 'D:\CodexData\Temp'
$env:TMP = 'D:\CodexData\Temp'
$registry = Get-Content .\quality-gate.acceptance.json -Raw | ConvertFrom-Json
$roots = @($registry.locks | Where-Object status -eq 'accepted' | ForEach-Object testRoots | Sort-Object -Unique)
node .\node_modules\jest\bin\jest.js --runInBand --ci --coverage=false --roots $roots
node .\node_modules\typescript\bin\tsc --noEmit
powershell -ExecutionPolicy Bypass -File .\scripts\build-android-internal.ps1
adb devices -l
```

2026-08-22 本轮已重新执行：完整 accepted inventory 连续两次均为 77/77 suites、839/839 tests PASS；TypeScript PASS；`:app:lintInternal` PASS；`:app:assembleInternal` PASS。新 APK 为 `android/app/build/outputs/apk/internal/app-internal.apk`，大小 `20,294,203 bytes`，SHA-256 `611cda1c846869a1a257f7c44b11ce67aa2d3d5dc235fe0b055c90241a2ef2df`。构建时本轮变更尚未提交，证据类型为 `WORKTREE_BUILD`，不得描述为绑定正式 commit 的发布候选。设备证据仍沿用 `docs/P19_RELEASE_CONVERGENCE_AUDIT.md` 中已明确标注范围的记录，本轮未把构建成功写成真机通过。

## 8. 文档权威顺序

出现冲突时，按以下顺序判断当前事实：

1. 当前源码、测试和构建产物。
2. `docs/CURRENT_RESEARCH_ROUTE.md`。
3. `docs/CURRENT_PRODUCT_RISK_AUDIT.md`。
4. `docs/P19_RELEASE_CONVERGENCE_AUDIT.md`。
5. `docs/CODEX_P15R_P18_PROGRESS.md`。
6. 各阶段规格和历史执行指令。
7. `docs/NEXT_CHAT_HANDOFF.md` 仅保留 P0–P6 历史交接背景，不再代表当前阶段。
