# PERFORMANCE & RELIABILITY BUDGET — DRAFT

> **NON-BINDING / MEASUREMENTS NOT RUN / CODE NOT INSPECTED**
>
> 本文档是“先做5分钟”的候选性能与可靠性预算，不是实测报告、SLA、验收通过证明或发布授权。当前没有运行 benchmark、Android Macrobenchmark、Perfetto、能耗测试、内存分析或 iOS Instruments，也没有读取实现代码。所有阈值都是待 CEO、产品容量决策和真实基线校准的建议值；标记为 `TBD` 的内容禁止猜测。

## 1. 目的与范围

本草案覆盖当前已知的 React Native 本地优先架构：

- Task/Subtask 本地持久化、四象限投影、列表与查询；
- FocusSession、2/5/15/25/50 分钟倒计时、后台恢复；
- operation ledger / journal、operationId 幂等与长期增长；
- schema hydration、迁移、corruption classification、quarantine、recover/restore；
- 同一物理 backend 上的多个 repository/storage facade；
- 提醒计划、延迟、取消、重启恢复和系统通知；
- Android APK/AAB、JS bundle、native libraries 和构建体积；
- 1、256、513、1000、5000 Task 及 tombstone 压力场景。

低端 Android 是首要性能门槛。iOS 必须在可用的 macOS/Xcode/真实设备环境中独立测量；Windows 静态检查不能替代 iOS 性能证据。

## 2. 原则

1. **正确性优先**：不能为降低延迟而跳过验证、丢弃 tombstone、静默清空、覆盖冲突或改变幂等语义。
2. **用户感知优先**：首屏、触控响应、JS thread stall、倒计时可信度优先于孤立 microbenchmark。
3. **尾延迟优先**：除 p50 外必须报告 p95；只有样本量足够时才能报告 p99。
4. **真实 release 环境**：debug、remote debugger、fake timer 和桌面 Node microbenchmark 不能作为移动端发布性能证据。
5. **稳定且可复现**：fixture、设备、OS、构建、热状态、重复次数和统计方法必须固定并记录。
6. **容量决策显式化**：513/1000/5000 Task 是支持容量还是必须快速拒绝的压力输入，需先形成产品/数据合同，记为 `TBD-CAPACITY`。
7. **回归与绝对门槛并行**：既比较建议上限，也比较最后一个 accepted baseline；明显退化不能因仍低于宽松绝对值而被忽略。

## 3. 基准设备与环境

### 3.1 P0 Android 基准

最终机型为 `TBD-ANDROID-LOW-END-DEVICE`。建议最低画像：

- 4 个低功耗/入门级 CPU 核心或等效低端 SoC；
- 3–4 GB RAM；
- Android 10–12 中项目实际支持的最低代表版本；
- 60 Hz 屏幕；
- 非 root、无开发者“强制 GPU”改动；
- 电池 30%–80%，设备温度稳定，无充电热干扰；
- release build、Hermes、remote debugging 关闭；
- 飞行模式用于纯本地测试，通知场景按需要开启系统服务。

模拟器可用于趋势和 CI smoke，但不能作为低端真实设备 P0 发布证据。

### 3.2 Android 参考设备

另选一台主流中端 Android 作为回归参考，型号为 `TBD-ANDROID-MID-RANGE-DEVICE`。参考设备不能替代低端门槛。

### 3.3 iOS

- macOS/Xcode 环境：`TBD`；
- 最低支持 iPhone：`TBD`；
- Instruments、MetricKit、XCTest launch measure 与真实后台恢复测试：待 macOS；
- 在完成 iOS 实测前，不得声称 Android 数字等价适用于 iOS。

## 4. Fixture 与容量矩阵

每个 fixture 必须由固定种子生成，导出内容 SHA-256，并在报告中记录。Task ID、时间、象限、状态、文本长度、subtask 数和 tombstone 比例必须确定性分布。

| Fixture | 目的 | 组成建议 | 期望行为 |
|---|---|---|---|
| T1 | 基础 smoke | 1 Task，0–1 Subtask | 正常成功 |
| T256 | 当前边界/常规重载 | 256 Tasks，四象限均匀，20% completed/cancelled | 正常成功，作为 P0 核心容量 |
| T513 | 第一超边界压力 | 513 Tasks，含 optional planning fields | `TBD-CAPACITY`：支持并达预算，或快速、稳定、无 mutation 地拒绝 |
| T1000 | 中型压力 | 1000 Tasks，25% tombstone | `TBD-CAPACITY`；不得崩溃、ANR、数据损坏 |
| T5000 | 极限/DoS | 5000 Tasks，50% tombstone，混合文本长度 | 不要求全部 UI 流畅前先决定容量；必须有界、可取消或快速拒绝 |
| TSUB | Subtask 压力 | 每个 Task 0/1/8/64/256 Subtasks 的分层样本 | 边界前成功，越界稳定拒绝 |
| TLONG | 文本压力 | 标题/描述/第一步达到拟定最大字符和 UTF-8 字节边界 | 不崩溃、不超预算性增长；超界明确拒绝 |
| TTOMB | tombstone 压力 | 0%、25%、50%、90% soft-deleted | 默认查询正确过滤，includeDeleted 可预测，存储增长可控 |
| L512 | ledger 边界 | 512 个 completed/pending ledger entries | 依据正式 ledger 合同成功 |
| L515 | ledger 首个增长压力 | 515 entries，含重放与冲突 | 不无限增长；清理/拒绝行为确定 |
| LLONG | 长期 ledger | 10k/100k 历史 operation 尝试的压缩或快速拒绝场景 | 磁盘、启动、查询和清理时间有界 |

如现有 snapshot 容器限制使 513+ Task 不属于合法输入，报告必须区分：

- **合法容量性能**：对正式支持的最大合法 fixture 测量 CRUD/query；
- **敌对输入可靠性**：对 513/1000/5000 测量拒绝时间、峰值内存、零 mutation 和错误稳定性。

不得为了让 5000 Task benchmark 通过而绕过正式 validator。

## 5. 启动与首屏预算

时间起点与终点必须用统一 instrumentation 定义：进程创建/Activity launch 到第一帧、第一 meaningful content、首个可响应交互分别记录。

| 指标 | P0 建议阈值（低端 Android） | P1 目标 | 状态 |
|---|---:|---:|---|
| Cold start → first frame | p50 ≤ 1.8 s；p95 ≤ 3.0 s | p95 ≤ 2.5 s | 未测 |
| Cold start → meaningful task screen | p50 ≤ 2.2 s；p95 ≤ 3.5 s | p95 ≤ 3.0 s | 未测 |
| Warm start → meaningful screen | p50 ≤ 0.7 s；p95 ≤ 1.2 s | p95 ≤ 0.9 s | 未测 |
| Resume from background | p95 ≤ 1.0 s | p95 ≤ 0.7 s | 未测 |
| First actionable tap acknowledged | p95 ≤ 100 ms | p95 ≤ 75 ms | 未测 |

上述绝对值需在选定低端设备上校准。无论绝对阈值是否达标，相比 accepted baseline 恶化超过 10% 且置信区间不重叠时必须审查。

## 6. Task CRUD 与查询延迟

延迟从应用 service/repository 公共调用开始，到 durable commit 和返回结果完成为止；另外单独报告 UI feedback 时间。不得只测纯内存函数后宣称持久化性能达标。

### 6.1 建议预算

| 操作 | 数据集 | p50 | p95 | p99（≥1000 samples 才报告） |
|---|---|---:|---:|---:|
| Create + durable commit | T1/T256 | ≤ 60 ms | ≤ 150 ms | ≤ 300 ms |
| Update/reschedule/soft-delete + commit | T256 | ≤ 70 ms | ≤ 180 ms | ≤ 350 ms |
| GetById | T256 | ≤ 15 ms | ≤ 40 ms | ≤ 80 ms |
| List active | T256 | ≤ 30 ms | ≤ 80 ms | ≤ 150 ms |
| Four-quadrant projection | T256 | ≤ 35 ms | ≤ 100 ms | ≤ 180 ms |
| Query/filter/sort | T256 | ≤ 40 ms | ≤ 120 ms | ≤ 220 ms |
| Create/update | T513/T1000（若支持） | `TBD` | 建议 ≤ 300 ms | 建议 ≤ 600 ms |
| Query/projection | T1000（若支持） | `TBD` | 建议 ≤ 200 ms | 建议 ≤ 400 ms |
| Query/projection | T5000（若支持） | `TBD` | 建议 ≤ 500 ms | 建议 ≤ 1000 ms |
| 超容量拒绝 | T513/T1000/T5000（若不支持） | — | ≤ 100 ms | ≤ 250 ms |

持久化为全量 JSON snapshot 时，写入成本可能随 Task 数线性增长。代码审计后必须决定：继续接受此容量模型、引入索引/分片/数据库，或缩小正式支持上限。不能用性能优化改变原子性或错误合同。

### 6.2 tombstone

- active-only 查询延迟不能与 tombstone 总量无界线性恶化；如无法避免，必须设总容量/压缩策略；
- tombstone cleanup 不得在前台交互内形成 >100 ms JS stall；
- cleanup 失败不能丢失 active Task 或复活已删除记录；
- TTOMB 每个比例均需验证结果数量、排序和深拷贝隔离。

## 7. Hydration、重启、迁移与恢复预算

| 场景 | P0 建议阈值 | 可靠性要求 |
|---|---:|---|
| Empty/current V1 hydrate，T256 | p95 ≤ 250 ms | 结果正确、零额外 mutation |
| V0/default in-place migration，T256 | p95 ≤ 400 ms | 仅 canonical set；失败保留原字节 |
| Historical migration，T256 | p95 ≤ 500 ms | set current 后 remove historical |
| 冷重启 cleanup retry | p95 ≤ 300 ms | zero set、一次 remove、零 clock/ID |
| Corrupt classification | p95 ≤ 150 ms（合法容量内） | 稳定错误、零 mutation、无 payload 泄露 |
| Inspect | p95 ≤ 150 ms | 只读、detached、零 clock/ID |
| Quarantine copy | p95 ≤ 500 ms + 与字节数相关预算 | pending→backup→remove→cleanup；故障可重启 |
| Recover/restore，T256 | p95 ≤ 600 ms | 全验证、单 canonical set、永久保留备份 |
| 超大/超深敌对输入 | p95 `TBD`，须有硬超时/资源上限 | 不 stack overflow、不 OOM、不写入 |

P0 自动化至少覆盖：

- 当前 V1、V0、default、historical raw；
- current/historical 等价与冲突；
- malformed、wrong-root、foreign、unsupported、extra、semantic invalid；
- set/remove/read 每个 mutation 边界失败后的冷进程重启；
- quarantine pending 的每个持久化边界；
- backup missing、target occupied、canonical write failure；
- 真实磁盘后端与稳定 fixture，而不只是 in-memory Map。

## 8. operation ledger / journal 预算

正式容量、TTL 和 compaction 规则当前为 `TBD-LEDGER-POLICY`。建议 P0：

- 正常 operation lookup p95 ≤ 30 ms（L512）；
- 同 ID/同 payload replay p95 ≤ 50 ms，且无重复 durable mutation；
- 同 ID/异 payload conflict p95 ≤ 50 ms，零 mutation；
- L515 不得触发无界扫描或反复全量重写导致 >150 ms JS stall；
- 启动 hydrate 不应随历史 operation 尝试永久单调增长；
- journal 文件/记录总量有明确硬上限，达到上限时确定性压缩或失败关闭；
- compaction 可中断、可重启、不改变仍需支持的 replay 结果；
- 10k/100k 敌对历史输入不得导致 OOM、ANR 或磁盘无限增长。

长期测试建议：持续执行 create/update/replay/conflict 24 小时或至少 100k operation attempts，每 1000 次记录磁盘大小、hydrate 时间、JS heap 和 operation p95；不得只看最终功能绿灯。

## 9. 并发 facade 与队列可靠性

场景：2、4、10 个 facade 共享同一物理 backend 与 key，混合 migration、CRUD、recover、restore、quarantine 和故障注入。

P0 要求：

- 单个 winner 的 durable mutation 数与合同一致；
- 后续操作观察 winner，不能基于过期 occupancy check 覆盖；
- queue wait p95 ≤ 500 ms（正常 10 操作 burst），无饥饿；
- 单个 backend error 不污染队列，下一合法操作能够成功；
- 无死锁、open handle、未处理 rejection 或永久 pending；
- 1000 次确定性 barrier 竞态循环零数据分叉；
- Task 操作对 FocusSession key 零读/写/删，反向同样成立。

并发性能必须同时报告业务延迟与 backend operation 次数；仅“最终值正确”不能掩盖重复 set/remove。

## 10. Focus timer、后台恢复与提醒

### 10.1 倒计时正确性与漂移

fake clock 适合确定性状态机/边界测试，但**不得用于证明真实计时性能或电量表现**。真实设备 release 测试应使用 monotonic elapsed time 或可信 timestamp 重算。

| 场景 | P0 建议阈值 | 可靠性要求 |
|---|---:|---|
| 2/5 分钟前台倒计时 | 显示误差 ≤ 1 s；完成事件漂移 ≤ 1 s | 不依赖 interval tick 次数累计 |
| 15/25/50 分钟前台 | 完成事件漂移 ≤ 2 s | JS stall/GC 后按时间戳纠正 |
| 后台 1/5/25 分钟后 resume | resume 后 ≤ 1 s 显示正确剩余/完成状态 | 不重复完成、不负计时、不丢 session |
| App 被杀后 restore | 首次 hydrate 后 ≤ 1 s 得到正确状态 | 依据持久化时间重算，非内存 timer |
| 系统时间/时区变化 | `TBD` | 明确 wall-clock 与 monotonic 策略 |

每个 duration 需测试 finish、interrupt、后台、进程终止、设备锁屏和快速重复点击。倒计时 UI 的动画帧率不应依赖高频持久化；建议只在关键状态变更写盘。

### 10.2 通知调度

- 一次提醒创建/更新/取消的应用侧 p95 建议 ≤ 150 ms；
- 100 个提醒批量恢复建议 ≤ 2 s，且不阻塞首个可交互帧；
- 系统实际触发误差受省电策略影响，必须按平台/权限分层报告，不能承诺绝对准点；
- 重启后不重复注册同一逻辑提醒；delay/reschedule 取消旧计划后再创建新计划；
- 无持续轮询或不必要 wake lock；
- 通知权限关闭、精确闹钟不可用、Doze/低电量模式均有可解释降级。

## 11. JS thread、帧、内存与 GC

### 11.1 响应与 stall

- 60 Hz 设备单帧预算约 16.7 ms；
- 核心点击到视觉反馈 p95 ≤ 100 ms；
- 正常 T256 交互不得出现 >100 ms JS thread stall；
- T1000/T5000 压力下任何 >250 ms stall 必须记录调用栈并评审；
- hydrate、排序、序列化、深拷贝和 validation 需要分别打点；
- 长任务应分片、转移或在 UI 显示进度，但不能破坏原子提交。

建议使用 Perfetto/Android Studio System Trace 与 React Native performance markers 同时记录 UI thread、JS thread、GC 和 I/O。

### 11.2 内存建议预算

绝对 RSS/JS heap 需真实设备基线后校准。P0 初始建议：

| 场景 | 建议上限 | 状态 |
|---|---:|---|
| Idle meaningful screen，T256 | RSS ≤ 250 MiB；JS heap ≤ 80 MiB | 未测/TBD |
| Query/projection peak，T256 | 相对 idle 增量 ≤ 40 MiB | 未测 |
| T1000（若支持） | RSS ≤ 320 MiB；无系统 low-memory kill | 未测/TBD |
| T5000 敌对输入 | 不 OOM；拒绝后回收至基线 +15% 内 | 未测 |
| 100 次页面进入/退出 | 稳态后 heap 增长 ≤ 5% 或 ≤ 10 MiB | 未测 |

GC 建议：正常 T256 操作 GC pause p95 ≤ 50 ms，单次 pause 不超过 100 ms；必须同时报告 pause 次数和总 GC 时间。数值待 Hermes/设备基线校准。

## 12. 电量与后台预算

测量需固定屏幕亮度、网络、温度、通知数量和对照 idle run，至少重复 5 次。建议使用 Battery Historian、Perfetto power rails（设备支持时）或平台等效工具。

P0 建议：

- 25 分钟前台 FocusSession 相比同亮度 idle 的额外电量消耗 ≤ 1.5 个百分点，最终值 `TBD`；
- 25 分钟后台 FocusSession 不应持续运行高频 JS timer，额外 CPU time 接近零；
- 无永久 wake lock、后台轮询或每秒持久化；
- 24 小时 100 个已调度提醒无异常唤醒风暴；
- 通知恢复/取消后不存在 orphan schedule；
- 低电量/Doze 下功能降级有记录，不以频繁唤醒规避系统策略。

## 13. APK/AAB、bundle 与构建体积

当前没有 release 体积实测。debug APK 不能用作商店下载体积或 release 预算证据。

P0 门禁建议采用“绝对上限 + 回归上限”：

- Android App Bundle、universal APK、每 ABI APK、Hermes JS bundle、resources、native libraries 分别报告；
- 绝对商店下载/安装上限：`TBD-SIZE-LIMIT`，由首个 accepted clean release 基线确定；
- 单个变更相对 accepted baseline 不得无解释增加 >5% 或 >2 MiB（取更严格者）；
- JS bundle gzip 后增长 >250 KiB 必须列依赖/功能原因；
- native library 新增、重复 ABI 资源和调试符号打包必须审计；
- iOS IPA/App Store estimated size 待 macOS/Xcode 测量。

建议同时记录 clean build 时间与增量 build 时间，但它们不是用户运行性能：

```text
Android clean release build budget: TBD
Android incremental release build budget: TBD
iOS archive budget: TBD (macOS required)
```

## 14. 可靠性预算

| 指标 | P0 建议 | 说明 |
|---|---:|---|
| 自动化 cold/warm/restart 场景崩溃 | 0 / 500 runs | 每次保留 logcat 与场景 ID |
| 数据丢失/静默清空 | 0 | 任意故障注入均不允许 |
| 未处理 Promise rejection/open handle | 0 | 所有正式测试门禁 |
| 1000 次确定性并发循环分叉 | 0 | durable bytes 与 receipts 均校验 |
| 100k ledger operation 后不可恢复错误 | 0 | 容量策略允许的前提下 |
| Focus completion 重复/遗漏 | 0 / 1000 session transitions | 含后台和进程重启 |
| 提醒重复/孤儿计划 | 0 / 1000 schedule mutations | 真实设备抽样 + adapter 测试 |
| Crash-free sessions（上线后） | 建议 ≥99.9% | 仅在隐私合规且有可靠遥测后计算 |

上线后 crash-free 指标不能替代发布前故障注入，也不能通过上传用户 payload 获得。

## 15. 测试方法

### 15.1 构建与设备

- 使用签名 release 或与 release 优化等价的 internal benchmark build；
- Hermes 与生产配置一致，remote debugger、dev menu 性能开销关闭；
- 真实设备恢复出厂/后台进程状态策略固定；
- 每次记录 build identity、JS bundle hash、fixture hash、设备型号、OS、存储余量、电池、温度和刷新率；
- thermal throttling run 必须作废并重跑，不能挑选最快样本。

### 15.2 重复次数与统计

- micro/CRUD latency：至少 10 次 warm-up + 100 次正式样本；
- p99：至少 1000 次正式样本，否则报告 `p99=INSUFFICIENT_SAMPLES`；
- cold start：每设备至少 20 次完全终止进程样本；
- warm start/resume：至少 30 次；
- recovery/fault boundary：每场景至少 30 次或全部确定性组合；
- 电量：至少 5 次 paired idle/feature run；
- 报告 p50/p95/p99、min/max、均值、标准差、样本量和 bootstrap 95% confidence interval；
- 若噪声使 CI 过宽，增加样本而不是删除“异常慢”样本；只排除有书面环境原因的 run。

### 15.3 Clock 与 timer

- fake clock 只用于状态机正确性、边界和重放测试；
- 性能使用 monotonic high-resolution clock 与设备 trace；
- Focus drift 使用外部/平台时间基准比较，不以 App 自己的 timer 作为真值；
- background/kill/restart 必须在真实 OS 生命周期中测量。

### 15.4 Fixture 稳定性

- 固定 PRNG seed；
- fixture 生成器版本化；
- JSON/数据库 fixture 计算 SHA-256；
- 每次 benchmark 前验证 Task 数、subtask 数、tombstone、ledger entries 和字节大小；
- performance fixture 不得通过修改正式 schema/validator 偷渡非法数据，敌对输入场景需单独标记。

## 16. 回归门禁

### P0 每个候选版本

1. 功能与锁定测试全部通过；
2. T1/T256 cold/warm start、CRUD、query、hydrate、Focus resume smoke；
3. 与最近 accepted baseline 比较 p50/p95、JS stall、peak RSS、bundle size；
4. 任一 P0 绝对阈值失败即阻断；
5. p95 恶化 >10%、内存恶化 >10%、体积超过 5%/2 MiB 门槛，即使绝对值尚未超限也需说明和批准；
6. 同一变更至少两轮独立运行复现，不能引用作者单次最佳结果；
7. 报告原始样本、trace 与 fixture hash，汇总表不能替代原始证据。

### P1 nightly / milestone

- T513/T1000/T5000 容量/拒绝场景；
- 100k ledger 长期增长；
- 1000 次并发 barrier；
- 24 小时提醒/后台/Focus；
- memory leak、GC、energy、安装体积与真实升级迁移；
- Android 多 OS/多厂商矩阵；
- macOS 可用后加入 iOS Instruments 与真实设备矩阵。

## 17. 性能报告 schema

每次门禁至少输出以下结构化字段；格式可以是 JSON/CSV，但字段含义必须稳定：

```json
{
  "status": "UNVERIFIED|PASS|FAIL",
  "build": {
    "identity": "TBD",
    "buildType": "release",
    "hermes": true,
    "jsBundleSha256": "TBD"
  },
  "device": {
    "model": "TBD",
    "os": "TBD",
    "ramMiB": 0,
    "refreshHz": 60,
    "batteryPercent": 0,
    "thermalState": "TBD"
  },
  "fixture": {
    "name": "T256",
    "sha256": "TBD",
    "tasks": 256,
    "subtasks": 0,
    "tombstones": 0,
    "ledgerEntries": 0,
    "bytes": 0
  },
  "scenario": "task.create.durable",
  "samples": 0,
  "warmups": 0,
  "latencyMs": {
    "p50": 0,
    "p95": 0,
    "p99": null,
    "min": 0,
    "max": 0,
    "mean": 0,
    "stddev": 0,
    "confidence95": [0, 0]
  },
  "resources": {
    "peakRssMiB": 0,
    "peakJsHeapMiB": 0,
    "maxJsStallMs": 0,
    "gcPauseP95Ms": 0,
    "energyDeltaPercent": null
  },
  "artifactSize": {
    "apkBytes": null,
    "aabBytes": null,
    "jsBundleGzipBytes": null
  },
  "baselineDeltaPercent": null,
  "threshold": "TBD",
  "result": "UNVERIFIED|PASS|FAIL",
  "evidence": ["TBD trace/raw-sample path"]
}
```

不能把缺失样本写成 0 后计算 PASS；未知项必须为 `null`/`TBD`，总体状态保持 `UNVERIFIED`。

## 18. Release blockers

以下任一情况阻断发布：

- 没有低端真实 Android release/Hermes 基线；
- cold/warm start、首个可交互、T256 CRUD/query 或 hydrate 超过 P0 门槛；
- 核心交互出现可复现 >100 ms JS stall、ANR、OOM 或 low-memory kill；
- 513/1000/5000 Task 的“支持或拒绝”容量合同仍不明确；
- ledger/journal 无容量、TTL、compaction 或 DoS 策略；
- migration/recovery 为提速跳过 validation、原子性、备份或冲突检查；
- 跨 facade 竞态产生重复 mutation、覆盖、死锁或失败队列中毒；
- Focus background/kill/restart 出现重复完成、遗漏或不可解释漂移；
- 提醒使用高频后台轮询、永久 wake lock，或重启产生重复/孤儿计划；
- 内存持续增长、GC/stall 无 trace 解释；
- APK/AAB/JS bundle 超过回归门槛且无批准的功能原因；
- 只提交 debug、模拟器、fake timer、单次最佳结果或作者自报，没有原始样本和独立 reviewer；
- iOS 上线前仍没有 macOS/Xcode/真实 iPhone 的独立性能与后台可靠性证据。

## 19. 代码读取后必须核实的 TBD

1. React Native/Hermes release 配置、New Architecture、bundle 拆分与 source map 策略。
2. Task/FocusSession 实际 storage key、序列化、全量重写、缓存和索引模型。
3. snapshot 正式最大 Task/subtask/container/depth/byte 限制与 513+ 容量决策。
4. 四象限/query 的算法复杂度、排序稳定性和深拷贝次数。
5. operation ledger/journal schema、查找复杂度、515 行为、TTL、compaction 与重启语义。
6. repository/storage 跨 facade 的共享锁、队列和故障恢复实现。
7. migration/quarantine/recover/restore 的真实 I/O 次数和中间分配。
8. Focus timer 使用 wall-clock、monotonic clock、interval 或 AppState 的具体方式。
9. Android/iOS notification scheduler、后台限制、权限和重复注册策略。
10. UI 列表是否虚拟化、分页、memoization，以及 tombstone 是否进入默认渲染。
11. release APK/AAB/每 ABI/JS/native library 体积与商店 estimated download size。
12. 日志、遥测和性能 instrumentation 本身的开销与隐私边界。

完成代码审计和首轮真实设备测量后，应把建议数字替换为按设备、容量合同和 accepted baseline 校准的绑定预算；在此之前本文始终保持 **NON-BINDING / MEASUREMENTS NOT RUN**。
