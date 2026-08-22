# 先做5分钟（Start Five）

一个以“先开始五分钟”为核心行为入口的本地优先任务管理 App。项目采用 React Native + TypeScript，同时保留 Android 与 iOS 原生工程。

> 本仓库只包含“先做5分钟”项目，与任何记账、财务或账本项目完全独立；代码、文档、测试和 Git 历史均不共用。

## 当前成果

截至 2026-08-22，P0–P18 产品阶段与 P19 发布前可靠性收口已推进到当前源码基线：

> 当前产品阶段为功能较完整的内部 Beta，尚未达到 `RELEASE_READY`。最新多视角审计确认：设置持久化失败处理、错误诊断、启动空白态、真实指标采集、备份隐私/容量和生产反馈闭环仍需收口；Android 完整设备矩阵、iOS 真机与首次用户测试仍缺外部证据。详见 [`docs/CURRENT_PRODUCT_RISK_AUDIT.md`](docs/CURRENT_PRODUCT_RISK_AUDIT.md)。

- 用四象限承载任务判断，但首页主动作保持为“先做5分钟”。
- 支持任务创建、编辑、完成、恢复、删除、归档、搜索、筛选与批量整理。
- 支持长任务步骤、执行计划、周期任务和专注记录。
- 建立低能量救援、连续优先级、成长反馈及本地产品指标。
- 提醒具备预算控制、同任务同触发点去重、显式提醒优先、延后 10 分钟及连续延后修复建议。
- 本地备份支持完整预览、安全替换、安全快照及失败回滚。
- 支持读屏默认列表、大字体适配、可见的象限移动入口、焦点与状态播报。
- 首页与任务查找针对 5,000 条任务历史进行了过滤和分页设计。
- 可根据真实专注历史给出本地时长建议，并支持接受、拒绝与冷却期。
- 四象限任务支持 1000ms 持续选中、同手势或第二次触碰拖动、象限内位置持久化与失败回滚。
- 所有 Bottom Sheet 统一了滚动边界、下拉关闭、返回、键盘、遮罩和脏状态处理。
- 创建与编辑草稿支持进程重启恢复；专注统计统一使用显式本地时区并正确表达不足一分钟。
- Android internal 使用独立包名 `com.startfive.app.internal`，不会覆盖设备上的正式包和数据。

P14-02B 的“合并式恢复”未做猜测实现：当前数据层还没有覆盖任务、步骤、计划、专注、提醒和 Ledger 的完整引用重映射服务，因此按规格安全门保持阻断。现有“安全替换恢复”已经实现并有回滚测试。

## 当前验证基线

| 范围 | 结果 |
| --- | --- |
| P15R/P19 本轮定点复验 | 6 suites，28/28 tests 通过（2026-08-22） |
| P15R–P19 当前定点回归 | 19 suites，61/61 tests 通过；含原生入口/构建契约为 21 suites，70/70 tests |
| R20-01 全量历史质量门 | accepted inventory 连续两次 77/77 suites、839/839 tests 通过 |
| TypeScript | `tsc --noEmit` 通过（2026-08-22 重跑） |
| Android lint | `:app:lintInternal` 通过 |
| Android Internal 构建 | `:app:assembleInternal` 通过 |
| Android 设备 | OnePlus 9R 自动冒烟通过；完整人工矩阵与 UTEST 待执行 |
| iOS 构建/真机 | 待 macOS + Xcode 环境 |

最近验证的 Internal APK：

- versionCode：`1`
- applicationId：`com.startfive.app.internal`
- versionName：`1.0-internal`
- 大小：`20,294,203 bytes`
- SHA-256：`611cda1c846869a1a257f7c44b11ce67aa2d3d5dc235fe0b055c90241a2ef2df`

APK 属于构建产物，不提交进 Git；可从源码重新生成。

## 技术结构

```text
src/
  app/           应用装配与运行时
  application/   用例、提醒、备份、专注和指标服务
  components/    可复用界面组件
  data/          本地持久化、仓储与迁移
  domain/        任务、象限、计划、成长与推荐规则
  platform/      平台能力适配
  presentation/  用户文案及展示模型
  screens/       首页、任务整理、进度、备份等界面
tests/           P0–P19 契约、体验与回归测试
docs/            重构规格、阶段进度和设备验收协议
android/         Android 原生工程
ios/             iOS 原生工程
```

数据策略是本地优先。核心规则尽量放在纯 TypeScript domain/application 层，界面通过服务和仓储访问数据，以便单元测试、迁移和故障回滚。

## 研究与重构资料

- [`docs/CURRENT_RESEARCH_ROUTE.md`](docs/CURRENT_RESEARCH_ROUTE.md)：当前研究路线、最新进展教程、阅读顺序和下一阶段门禁；新读者从这里开始。
- [`docs/CURRENT_PRODUCT_RISK_AUDIT.md`](docs/CURRENT_PRODUCT_RISK_AUDIT.md)：当前产品问题、研究缺口、证据分级与 P0/P1/P2 收口顺序。
- [`docs/R20_01_CONTRACT_DISPOSITION.md`](docs/R20_01_CONTRACT_DISPOSITION.md)：R20-01 当前契约与历史质量门的逐根因裁决及最终证据。
- [`docs/R20_02_ANDROID_DEVICE_MATRIX_PROGRESS.md`](docs/R20_02_ANDROID_DEVICE_MATRIX_PROGRESS.md)：R20-02 Android 设备矩阵的真实环境、自动采集工具、已通过门禁和待设备项目。
- [`docs/P19_RELEASE_CONVERGENCE_AUDIT.md`](docs/P19_RELEASE_CONVERGENCE_AUDIT.md)：P19 全局交互可靠性与发布收口审计。
- [`docs/P19_DEVICE_UTEST_ACCEPTANCE.md`](docs/P19_DEVICE_UTEST_ACCEPTANCE.md)：Android 完整设备与首次用户测试验收表。
- [`docs/NEXT_CHAT_HANDOFF.md`](docs/NEXT_CHAT_HANDOFF.md)：阶段交接与当前工作上下文。
- [`docs/CODEX_QUADRANT_REFACTOR_SPEC.md`](docs/CODEX_QUADRANT_REFACTOR_SPEC.md)：四象限重构基线。
- [`docs/CODEX_P7_P10_USER_METRIC_SPEC.md`](docs/CODEX_P7_P10_USER_METRIC_SPEC.md)：P7–P10 用户指标与价值阶段规格。
- [`docs/CODEX_P7_P10_PROGRESS.md`](docs/CODEX_P7_P10_PROGRESS.md)：P7–P10 真实实现路径与测试记录。
- [`docs/CODEX_P11_P14_USER_VALUE_OPTIMIZATION_SPEC.md`](docs/CODEX_P11_P14_USER_VALUE_OPTIMIZATION_SPEC.md)：P11–P14 用户价值优化规格。
- [`docs/CODEX_P11_P14_PROGRESS.md`](docs/CODEX_P11_P14_PROGRESS.md)：P11–P14 真实实现路径、阶段状态、测试和构建结果。
- [`docs/CODEX_P15R_P18_PROGRESS.md`](docs/CODEX_P15R_P18_PROGRESS.md)：P15R–P19 真实实现、schema、测试、APK 和外部待验状态。
- [`docs/P11_P14_DEVICE_UTEST_PROTOCOL.md`](docs/P11_P14_DEVICE_UTEST_PROTOCOL.md)：仍需在真实设备完成的验证协议。
- [`docs/SOURCE_先做5分钟_APP_Codex完整重构指令.docx`](docs/SOURCE_%E5%85%88%E5%81%9A5%E5%88%86%E9%92%9F_APP_Codex%E5%AE%8C%E6%95%B4%E9%87%8D%E6%9E%84%E6%8C%87%E4%BB%A4.docx)：原始重构指令归档。

仓库还保留各轮测试规格、契约锁文件及变更记录，用于追踪从早期冻结契约到当前基线的演进。历史“精确表面”质量门已在 R20-01 中逐项裁决并全绿；历史阶段文档保留原始记录，不替代当前路线。

## 本地开发

要求 Node.js 20 或更高版本，并准备对应的 React Native Android/iOS 开发环境。

```bash
pnpm install
pnpm typecheck
pnpm start
pnpm android
```

iOS 需要 macOS、Xcode 和 CocoaPods：

```bash
pnpm install
cd ios && pod install && cd ..
pnpm ios
```

当前 `pnpm test` 指向完整历史质量门脚本。R20-01 未弱化其中的冻结断言；在规范化 Windows TEMP 并按 `quality-gate.acceptance.json` 的 authoritative roots 执行时，完整 77 suites / 839 tests 已连续两次通过。当前 Codex 环境的 pnpm 包装结构仍不满足 V2 自包含 companion 预检，处置与可重复命令见 R20-01 台账和当前路线。

## 隐私与发布边界

- 用户任务、专注记录、成长数据和指标默认保存在本地。
- 本仓库不提交真实用户数据、环境变量、签名证书、密钥、依赖目录或原生构建缓存。
- Android/iOS 真机可访问性、通知时区与系统权限场景仍需按设备验收协议执行后，才能宣称完成真机发布验收。
