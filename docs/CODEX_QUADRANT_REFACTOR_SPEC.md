# “先做 5 分钟”四象限重构执行基线

> 执行说明：本文件是对 `SOURCE_先做5分钟_APP_Codex完整重构指令.docx` 的仓库内执行摘要。原 Word 始终是最终产品与验收权威；发生冲突时以 Word 为准。

## 产品北极星

1. 打开即看到：冷启动直接进入可交互四象限地图。
2. 点击即修改：点击任务节点或任务行，直接打开快速编辑面板。
3. 一键即开始：首页最多两次点击启动与该任务精确绑定的 5 分钟专注。
4. 完成立即成长：完成后即时显示积分、原因和成长进度，不跳转阻断式结算页。

## 阶段 0：真实仓库映射（2026-08-14）

### 技术栈

- React Native 0.86.0 / React 19.2.3。
- TypeScript 5.9，`strict`、`noUncheckedIndexedAccess`、`exactOptionalPropertyTypes` 均开启。
- 本项目没有引入导航库；根路由由 React 状态和组合根直接控制。
- 本地持久化为 AsyncStorage 兼容后端上的版本化自定义仓储。
- Jest 29.7 + React Native Testing Library。
- 包管理器：pnpm（`pnpm-lock.yaml`）。

### 模块路径

- 原生应用入口：`App.tsx`。
- 组合根与启动判定：`src/app/startFiveApp.tsx`。
- 新默认首页：`src/screens/QuadrantHomeScreen.tsx`。
- 旧任务工作台兼容层：`src/screens/TaskWorkspaceScreen.tsx`。
- 页面单一状态源：`src/app/taskWorkspaceRuntime.tsx`。
- Task Repository：`src/data/taskRepository.ts`。
- 本地任务存储/版本兼容：`src/data/persistentTaskStorage.ts`。
- Task Lifecycle：`src/application/coreAppService.ts#createTaskLifecycleService`。
- 旧象限真值与投影：`src/domain/quadrant.ts`。
- 新四象限 UI 适配/空间投影：`src/domain/quadrantHome.ts`。
- 地图/清单视图偏好：`src/data/quadrantHomePreferences.ts`。
- 5 分钟专注服务：`src/application/focusSessionService.ts`。
- 专注运行时与恢复：`src/app/focusSessionRuntime.tsx`。
- 积分与象限基数：`src/domain/scoring.ts`。
- 本地提醒：`src/application/tomorrowFirstNotifications.ts`。
- 备份、恢复和校验：`src/application/localBackupService.ts`。
- 定点重构测试：`tests/quadrant-refactor/`。

### 兼容策略

- 继续以 `Q1`～`Q4` 和 `important` / `urgent` 布尔字段作为持久化真源，不为视觉坐标新增破坏性 Schema。
- 新 UI 适配固定为：右上救火、右下成长、左上干扰、左下清理。
- 旧任务采用稳定 ID 偏移生成地图点，仅影响显示；不写入数据库。
- 创建、编辑、开始、完成均调用现有 Lifecycle / Focus / Repository；不建立第二套数据系统。
- 旧存储和旧备份无需迁移即可加载；后续若引入连续优先级分数，再单独增加 Schema 迁移。

## P0～P6 完成记录（2026-08-14）

| 阶段 | 完成内容 |
| --- | --- |
| P0 | 完成仓库与 Word 基线审计；冻结 `Q1`～`Q4`、计分、推荐、任务与备份 Schema 边界。 |
| P1 | `QuadrantHomeScreen` 成为组合根默认首页；首次用户无需登录或激活表单即可进入；主导航固定为“象限 / 专注 / 成长 / 我的”。 |
| P2 | 地图和四区纵向清单共用 `TaskWorkspaceRuntime`；固定坐标、稳定节点偏移、最多 6 个节点和“+N 项”入口、选中/推荐状态、视图偏好持久化均完成。 |
| P3 | 完成真实创建、编辑、显式删除确认、跨象限移动、350ms 长按拖拽、5 秒移动撤销、完成与完成撤销；所有写入继续通过持久事务与 operation ledger。提醒在任务变更和启动恢复后协调，通知冷/热点按精确任务打开编辑器。 |
| P4 | 首页至精确任务专注不超过两次点击；5/15 分钟复用 Focus Runtime；专注后复盘压缩为非阻断底部浮层；结算、重复提交与积分继续幂等；成长页显示累计进度和最近奖励原因。 |
| P5 | 旧任务、旧备份和恢复 journal 保持兼容；首页偏好独立升级到 v2，支持 system/light/dark、减少动态和渐进式三步提示；关键控件补齐角色/标签/触控尺寸，编辑器支持字体放大滚动。Android 提醒时间解析已兼容 minSdk 24。 |
| P6 | TypeScript 严格检查通过；13 个定点套件、89 项测试通过；Android `lintInternal`、Kotlin/Java 编译、`assembleInternal` 通过并生成离线 APK。 |

## 最终验收证据

- 定点测试范围：冻结领域规则、公共类型与运行时表面、四象限领域/UI、专注复盘、明日首项提醒、本地备份；结果 13 套件 / 89 项全部通过。
- Android internal APK：`android/app/build/outputs/apk/internal/app-internal.apk`。
- APK 大小：19,888,830 bytes；SHA-256：`252aa6d355e85b2fb3c0562f893da810c40d8dba04cfa9a16a01177018c7d706`。
- 当前 Windows 环境未连接 ADB 设备，因此真机冷启动、触摸拖拽和屏幕阅读器走查未执行；iOS 原生编译仍需 macOS/Xcode。这两项属于外部设备/平台验收，不是待实现源码功能。

本轮继续暂停 AI、社区/伙伴、城市/宠物/商店/会员、语音/图片识别、时间轴、复杂报告、新后端/账号体系及与核心闭环无关的架构重写。
