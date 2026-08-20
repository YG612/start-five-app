# CODEX P15R–P18 Progress

更新时间：2026-08-21（Asia/Shanghai）

## 基线

- 项目：`D:/CodexData/Workspaces/Codex/2026-07-20/android-ios-app-readme-md-prd/outputs/start-five`
- 规格：`docs/CODEX_P15R_P18_UNIFIED_INTERACTION_AND_PAGE_EXPERIENCE_SPEC.md`
- 截图：`references/current_quick_add.jpg`、`references/current_quick_edit.jpg`
- Task Repository envelope：version `1`
- priority/support/growth schema：version `1`
- backup schema：version `4`（version `1`、`2`、`3` 导入兼容保留）
- P0–P14：40 suites、247/247 tests PASS
- P14 APK SHA-256：`cd720dd410bfede498d6f9fdaf9f67fcb2b714b87e69577911575797e627270d`

## 阶段状态

| ID | 状态 | 真实实现路径 | 备注 |
| --- | --- | --- | --- |
| P15R-00 | DONE | `src/screens/QuadrantHomeScreen.tsx`、`src/screens/TaskOrganizerSheet.tsx`、`src/screens/TaskProgressSheet.tsx` | 有限映射完成 |
| P15R-01 | DONE | `src/components/AppBottomSheet.tsx`、`src/screens/QuadrantHomeScreen.tsx`、`src/screens/TaskOrganizerSheet.tsx`、`src/screens/TaskProgressSheet.tsx` | 公共 Sheet、统一退出、拖动阈值、导航遮挡 |
| P15R-02 | DONE | `src/screens/QuadrantHomeScreen.tsx`、`src/app/taskWorkspaceRuntime.tsx` | 固定主按钮、安全退出保存、稳定 draft 幂等键 |
| P15R-03 | DONE | `src/screens/QuadrantHomeScreen.tsx` | 编辑主次、状态修正、低频动作收纳 |
| P15R-04 | DONE_AUTO | `src/screens/QuadrantHomeScreen.tsx`、`src/domain/taskPriority.ts` | 长按直接拖动与越界取消；DEVICE 待测 |
| P15R-04B TASK PERSISTENT LAYOUT MODE | DONE_AUTO | `src/components/QuadrantTaskMap.tsx`、`src/domain/quadrantTaskLayout.ts`、`src/data/quadrantTaskLayoutStore.ts` | 1000ms 持续选中、同手势/二次触碰拖动、象限内位置、跨象限提交与 v4 备份完成；DEVICE 待测 |
| P15R-05 | DONE | `src/domain/taskDisplay.ts`、`src/screens/QuadrantHomeScreen.tsx` | 紧凑语义标签与拖动态完整标题 |
| P15R-06 | DONE | `src/screens/QuadrantHomeScreen.tsx` | 重复入口和顶部密度收口 |
| P15R-07 | DONE_AUTO | `src/screens/QuadrantHomeScreen.tsx`、`src/components/AppBottomSheet.tsx` | 深色选中面与用户语言收口；DEVICE 待测 |
| P15R-08 | DONE | `src/components/AppBottomSheet.tsx`、`src/screens/TaskOrganizerSheet.tsx`、`src/screens/TaskProgressSheet.tsx` | 同类 Sheet 迁移完成 |
| P15R-09 SOURCE_GATE | DONE | `tests/p15r-core-interaction`、`tests/gap-p0-06r3/taskWorkspaceMutationRecovery.contract.test.tsx` | 自动化、TypeScript、Android lint/build 通过 |
| P15R-09 RELEASE_GATE | PENDING_EXTERNAL | `docs/CODEX_P15R_P18_PROGRESS.md` | ADB 设备 0；UTEST 未执行 |
| P15-00 | DONE | `src/screens/QuadrantHomeScreen.tsx`、`src/components/AppPage.tsx`、`src/domain/pageExperience.ts` | 页面角色与现有数据入口映射完成 |
| P15-01 | DONE | `src/components/AppPage.tsx` | 页面、标题、主视觉、分区、设置行、指标、提示、按钮与底部行动组件完成 |
| P15-02 | DONE | `src/screens/QuadrantHomeScreen.tsx` | 象限页移除常驻成长条与常驻低能量入口，保留单一主行动 |
| P15-03 | DONE | `src/screens/QuadrantHomeScreen.tsx`、`src/domain/pageExperience.ts` | 专注页活动状态、下一项、快捷时长、今日三项与折叠入口完成 |
| P15-04 | DONE | `src/screens/QuadrantHomeScreen.tsx`、`src/domain/pageExperience.ts` | 成长页主视觉、今日/本周指标、单条建议与折叠记录完成 |
| P15-05 | DONE | `src/screens/QuadrantHomeScreen.tsx` | 我的页六组设置与二级设置 Sheet 完成 |
| P15-06 | DONE_AUTO | `src/screens/QuadrantHomeScreen.tsx`、`tests/p15-page-architecture/p15Experience.test.tsx` | 四项底部导航与活动专注隐藏导航通过自动化；DEVICE 待测 |
| P15 SOURCE_GATE | DONE | `tests/p15-page-architecture` | P15 定点、合并回归、TypeScript、Android lint/build 通过 |
| P15 RELEASE_GATE | PENDING_EXTERNAL | `docs/CODEX_P15R_P18_PROGRESS.md` | ADB 设备 0；Android DEVICE / UTEST 未执行 |
| P16-01 | DONE | `src/domain/focusSchedule.ts`、`src/data/focusScheduleRepository.ts`、`src/application/localBackupService.ts` | 日程/事件模型、schema v2、坏记录隔离与备份纳入完成 |
| P16-02 | DONE | `src/domain/pageExperience.ts`、`src/screens/QuadrantHomeScreen.tsx` | 四来源统一议程、优先级、五分钟去重、今日三项与冲突提示完成 |
| P16-03 | DONE | `src/application/focusScheduleService.ts`、`src/screens/QuadrantHomeScreen.tsx` | 四步创建/编辑、默认时长、任务绑定、暂停与删除完成 |
| P16-04 | DONE | `src/application/focusScheduleService.ts`、`src/application/tomorrowFirstNotifications.ts`、`android/app/src/main/java/com/startfive/app/notifications/NotificationAlarmReceiver.kt`、`android/app/src/main/java/com/startfive/app/notifications/StartFiveNotificationsModule.kt` | 下一次提醒、动作、幂等、跳过/延后与原生回传完成 |
| P16-05 | DONE_AUTO | `src/screens/QuadrantHomeScreen.tsx`、`src/app/focusSessionRuntime.tsx`、`android/app/src/main/java/com/startfive/app/notifications/StartFiveNotificationsModule.kt` | 活动页降噪、持续通知、后台中断提示与提前结束救援完成；DEVICE 待测 |
| P16-06 | DONE | `src/screens/QuadrantHomeScreen.tsx` | 专注后四种下一步选择保留并接入日程结算 |
| P16 SOURCE_GATE | DONE | `tests/p16-focus-schedules`、`tests/p14-reliability-accessibility/p14Reliability.test.ts` | P16 定点、P0–P16 合并回归、TypeScript、Android lint/build 通过 |
| P16 RELEASE_GATE | PENDING_EXTERNAL | `docs/CODEX_P15R_P18_PROGRESS.md` | ADB 设备 0；Android DEVICE / UTEST 未执行 |
| P17-00 | DONE | `src/domain/semanticGrowth.ts`、`src/domain/pageExperience.ts` | 指标真实性与旧数据质量分级完成 |
| P17-01 | DONE | `src/domain/focusSession.ts`、`src/application/focusSessionService.ts`、`src/data/focusSessionRepository.ts`、`src/app/startFiveApp.tsx` | 开始时任务语义快照、存储 v2、v1 读取与备份恢复完成 |
| P17-02 | DONE | `src/domain/semanticGrowth.ts`、`src/domain/pageExperience.ts` | 两分钟边界、首次去重、本地日/周、成长区与修复恢复聚合完成 |
| P17-03 | DONE | `src/screens/QuadrantHomeScreen.tsx`、`src/domain/growth.ts` | 语义化成长 Hero、单位、真实行动入口完成 |
| P17-04 | DONE | `src/domain/semanticGrowth.ts`、`src/screens/QuadrantHomeScreen.tsx` | 连续主动开始、本周天数与温和中断表达完成 |
| P17-05 | DONE | `src/domain/growthInsights.ts`、`src/data/quadrantHomePreferences.ts`、`src/screens/QuadrantHomeScreen.tsx` | 单条可执行建议、样本门槛、真实日程动作与 30 天多建议冷却完成 |
| P17-06 | DONE | `src/screens/QuadrantHomeScreen.tsx`、`src/screens/CoreFlowScreen.tsx` | 用户端奖励文案统一为成长值，既有奖励幂等保留 |
| P17 SOURCE_GATE | DONE | `tests/p17-semantic-growth` | P17 定点、P0–P17 合并回归、TypeScript、Android lint/build 通过 |
| P17 RELEASE_GATE | PENDING_EXTERNAL | `docs/CODEX_P15R_P18_PROGRESS.md` | Android DEVICE / UTEST 与 iOS 未执行 |
| P18-01 | DONE | `src/data/quadrantHomePreferences.ts`、`src/domain/focusDurationRecommendation.ts`、`src/screens/QuadrantHomeScreen.tsx` | 2/5/15/25/50 分钟、工作日、开始时段、保护强度与常亮默认值只作用于新日程；偏好纳入本地存储和备份 |
| P18-02 | DONE | `src/data/quadrantHomePreferences.ts`、`src/screens/QuadrantHomeScreen.tsx` | 任务与象限规则集中到“我的”；修改提示影响并提供撤销；既有分数不删除 |
| P18-03 | DONE | `src/application/tomorrowFirstNotifications.ts`、`src/platform/nativeTomorrowFirstNotifications.android.ts`、`src/platform/nativeTomorrowFirstNotifications.ios.ts`、`android/app/src/main/java/com/startfive/app/notifications/StartFiveNotificationsModule.kt`、`ios/StartFive/StartFiveNotifications.swift`、`ios/StartFive/StartFiveNotificationsBridge.m`、`src/screens/QuadrantHomeScreen.tsx` | 权限惰性请求、提醒偏好、App 内减少干扰、专注常亮、完成震动与声音接入；未提供应用阻断入口 |
| P18-04 | DONE_AUTO | `src/components/AppPage.tsx`、`src/screens/QuadrantHomeScreen.tsx`、`tests/p18-settings-reliability/performanceAndAccessibility.test.ts` | 外观、减少动态、屏幕阅读器偏好和最大字体源码门禁通过；TalkBack / DEVICE 待测 |
| P18-05 | DONE | `src/application/localBackupService.ts`、`src/data/taskRepository.ts`、`src/screens/LocalBackupScreen.tsx`、`src/screens/QuadrantHomeScreen.tsx` | 本机数据概览、安全替换、备份日期、全量清除与精确确认完成；备份合并仍无执行按钮 |
| P18-06 | DONE | `src/screens/QuadrantHomeScreen.tsx` | 帮助、备份说明、反馈状态和版本信息可发现；首次启动不强制弹出帮助 |
| P18-07 | DONE_AUTO | `src/domain/pageExperience.ts`、`src/components/AppPage.tsx`、`tests/p18-settings-reliability/performanceAndAccessibility.test.ts` | 成长聚合 memoized selector 与 5000 任务自动化通过；多尺寸真机视觉 QA 待测 |
| P18 SOURCE_GATE | DONE | `tests/p18-settings-reliability`、`android/app/build/reports/lint-results-internal.html`、`android/app/build/outputs/apk/internal/app-internal.apk` | P18 定点、P0–P18 合并回归、TypeScript、Android lint/build 全部通过 |
| P18 RELEASE_GATE | PENDING_EXTERNAL | `docs/P18_DEVICE_UTEST_ACCEPTANCE.md` | `adb devices -l` 返回设备数 0；Android DEVICE / UTEST 与 iOS 验收未执行 |

## 数据变化

- 持久化任务模型：无字段变化。
- 专注日程存储：`start-five.focus-schedules.v2`，envelope schema `start-five.focus-schedules` / version `2`；单条坏日程或事件隔离。
- 备份版本：schemaVersion `4`，新增 `quadrantTaskLayout` store；schemaVersion `1`、`2`、`3` 解析兼容保留。
- 四象限任务布局：key `start-five.quadrant-task-layout.v1`，envelope version `1`；按 `taskId` 保存目标象限内容区内归一化中心坐标，单条坏记录隔离，孤儿记录惰性清理。
- 日程事件幂等键：`focus-schedule-event:${scheduleId}:${localDateKey}:${type}`；启动键：`focus-schedule-start:${scheduleId}:${localDateKey}`。
- 专注会话存储：key 保持 `start-five.focus-sessions.v1`；envelope version `2`，新增可选 `FocusContextSnapshot`；version `1` 读取与备份恢复兼容保留。
- 象限首页偏好：version `7`，新增 P18 专注、任务、提醒、无障碍和备份日期偏好；version `1`–`6` 读取迁移保留，旧 `45` 分钟默认迁移为 `50`。
- 草稿状态：仅 `src/screens/QuadrantHomeScreen.tsx` 内存态，不持久化。
- 创建幂等键：`p15r:${draftId}`；由 `src/app/taskWorkspaceRuntime.tsx` 映射到既有 operation ledger，同一草稿失败重试复用 operationId，成功后释放。
- P15 页面体验：复用现有任务、计划、专注历史、成长与设置数据；无新增持久化字段、迁移或 schema 版本。

## 测试

- P15R 定点：2 suites、7/7 tests PASS。
- 原 P0–P14：40 suites、247/247 tests PASS；历史恢复契约入口已迁移到当前四象限 UI，业务断言保留。
- P15R 合并回归：42 suites、254/254 tests PASS。
- P15 定点：2 suites、6/6 tests PASS。
- 当前合并回归：44 suites、260/260 tests PASS。
- P16 定点：4 suites、12/12 tests PASS。
- P0–P16 当前合并回归：48 suites、272/272 tests PASS。
- P17 定点：3 suites、11/11 tests PASS。
- P0–P17 当前合并回归：51 suites、283/283 tests PASS。
- P18 定点：3 suites、9/9 tests PASS。
- P15R-04B 定点：1 suite、9/9 tests PASS；包含 schemaVersion 1～4 备份兼容。
- 原 P0–P14：40 suites、247/247 tests PASS。
- P15R–P18 新增：45/45 tests PASS。
- P0–P18 当前合并回归：54 suites、292/292 tests PASS。
- TypeScript：`tsc --noEmit` PASS。
- Android `:app:lintInternal`：PASS，`BUILD SUCCESSFUL`。
- Android `:app:assembleInternal`：PASS，`BUILD SUCCESSFUL`。
- JavaScript lint：`package.json` 无 lint script，未声称通过。
- Android DEVICE / UTEST：`PENDING_EXTERNAL`；`adb devices -l` 返回设备数 `0`。
- iOS build / DEVICE：`PENDING_MACOS_XCODE`。

## 构建产物

- APK：`android/app/build/outputs/apk/internal/app-internal.apk`
- size：`20,232,475` bytes
- SHA-256：`0020bcb4e4348bfa6009720d8cf673d878adaeb92fa3f0b61a9c4864e8045d17`
- applicationId：`com.startfive.app`
- versionCode：`1`
- versionName：`1.0`
- 签名：debug key，仅供 internal 测试。

## 2026-08-20 四象限交互可靠性修复

| 项目 | 状态 | 真实路径 / 结果 |
| --- | --- | --- |
| 地图任务长按拖动 | DONE_AUTO | `src/screens/QuadrantHomeScreen.tsx`；任务节点触摸起始响应器、独立象限添加按钮、拖动目标与松手更新链路 |
| 任务弹层标题去重 | DONE_AUTO | `src/screens/QuadrantHomeScreen.tsx`；标题与象限/截止信息只由 `AppBottomSheet` 头部渲染 |
| 进度保存链路 | DONE_AUTO | `src/domain/task.ts`、`src/application/coreAppService.ts`、`src/domain/taskExecutionPlan.ts`、`src/domain/taskSupport.ts`、`src/domain/quadrantHome.ts`、`src/screens/TaskProgressSheet.tsx`、`src/screens/QuadrantHomeScreen.tsx` |
| 专注启动冲突 | DONE_AUTO | `src/screens/QuadrantHomeScreen.tsx`；已有同任务专注恢复、活动会话冲突恢复 |
| 错误提示收口 | DONE_AUTO | `src/screens/QuadrantHomeScreen.tsx`；页面级任务错误合并为单个固定横幅，关闭弹层清理历史错误 |
| 回归测试 | PASS | `tests/p7-user-metrics/p7Experience.test.tsx`、`tests/quadrant-refactor/quadrantHomeScreen.test.tsx`；P7–P18 与四象限合并回归 44 suites、203/203 tests |
| TypeScript | PASS | `tsc --noEmit` |
| Android lint | PASS | `android/app/build/reports/lint-results-internal.html` |
| Android internal APK | PASS | `android/app/build/outputs/apk/internal/app-internal.apk`；20206123 bytes；SHA-256 `1cffa39c0b7f03a69c5b4e7b78197e7b7edb4a467883e227aabad92c58fd9166` |
| Android DEVICE | PENDING_EXTERNAL | 待连接设备验证长按 320ms、跨四象限拖放、进度保存与专注恢复 |

## 2026-08-21 P15R-04B TASK PERSISTENT LAYOUT MODE

| 项目 | 状态 | 真实路径 / 结果 |
| --- | --- | --- |
| 旧行为保留记录 | HISTORICAL | P15R-04 为 320ms 长按后直接拖动，松手退出，无象限内位置持久化 |
| 集中状态机 | DONE_AUTO | `src/domain/quadrantTaskLayout.ts`；`idle / armed / dragging / committing`，1000ms 长按、10dp 预选取消、6dp 拖动阈值 |
| 双阶段拖动 | DONE_AUTO | `src/components/QuadrantTaskMap.tsx`；长按后同一手势继续拖动，或松手保持选中后再次触碰拖动 |
| 地图覆盖层与命中 | DONE_AUTO | 地图统一坐标、四象限真实测量、任务中心命中、原位占位、地图级覆盖层、拖动时关闭父滚动 |
| 象限内布局 | DONE_AUTO | 归一化中心坐标、内容区边界、网格吸附、确定性最近空位、同象限只写布局 |
| 跨象限提交 | DONE_AUTO | `src/screens/QuadrantHomeScreen.tsx`；通过既有 `runtime.updateTask` 更新语义，布局写入失败时回滚优先级并刷新真实状态 |
| 持久化 | DONE_AUTO | `src/data/quadrantTaskLayoutStore.ts`；独立 version 1 envelope、坏记录隔离、孤儿过滤 |
| 备份 | DONE_AUTO | `src/application/localBackupService.ts`；当前导出 schemaVersion 4，version 1～3 合法备份继续通过解析 |
| 减少动态 / 无障碍 | DONE_AUTO | 减少动态使用静态选中效果；`accessibilityState.selected`、完整任务语义和四象限移动 action 保留 |
| 定点测试 | PASS | `tests/p15r-task-layout-mode/quadrantTaskLayout.test.ts`；1 suite、9/9 tests |
| P7–P18 / P15R / 四象限合并回归 | PASS | 45 suites、212/212 tests |
| TypeScript | PASS | `tsc --noEmit` |
| Android lint | PASS | `:app:lintInternal`；`BUILD SUCCESSFUL` |
| Android internal APK | PASS | `android/app/build/outputs/apk/internal/app-internal.apk`；20,232,475 bytes；SHA-256 `0020bcb4e4348bfa6009720d8cf673d878adaeb92fa3f0b61a9c4864e8045d17` |
| Android DEVICE / UTEST | PENDING_EXTERNAL | `adb devices -l` 返回设备数 0；1000ms 选中、两条拖动路径、滚动竞争、TalkBack 和多尺寸尚未真机执行 |

## 未完成与风险

- Android 真机 1000ms 持续选中、同手势/二次触碰拖动、滚动竞争、键盘、系统返回、TalkBack、最大字体、通知动作、常亮/反馈和首次用户 UTEST 尚无设备执行；执行脚本见 P15R-04B 指令与 `docs/P18_DEVICE_UTEST_ACCEPTANCE.md`。
- iOS 编译、VoiceOver 和真机验证需要 macOS/Xcode。
- Gradle 9.3.1 报告 deprecated features；当前 lint/build 通过，Gradle 10 升级兼容性未处理。
- P14-02B 仍为 `BLOCKED_SPEC_GUARD`，本阶段未改动备份合并语义。
