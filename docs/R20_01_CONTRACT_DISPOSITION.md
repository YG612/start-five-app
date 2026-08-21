# R20-01 当前契约与历史质量门处置台账

更新时间：2026-08-22（Asia/Shanghai）
启动 HEAD：`418b785f62c4bc71e48d56317a90d033ffa6d75b`
启动工作区：干净
运行时：Node `24.19.0`、Java `17.0.8`、`China Standard Time`

## 1. 初始基线

| 入口 | 结果 | 结论 |
| --- | --- | --- |
| `jest --config jest.config.js --runInBand` | 9 suites、87/87 tests PASS | `jest.config.js` 只声明 `tests/locked`，不能代表完整 accepted inventory |
| `scripts/quality-gate-v2/cli.cjs test`，未注入 trust SHA | bootstrap fail-closed | `QUALITY_GATE_V2_BOOTSTRAP_SELF_SHA256` 是规格要求的独立信任输入，不能从 manifest/registry 回退 |
| 同上，注入 trust SHA | `QUALITY_GATE_PNPM_LAUNCH_UNSAFE` | 当前 Codex pnpm 11 wrapper/bundle 含相对模块解析，不满足 V2 自包含 companion 预检 |
| 按 `quality-gate.acceptance.json` 的 17 个 accepted roots 逐 suite 运行 | 77 suites 中 74 PASS、3 FAIL | 避免一个 Node/libuv 原生退出遮住其余结果 |
| 排除两个 watcher 原生退出套件后聚合运行 | 75 suites；74 suites、794 tests PASS；1 suite、1 test FAIL | 当前产品/API/存储兼容回归已经由 `f2a79b0` 修复，只剩生成目录扫描边界 |
| TypeScript | PASS | `tsc --noEmit` |

HEAD 中 `quality-reports/quality-gate-report.json` 记录的是 2026-08-21 早于 `f2a79b0` 兼容修复完成时的执行结果：77 suites、839 tests；18 suites、32 tests FAIL。该报告是本轮“原始失败”审计输入，不再等同于当前代码结果。

## 2. 处置统计

| 处置 | 根因数 | ID |
| --- | ---: | --- |
| KEEP | 1 | R20-C004 |
| MIGRATE | 3 | R20-C001、R20-C002、R20-C003 |
| RETIRE | 0 | — |
| ISOLATE | 4 | R20-C005、R20-C006、R20-C007、R20-C008 |
| 合计 | 8 | — |

没有因为测试困难而退役当前有效契约，也没有恢复旧产品行为。

## 3. 根因裁决

### R20-C001 — 旧任务/CoreFlow 精确 API 表面与当前能力扩展

| 字段 | 内容 |
| --- | --- |
| 原始失败测试 | `tests/gap-p0-01a/publicTypeFoundation.contract.test.ts` 2 tests；`tests/gap-p0-01a/runtimeSurface.contract.test.ts` 2 tests；`tests/gap-p0-02a/legacyCompatibility.control.test.ts` 2 tests |
| 最小复现 | `jest --runInBand --roots tests/gap-p0-01a tests/gap-p0-02a <具体文件>` |
| 原始全量 | FAIL，6 tests |
| 当前单独/聚合 | PASS / PASS |
| 当前契约证据 | 当前 UI 需要完成撤销、步骤完成撤销和扩展查询；`src/app/currentStartFiveApp.tsx` 是明确的当前产品入口 |
| 历史契约证据 | P0/P4 对 `createCoreAppService` 与生命周期 service 的 own keys 和 public types 有精确锁定 |
| 根因层 | API / adapter |
| 处置 | MIGRATE |
| 修改位置 | 已由 `f2a79b0` 在当前入口/兼容 facade 边界处理；旧工厂保持精确表面，当前调用者转入明确 current 入口 |
| 为什么不改领域层 | 新能力仍是当前真实需求，不能删除方法来恢复旧表面；兼容只属于入口与 adapter |
| 验证 | 三个原始 suite 单独与当前 75-suite 聚合均 PASS |

### R20-C002 — Focus Session v1 正式存储/API 与 v2 语义快照

| 字段 | 内容 |
| --- | --- |
| 原始失败测试 | `gap-p0-02a/publicFoundation` 2；`gap-p0-02a/runtimeSurface` 1；`gap-p0-02b/persistentPublicSurface` 2；`repositoryPersistence` 1；`serviceStart` 5；`snapshotValidation` 1；`timerBoundary` 2 |
| 最小复现 | `jest --runInBand --roots tests/gap-p0-02a tests/gap-p0-02b <具体文件>` |
| 原始全量 | FAIL，14 tests |
| 当前单独/聚合 | PASS / PASS |
| 当前契约证据 | P17/P19 需要 `FocusContextSnapshot`、历史查询和 v2 envelope；当前 writer 使用 v2 |
| 历史契约证据 | 已发布 key `start-five.focus-sessions.v1` 与 v1 envelope/API 必须继续读取和保持旧调用表面 |
| 根因层 | schema / storage / API |
| 处置 | MIGRATE |
| 修改位置 | `src/application/currentFocusSessionService.ts`、`src/data/currentFocusSessionRepository.ts`、`src/data/currentFocusSessionStorage.ts`、`src/data/focusSessionBackupValidation.ts` |
| 为什么不改当前模型 | v2 snapshot 是当前成长和复盘数据的真实来源；v1 兼容在 parser/storage/adapter 边界完成，当前领域不重新扩散旧字段 |
| 验证 | v1/v2 读取、当前 v2 writer、备份校验及原始 7 个 suite 当前均 PASS |

### R20-C003 — P4 单任务存储启动缝与当前多存储应用装配

| 字段 | 内容 |
| --- | --- |
| 原始失败测试 | `tests/phase4/startFiveApp.contract.test.tsx` 4 tests；`tests/native-scaffold/rootRegistration.contract.test.tsx` 1 test |
| 最小复现 | 分别运行上述文件 |
| 原始全量 | FAIL，5 tests |
| 当前单独/聚合 | PASS / PASS |
| 当前契约证据 | P15–P19 需要偏好、日程、草稿、布局、复盘和专注存储；正式根入口必须装配它们 |
| 历史契约证据 | P4 的 `createStartFiveApp` 是精确单存储、单水合 seam，仍被锁定测试与旧嵌入调用使用 |
| 根因层 | API / storage composition / test seam |
| 处置 | MIGRATE |
| 修改位置 | `src/app/currentStartFiveApp.tsx` 与 `src/app/startFiveApp.tsx` 的显式 current/legacy 入口；NativeModules 缺失时的平台边界保护 |
| 为什么不让旧 seam 读取所有存储 | 会让旧精确契约和测试 backend 观察到当前产品的额外 I/O，破坏向后兼容；当前 App 通过 current 入口装配完整能力 |
| 验证 | 两个原始 suite 单独与聚合均 PASS |

### R20-C004 — 共享 backend 的任务 mutation 原子性与交错写入

| 字段 | 内容 |
| --- | --- |
| 原始失败测试 | `phase4/persistentTaskStorage` 1；`phase4-review/sharedCompositionConcurrency` 2；`phase4-review4/storageErrorBoundaryAndControls` 1；`phase4-review5/storageBoundary` 1 |
| 最小复现 | 分别运行上述四个文件；并按 concurrency/storage 两种顺序聚合 |
| 原始全量 | FAIL，5 tests |
| 当前单独/聚合 | PASS / PASS |
| 当前契约证据 | 多个 composition/service 可能共享同一 backend；成功 mutation 不得丢失，失败写不能发布缓存或覆盖 durable 数据 |
| 历史契约证据 | P4 review 系列明确锁定单进程串行 mutation、失败原子性和后续恢复 |
| 根因层 | storage / concurrency |
| 处置 | KEEP |
| 修改位置 | 已由 `f2a79b0` 在 `src/data/taskRepository.ts` 与 `src/data/coordinatedBackend.ts` 集中 mutation 边界修复 |
| 为什么不是测试隔离 | 原始交错写可在真实共享 backend 复现数据丢失，属于生产可靠性；不能只清理 mock |
| 验证 | 四个 suite 当前单独和同进程聚合均 PASS |

### R20-C005 — Windows CRLF 造成 accepted lock 字节身份漂移

| 字段 | 内容 |
| --- | --- |
| 原始失败测试 | `native-scaffold/isolationAndPreservation` 的七代 manifest 保存测试；`quality-gate-v2/cliAndEntry` 的 accepted inventory 测试 |
| 最小复现 | `validateLockManifests` 或分别运行两个文件 |
| 原始全量 | FAIL，2 tests |
| 当前单独/聚合 | PASS / PASS（manifest 保存项） |
| 当前契约证据 | lock 自哈希是原始字节身份，不能按平台换行自动变化 |
| 历史契约证据 | accepted manifests 允许 LF/CRLF 解析，但 registry 的 expected self 对具体签名字节精确绑定 |
| 根因层 | lock inventory / checkout isolation |
| 处置 | ISOLATE |
| 修改位置 | 已由 `f2a79b0` 增加 `.gitattributes` 与 `scripts/normalize-locked-eol.cjs`，不改测试断言和产品语义 |
| 验证 | 当前 accepted manifest 校验与两个原始测试 PASS |

### R20-C006 — Android 自定义短构建目录被生产隔离扫描误收

| 字段 | 内容 |
| --- | --- |
| 当前失败测试 | `tests/native-scaffold/isolationAndPreservation.contract.test.ts` 的 production isolation scan |
| 最小复现 | `jest --runInBand --roots tests/native-scaffold tests/native-scaffold/isolationAndPreservation.contract.test.ts` |
| 单独/聚合 | 修复前 FAIL / FAIL；修复后定点 5/5 tests PASS，完整 accepted inventory PASS |
| 当前契约证据 | `scripts/build-android-internal.ps1`/Gradle 生成这两个缓存目录；内容是 CMake/AGP 派生产物，不是仓库产品源码 |
| 历史契约证据 | 测试名称和既有 ignore 已明确排除 `.cxx`、`build` 等 generated vendors |
| 根因层 | test isolation / generated inventory |
| 处置 | ISOLATE |
| 修改位置 | `tests/native-scaffold/isolationAndPreservation.contract.test.ts` 仅把 `.cxx-short`、`.short-app-build` 加入同一 generated-directory ignore；同步 `NATIVE_SCAFFOLD_LOCK.sha256` 与 `quality-gate.acceptance.json` 的自哈希绑定；保留全部源码扩展、绝对路径、记账项目和 outputs 污染断言 |
| 为什么不删构建产物 | Android lint/build 需要这些缓存且它们不提交 Git；测试应按职责识别所有实际 generated roots |
| 验证 | 定点 suite、完整 accepted Jest 连续两次、lock manifest 校验 |

### R20-C007 — Node 24 + Windows 8.3 TEMP 的 `fs.watch` 原生断言

| 字段 | 内容 |
| --- | --- |
| 当前失败测试 | `quality-gate-v2/processRunner.contract.test.ts`、`realCliChild.contract.test.ts` |
| 最小复现 | 在 `TEMP=D:\CODEXD~1\Temp` 下分别运行两个文件 |
| 单独/聚合 | 短路径下原生退出；规范长路径下 2 suites、44/44 tests PASS |
| 当前契约证据 | 测试必须保留真实 watcher、真实 child、timeout/abort 和无残留 PID 断言 |
| 历史契约证据 | V2 规格禁止 sleep/fake timer 替代真实 watcher |
| 根因层 | test environment isolation / time / process |
| 处置 | ISOLATE |
| 修改位置 | 不改锁定测试；R20 运行环境将 `TEMP/TMP` 规范化为 `D:\CodexData\Temp` |
| 为什么不改生产 runner | 相同生产 runner 在规范路径下全部通过；崩溃发生在 Node/libuv watcher 对短/长路径身份不一致，而非 runner 业务语义 |
| 验证 | 规范 TEMP 下两个 suite 44/44 PASS |

### R20-C008 — 当前 Codex pnpm 包装结构不符合 V2 自包含启动预检

| 字段 | 内容 |
| --- | --- |
| 失败入口 | `node scripts/quality-gate-v2/cli.cjs test` 在 formal child 前返回 `QUALITY_GATE_PNPM_LAUNCH_UNSAFE` |
| 最小复现 | 注入正确 bootstrap trust SHA，并将当前 Codex pnpm 11 wrapper 作为唯一 PATH pnpm |
| 单独/全量 | 均在测试子进程前 fail-closed |
| 当前契约证据 | V2 明确禁止相对 companion 和不稳定 wrapper；当前 `pnpm.cjs` 相对导入 `pnpm.mjs`，bundle 仍含相对 `require.resolve` |
| 历史契约证据 | 2026-08-21 完整报告使用另一自包含 pnpm 11.22.0 运行时进入了 77-suite formal tests |
| 根因层 | test runner isolation / supply-chain launch |
| 处置 | ISOLATE |
| 修改位置 | 不降低 V2 预检，不从 manifest/registry 推导 trust input；R20 完整 Jest按同一 authoritative accepted roots 直接调用已安装 Jest，Android/TypeScript 分别运行真实工具 |
| 为什么不改质量门 | 放宽 companion 约束会破坏独立信任边界；这是本机工具分发形态，不是产品契约回归 |
| 验证 | 17 accepted roots 与 77 suite 清单一致；最终完整 Jest 连续两次必须全绿 |

## 4. 原始 18 suites / 32 tests 映射

| 根因 | suites | tests |
| --- | ---: | ---: |
| R20-C001 | 3 | 6 |
| R20-C002 | 7 | 14 |
| R20-C003 | 2 | 5 |
| R20-C004 | 4 | 5 |
| R20-C005 | 2 | 2 |
| 合计 | 18 | 32 |

每个原始失败均映射到且只映射到一个稳定根因。R20-C006～C008 是本轮在当前工作区/运行时重新执行时发现的额外测试基础设施根因。

## 5. 最终门禁结果

| 门禁 | 结果 | 真实证据 |
| --- | --- | --- |
| R20-C006 定点回归 | PASS | 1 suite、5/5 tests；accepted manifest 自哈希与 registry 绑定已同步 |
| accepted inventory 第一次 | PASS | 77/77 suites、839/839 tests |
| accepted inventory 第二次 | PASS | 77/77 suites、839/839 tests |
| TypeScript | PASS | `tsc --noEmit` |
| Android lint | PASS | 显式 `:app:lintInternal`；79 个 Gradle task，零失败 |
| Android internal | PASS | `:app:assembleInternal`；构建同时完成 `lintVitalInternal` |
| applicationId / version | PASS | `com.startfive.app.internal`；versionCode `1`；versionName `1.0-internal` |
| APK | PASS / `WORKTREE_BUILD` | `android/app/build/outputs/apk/internal/app-internal.apk`；2026-08-22 04:49:44 +08:00；`20,294,203 bytes`；SHA-256 `611cda1c846869a1a257f7c44b11ce67aa2d3d5dc235fe0b055c90241a2ef2df`；构建时本轮变更尚未提交，不声明为绑定正式 commit 的发布候选 |
| 文档收口 | PASS | 当前路线写入 R20-01；P15R–P18 进度标记 `HISTORICAL SNAPSHOT / SUPERSEDED` |

最终判定：`R20-01 PASS`。下一门为 R20-02 Android 完整设备矩阵。

本台账不授权 P14-02B 备份合并，不改变四象限、专注、成长、日程或用户可见产品方向。
