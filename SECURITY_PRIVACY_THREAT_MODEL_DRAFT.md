# SECURITY & PRIVACY THREAT MODEL — DRAFT

> **NON-BINDING / CODE NOT INSPECTED / NOT A COMPLIANCE CERTIFICATION**
>
> 本文档仅依据当前会话中已知的产品架构编写，尚未读取或审计实现代码、Android/iOS 配置、第三方依赖、构建产物或运行时行为。所有“控制”均是建议或验收门槛，不代表已经实现。本文不构成法律意见，也不证明产品已符合《中华人民共和国个人信息保护法》（PIPL）或任何其他法律、标准、认证。

## 1. 文档目的与适用范围

本草案为“先做5分钟”建立一份可在代码审计后收敛的 STRIDE-lite 安全与隐私模型。当前已知范围包括：

- 本地 Task 与 Subtask 数据；
- 本地 FocusSession 数据；
- 提醒计划及通知展示；
- operation ledger / journal、`operationId` 幂等与恢复信息；
- schema 迁移、corrupt 数据隔离、quarantine 备份与显式恢复；
- 自由文本任务、第一步、描述、诊断或错误信息；
- 未来可能增加的账户认证、云同步、多租户、AI 能力；
- Android 与 iOS 客户端，以及其操作系统备份、通知、日志和权限边界。

当前不在已知实现证据中的内容必须标记为 `TBD`，包括服务端、账号体系、具体通知 SDK、遥测平台、AI 服务商、数据驻留地区、加密方案和保留期。

## 2. 安全与隐私目标

1. **不丢数据**：迁移、恢复、并发、异常与重启不能静默清空或覆盖用户数据。
2. **不泄露内容**：任务、专注记录、提醒文本、备份和错误 payload 不进入未经授权的通知、日志、遥测或第三方服务。
3. **最小处理**：只收集和处理完成明确产品目的所必需的数据。
4. **可控与可撤回**：用户能够理解本地/云端/AI 数据用途，并能导出、删除和撤回可选处理。
5. **隔离正确**：Task、FocusSession、恢复元数据、未来账号租户之间不能串读、串写或互相覆盖。
6. **失败关闭**：未知 schema、损坏数据、冲突状态和未授权请求不得被猜测、降级或默认为空。
7. **可验证**：每个 P0 控制必须有自动化或设备级验收证据，不能只靠文档声明。

## 3. 数据资产与敏感度

| 资产 | 可能内容 | 建议分类 | 主要风险 |
|---|---|---|---|
| Task/Subtask | 标题、描述、时间、优先级、第一步、完成状态 | 个人信息；内容可能构成敏感或高度私密信息 | 明文存储、锁屏通知、日志、导出或云同步泄露 |
| FocusSession | 任务关联、开始/结束时间、中断原因、专注习惯 | 行为与习惯数据 | 画像、工作/健康状态推断、跨模块串写 |
| 提醒计划 | 时间、任务引用、通知正文 | 个人信息 | 锁屏旁观者泄露、错误调度、重复提醒 |
| operation ledger / journal | operationId、状态、错误、重试与持久化记录 | 元数据；可能间接关联任务 | 重放、无限增长、关联分析、错误 payload 泄露 |
| quarantine/corrupt 备份 | 无法解析的原始 Task 字节 | **按最高敏感度处理** | 长期滞留、无法删除、备份外泄、错误恢复覆盖在线数据 |
| 错误与诊断 | error code、cause、stack、设备/运行信息 | 可能包含个人信息或密钥 | 自动日志/遥测泄露、自由文本注入 |
| 认证令牌（未来） | access/refresh token、session、设备绑定信息 | 认证秘密 | 账号接管、跨租户访问 |
| 云同步数据（未来） | 上述数据的服务端副本及版本 | 个人信息 | 越权、IDOR、冲突覆盖、跨境与供应商风险 |
| AI 输入/输出（未来） | 用户任务文本、上下文、模型回复 | 个人信息；可能含敏感信息 | 未知二次使用、训练、跨境、提示注入、输出泄露 |

任务文本本身不得被默认视为“普通低敏数据”。用户可能输入健康、财务、工作机密、家庭关系或位置等内容，因此所有自由文本按潜在敏感内容设计。

## 4. 信任边界

1. **用户 ↔ App UI**：输入、展示、导出、删除、恢复确认。
2. **UI ↔ 应用服务**：Task、FocusSession、提醒与恢复操作。
3. **应用服务 ↔ 本地持久化**：AsyncStorage 或其他本地后端、schema envelope、ledger/journal。
4. **在线数据 ↔ quarantine 备份**：原始损坏字节、显式恢复与未来显式删除。
5. **Task ↔ FocusSession**：独立 schema/key，但存在任务关联。
6. **App ↔ OS**：锁屏通知、应用沙箱、系统备份、剪贴板、截图、权限、Keychain/Keystore。
7. **App ↔ 日志/崩溃/遥测 SDK**：当前是否存在为 `TBD`。
8. **客户端 ↔ 服务端（未来）**：TLS、认证、授权、同步冲突、租户隔离。
9. **服务端 ↔ AI/第三方（未来）**：数据用途、保留、训练、跨境、供应链与删除传递。

任何跨边界的数据都应有明确目的、最小字段、鉴权、错误处理和生命周期。当前尚未通过代码确认这些边界的实现。

## 5. 攻击者与滥用者模型

- 获得已解锁或已 root/jailbreak 设备访问权的人；
- 能读取系统/云端设备备份的人；
- 锁屏旁观者或截图接收者；
- 能触发畸形输入、超大输入、重复 operationId 或并发请求的本地用户/自动化；
- 恶意或出错的第三方 SDK、日志/崩溃采集平台；
- 未来能够窃取 token、操纵网络或尝试跨租户访问的远程攻击者；
- 未来恶意 AI 内容、提示注入来源或不符合约定的数据处理供应商；
- 开发/运维误配置、错误 schema 发布、错误保留策略造成的内部风险。

本模型不声称能够抵御拥有完整 root/jailbreak、调试注入和内存读取能力的攻击者；但仍应降低离线提取、误日志和备份泄露风险。

## 6. STRIDE-lite 威胁分析

| 类别 | 代表威胁 | 影响 | 建议控制 |
|---|---|---|---|
| Spoofing | 未来 token 被复制；伪造 operationId；伪造租户/任务 ID | 账号接管、错误重放、跨用户访问 | Keychain/Keystore、短期 token、刷新轮换、服务端所有权校验、不可预测且有作用域的 operationId |
| Tampering | AsyncStorage/备份被改写；schema 降级；journal 被插入或截断 | 静默数据损坏、回滚旧状态、错误恢复 | exact schema/version、完整语义验证、失败关闭、原字节隔离、原子提交、可选完整性校验 |
| Repudiation | 用户无法区分正常操作、重试、恢复和同步覆盖 | 争议、无法定位数据丢失 | 最小化且不含正文的本地审计元数据、operation receipt、可解释的冲突与恢复状态 |
| Information Disclosure | 明文 AsyncStorage、系统备份、锁屏通知、日志/cause、导出、AI 发送 | 私密内容泄露 | 备份策略、设备数据保护、通知脱敏、日志红线、导出确认、AI 明示选择与字段最小化 |
| Denial of Service | operationId 洪泛、ledger 无限增长、深层/超大 JSON、重复提醒、并发队列阻塞 | 启动失败、存储耗尽、无法操作 | 输入/容器/队列上限、ledger TTL/容量、非阻塞恢复、失败不污染队列、限速与配额 |
| Elevation of Privilege | 未来客户端只做授权；服务端接受任意 tenant/taskId；恢复接口覆盖其他数据 | 跨租户读写、权限扩大 | 服务端逐对象授权、租户隔离测试、管理操作单独权限、客户端输入不作为授权依据 |

## 7. 重点威胁与控制

### 7.1 AsyncStorage 明文与设备备份

React Native AsyncStorage 通常不应被当作秘密存储或数据库级加密保证。需在代码和平台配置中核实：

- Task、FocusSession、ledger、quarantine 是否以可读 JSON 明文落盘：`TBD`；
- Android `allowBackup` / data extraction rules 是否会包含这些文件：`TBD`；
- iOS 文件保护等级及 iCloud/iTunes backup 行为：`TBD`；
- 调试构建、开发菜单或设备日志是否暴露持久化内容：`TBD`。

P0 决策应二选一并留证：

1. 禁止系统备份这些敏感数据；或
2. 只允许满足已定义加密和恢复模型的备份，并向用户说明风险。

认证令牌不得存放在 AsyncStorage；未来必须使用 iOS Keychain / Android Keystore 支持的安全存储。若产品选择本地数据库加密，密钥也不得与密文同位置明文保存。

### 7.2 锁屏通知

提醒通知可能直接暴露任务标题、第一步或描述。默认策略建议：

- 锁屏默认使用通用文案，例如“你有一个待开始的5分钟任务”；
- 仅在用户主动选择“显示任务内容”后展示标题；
- 永不把描述、诊断、备份内容、账号/token 放入通知；
- Android notification channel 与 iOS preview 设置应尊重系统隐私设置；
- 点击通知后的路由仍需验证任务存在、状态和当前用户/租户。

### 7.3 日志、error cause 与 payload 泄露

现有恢复设计可能需要保留 backend error `cause` 身份用于内部错误链，但这不授权把 cause 自动序列化、展示或上传。

P0 日志红线：

- 禁止记录 Task/FocusSession 正文、原始持久化字节、quarantine bytes、token、通知正文；
- 公开错误只暴露稳定 code/category 和用户可理解的安全文案；
- stack、cause、Proxy trap 文本、自由文本 marker 不进入 UI、release 日志或遥测；
- 如必须上传诊断，采用字段白名单、长度限制、采样和用户可见的隐私说明；
- release 构建不得保留打印完整状态快照的 debug 日志。

### 7.4 Corrupt/quarantine 备份生命周期

隔离备份必须优先防止数据丢失，但“永久保留且无删除入口”会形成隐私与存储风险。建议分阶段：

- 当前恢复阶段保持“不得自动删除”的安全原则；
- 发布前提供备份清单、来源、创建时间、类别和大小，但不直接预览敏感原文；
- 提供用户显式删除，要求二次确认，并明确删除不可恢复；
- 删除备份不得删除或改写当前在线 Task 数据；
- 恢复成功后仍不自动删除，除非产品提供独立、透明、可撤销前确认的策略；
- 定义最大数量/总容量和保留期；达到上限时失败关闭并提示，而不是静默覆盖最旧备份；
- 闪存介质通常无法承诺物理安全擦除，只能承诺逻辑删除及后续不可访问，应在说明中避免“彻底擦除”保证。

备份显式删除 API、UI、保留期和容量策略当前均为 `TBD`。

### 7.5 operationId 重放与 DoS

operation ledger / journal 应至少满足：

- 同一 operationId + 同一规范化 payload：返回相同结果，不重复副作用；
- 同一 operationId + 不同 payload：稳定冲突错误，且零持久化变更；
- operationId 有长度、字符集、命名空间和作用域限制；未来网络场景使用高熵随机 ID；
- ledger 有最大条目数、最大字节数和明确 TTL/清理规则；
- 失败、重启与并发不会永久占用 pending 状态或污染队列；
- 不允许通过生成大量唯一 operationId 无限消耗存储、CPU 或提醒槽位；
- journal 中不保存不必要的自由文本正文。

### 7.6 跨 facade 竞态

Task 数据迁移、业务写入、quarantine、recover、restore 以及同一物理后端上的多个 facade 可能竞争。P0 控制：

- 协调身份基于物理 backend + key，而不是单个 adapter 实例；
- 占用检查和最终写入处于同一线性化边界；
- canonical set 成功后才允许 cleanup remove；
- 写入、删除失败不污染后续队列；
- 一个 winner 完成后，后续 recover/restore 必须观察到 occupied target；
- Task 与 FocusSession 采用独立 key/schema/队列，测试证明管理操作不触碰对方 sentinel。

### 7.7 Schema 降级与恶意迁移

- 只接受文档化的 exact schema/version/root；
- future、负数、字符串、null、小数版本一律拒绝，不猜测；
- 不允许把未知新版本降级成旧版本或空数组；
- historical key 只接受其文档化格式；
- 迁移必须全语义验证、canonical write、故障原子、保留原字节；
- release 需有升级和回滚兼容矩阵；旧版 App 打开新版数据时不得破坏新版数据。

是否存在跨版本签名/完整性校验、版本回滚策略和真实设备升级测试：`TBD`。

### 7.8 自由文本与诊断输入

任务标题、描述、第一步、中断原因及未来 AI prompt 均为不可信输入：

- 定义 UTF-8 字节和字符上限；限制控制字符和异常换行；
- UI 渲染必须转义，不拼接进 HTML、SQL、URL、日志模板或通知 channel ID；
- 不以自由文本作为 error code、文件名、存储 key、operationId 或遥测维度；
- 不把用户正文包含在公开 stack/message/cause serialization；
- 导出时使用结构化编码并防止 CSV/公式注入；
- AI 输出仍是不可信内容，不能直接触发删除、提醒、同步或账号操作。

具体长度上限和编码策略：`TBD`。

### 7.9 导出、删除与保留期

PIPL/privacy-by-design 视角下应设计：

- 可发现的数据清单与处理目的；
- 结构化导出 Task、Subtask、FocusSession 和提醒配置；
- 默认不导出 token、内部 ledger、原始错误、quarantine bytes；备份需单独明确选择；
- 删除全部数据覆盖 Task、FocusSession、提醒、ledger/journal、quarantine、缓存、账号 token 和云端副本；
- 删除操作有明确范围、确认、错误回滚与完成回执；
- 云同步/AI 供应商存在时，删除请求需要向下游传播并留存非正文状态证据；
- 定义每类数据的目的、保留期、到期动作与合法例外。

当前导出、删除、保留期与下游删除能力：`TBD`。

### 7.10 权限最小化

本地任务与专注核心功能原则上不需要联系人、精确位置、麦克风、相机、短信、通话记录等权限。发布前必须：

- 建立 Android Manifest 与 iOS entitlement/usage-description 清单；
- 通知权限只在用户理解提醒价值的时机请求；
- 未启用的未来功能不预申请权限；
- 第三方依赖引入的合并权限必须审计并移除不必要项；
- 后台运行、精确闹钟或电池豁免如确需使用，应有可解释目的和降级路径。

当前权限清单：`TBD`。

### 7.11 未来认证、同步与多租户

在这些功能发布前必须新增独立威胁模型并满足：

- TLS 1.2+、系统证书校验、禁止明文 HTTP；如使用证书固定，必须有轮换和失效方案；
- access token 短期有效，refresh token 轮换、撤销、退出清理和设备丢失处理；
- token 仅存 Keychain/Keystore，不进入 AsyncStorage、日志、URL 或崩溃报告；
- 服务端从认证上下文确定 tenant/user，不信任客户端提交的 ownerId；
- 每个 Task、FocusSession、备份、导出、删除接口执行对象级授权；
- 同步冲突不以“最后写入”静默覆盖，至少保留版本/冲突证据和确定性策略；
- 速率限制、配额、审计、账号枚举防护和异常会话处置；
- 数据驻留、跨境传输、处理者协议和安全事件响应均需法律/隐私评估。

### 7.12 未来 AI 数据使用

AI 功能默认不得自动上传全部任务库。发布前至少需要：

- 明确具体目的、输入字段、服务商、数据地区、保留期、是否用于训练；
- 对可选 AI 处理取得清晰选择，并提供不使用 AI 的核心路径；
- 默认最小化上下文，支持用户预览/编辑将要发送的内容；
- 合同和技术配置禁止未经授权的训练或二次使用；
- 对敏感内容做本地提示/脱敏，但不得声称自动脱敏绝对可靠；
- 防范 prompt injection、数据外带、工具调用越权与模型输出幻觉；
- AI 输出不得直接执行删除、付款、同步覆盖、权限变更或通知群发；
- 支持 AI 数据访问、删除、撤回与下游传播；
- 跨境或敏感个人信息处理在启用前完成适用的法律评估。

AI 供应商、模型、训练设置、地域、DPA/合同和安全测试均为 `TBD`。

## 8. PIPL 与 privacy-by-design 检查清单

以下是工程检查项，不是合规结论：

- [ ] 每项个人信息处理均有明确、合理、直接相关的目的和适用处理基础。
- [ ] 隐私说明列出数据类别、目的、方式、保存期限、接收方和用户权利渠道。
- [ ] 默认只处理实现核心任务/专注功能所需的最少数据。
- [ ] 通知内容、遥测、云同步、AI 使用采用分层且可理解的选择，不捆绑非必要同意。
- [ ] 涉及敏感个人信息时，评估必要性、影响和更严格保护措施；需要单独同意时单独获取。
- [ ] 未成年人用户与监护人规则、年龄策略和适用性：`TBD`。
- [ ] 提供访问、更正、复制/导出、删除、撤回和注销渠道，并验证请求者身份。
- [ ] 定义并执行数据保留期；quarantine 不因技术方便无限期无上限保留。
- [ ] 第三方处理者、SDK、云与 AI 服务均建立清单、合同义务和删除传递机制。
- [ ] 涉及委托处理、共同处理、对外提供或跨境时，完成适用的告知、同意、影响评估与法律机制。
- [ ] 对高风险处理、敏感信息、自动化决策、跨境或大规模行为分析开展个人信息保护影响评估并留存记录。
- [ ] 建立安全事件发现、遏制、评估、通知和复盘流程。
- [ ] 不使用“PIPL 已认证”“绝对安全”“完全匿名”等未经事实支持的宣传。

## 9. P0 / P1 控制优先级

### P0 — 发布阻断级

1. 明确并验证本地明文、系统备份和平台文件保护策略。
2. 锁屏通知默认脱敏，用户正文展示必须显式开启。
3. release 日志、错误、cause、stack、遥测中零 Task/Focus/backup/token payload。
4. schema/迁移/恢复失败关闭、原子、无静默空数组或降级。
5. quarantine 有容量上限、用户可理解的状态以及计划中的显式删除闭环；发布政策不得无限制无说明保留。
6. operationId 冲突、重放和 ledger/journal 容量/TTL 有确定性规则。
7. 同物理后端跨 facade 的迁移、恢复和写入竞态有锁定测试。
8. 自由文本、JSON 容器、深度、数组、operationId 和导出大小均有边界。
9. “删除全部”覆盖所有本地数据域；如云/AI 尚未上线，应确认相关网络路径被禁用。
10. Android/iOS 权限、backup、network security、entitlement 与 release 日志配置完成审计。
11. 若启用 auth/sync：安全 token 存储、TLS、逐对象授权和租户隔离测试全部通过。
12. 若启用 AI：明确选择、最小字段、供应商用途/训练/删除/地域和工具权限控制全部完成。

### P1 — 发布后首个安全增强周期或高风险功能上线前

1. 可配置的通知隐私级别与应用内隐私中心。
2. 备份清单、恢复预览、显式删除、容量与保留期 UI 完整化。
3. 本地数据库加密/应用锁/生物识别的威胁和可用性评估。
4. 隐私友好的安全遥测、告警和事件响应演练。
5. 自动依赖漏洞扫描、SBOM、密钥扫描和 release provenance。
6. 云同步冲突历史、账号设备管理、token 撤销和异常会话提醒。
7. AI prompt injection、红队、输出安全和供应商持续评估。

## 10. 可测试验收矩阵

| ID | 优先级 | 控制 | 可测试验收标准 | 证据状态 |
|---|---|---|---|---|
| SP-001 | P0 | 本地备份策略 | Android manifest/data extraction rules 与 iOS 文件保护/备份配置经静态审计；真实设备 backup/restore 不泄露被排除数据 | `TBD` |
| SP-002 | P0 | AsyncStorage 明文风险 | 使用 sentinel Task 检查落盘、debug 工具和备份；若明文存在，风险与控制符合已批准策略 | `TBD` |
| SP-003 | P0 | 安全令牌存储 | 未来 token 不出现在 AsyncStorage、日志、导出和 URL；Keychain/Keystore 读写、退出清理、设备重启测试通过 | 未启用功能 / `TBD` |
| SP-004 | P0 | 锁屏通知脱敏 | 锁定设备上默认通知不含 sentinel 标题/描述/第一步；显式开启后只展示允许字段 | `TBD` |
| SP-005 | P0 | 日志与错误非披露 | 用含 sentinel 的 Task、backup、Proxy trap、backend cause 触发所有错误；UI、release console、遥测 payload 和序列化错误均不含 sentinel | `TBD` |
| SP-006 | P0 | quarantine 保留 | 自动流程不删除备份；容量超限失败关闭；备份清单不显示原文；保留政策可解释 | `TBD` |
| SP-007 | P0 | 显式删除备份 | 二次确认后只删除目标备份；当前 Task、其他备份、FocusSession 不变；失败可重试且不假报成功 | `TBD` |
| SP-008 | P0 | 迁移失败关闭 | malformed、wrong-root、foreign、future、extra、invalid 均双读稳定拒绝，零 mutation，原字节不变 | 测试/实现状态待独立复核 |
| SP-009 | P0 | 防降级 | 新版 schema 被旧版读取时拒绝且字节不变；不得迁移为旧版或空数组 | `TBD` |
| SP-010 | P0 | operationId 重放 | 同 ID/同 payload 单副作用；同 ID/异 payload 冲突；重启后结果一致 | 测试/实现状态待独立复核 |
| SP-011 | P0 | operationId/ledger DoS | 超长/非法 ID 拒绝；唯一 ID 洪泛达到容量/TTL 后行为确定且存储有界 | `TBD` |
| SP-012 | P0 | 跨 facade 竞态 | 两个 facade + 同物理 backend 的 barrier 测试证明单 winner、无覆盖、失败不毒化队列 | 测试/实现状态待独立复核 |
| SP-013 | P0 | Task/Focus 隔离 | 每个 Task 管理操作对 Focus sentinel 零读/写/删，反向同样成立 | 测试/实现状态待独立复核 |
| SP-014 | P0 | 输入资源边界 | 256/257 数组、512/513 容器、深度、cycle、Proxy、accessor、symbol、sparse、非有限数边界均锁定 | 测试/实现状态待独立复核 |
| SP-015 | P0 | 自由文本安全 | 长度、控制字符、Unicode、换行、公式注入和日志 marker 矩阵通过；UI/导出正确转义 | `TBD` |
| SP-016 | P0 | 导出最小化 | 导出只含用户选择的数据域；默认排除 token、ledger、errors、raw backup；文件分享有明确确认 | `TBD` |
| SP-017 | P0 | 删除全部 | Task、Focus、reminders、ledger、quarantine、cache、tokens 全部删除；失败不返回成功；重启后仍为空 | `TBD` |
| SP-018 | P0 | 权限最小化 | Android/iOS 权限与 entitlements 清单仅含启用功能需要项；依赖合并权限无额外项 | `TBD` |
| SP-019 | P0 | TLS 与明文阻断 | 未来网络只允许 HTTPS/TLS；明文 endpoint、无效证书、中间人证书均失败关闭 | 未启用功能 / `TBD` |
| SP-020 | P0 | 多租户授权 | 未来每个对象 API 使用服务端身份校验 owner/tenant；跨租户 ID 矩阵全部 403/404 且零泄露 | 未启用功能 / `TBD` |
| SP-021 | P0 | AI 最小化与选择 | 未选择 AI 时零请求；请求只含预览字段；sentinel 非选字段不离开设备；供应商训练/保留设置有证据 | 未启用功能 / `TBD` |
| SP-022 | P1 | 依赖与供应链 | lockfile 审计、漏洞扫描、SBOM、密钥扫描、恶意包与许可证检查纳入 CI | `TBD` |
| SP-023 | P1 | 安全事件响应 | 完成一次本地数据泄露/云 token 泄露桌面演练，有责任人、时限和通知判定 | `TBD` |

## 11. Release blockers

在代码读取和验证前，以下任一情况都必须阻断 production release：

- 无法证明 release 构建不会把用户正文、备份或 token 输出到日志/遥测；
- 未决定或未验证 Android/iOS 设备备份与文件保护策略；
- 锁屏默认通知暴露任务正文；
- corrupt/migration/recovery 存在静默清空、降级、覆盖或无界备份增长风险；
- operation ledger/journal 或输入尺寸无明确上限；
- 缺少全数据域导出/删除/保留期设计，且隐私说明与实际行为不一致；
- 存在核心功能不需要的高风险权限；
- auth/sync 已启用但 token 安全存储、TLS、逐对象授权、租户隔离未验证；
- AI 已启用但数据用途、训练、保留、删除、跨境与选择机制未明确；
- P0 验收只有作者自报，没有独立 reviewer 或设备证据；
- 隐私文案声称已合规、已加密、已匿名或绝对安全，但没有实现与审计证据。

## 12. 代码读取后必须核实的 TBD

1. Android Manifest、network security config、backup/data extraction rules、notification channel、release logging。
2. iOS entitlements、Info.plist、Data Protection、backup exclusion、notification preview。
3. AsyncStorage 的实际 keys、序列化格式、文件位置和 Task/Focus/ledger/quarantine 数据流。
4. operation ledger/journal 的 schema、容量、TTL、operationId 生成与冲突规则。
5. 提醒调度器、取消/延迟/重启恢复和通知正文构造。
6. error class、cause、stack、console、崩溃与遥测 SDK 的序列化路径。
7. quarantine 清单、恢复、删除、容量和保留策略。
8. 导出、删除全部、缓存、系统分享和剪贴板行为。
9. 所有第三方 SDK、依赖、隐私清单、遥测 endpoint 和供应链风险。
10. 未来 auth/sync 服务端协议、token 生命周期、对象授权与 tenant 数据模型。
11. 未来 AI prompt 组装、供应商、地域、训练设置、工具权限与删除传递。
12. 隐私政策、用户同意记录、未成年人策略、数据主体请求和安全事件流程。

完成上述读取后，应将本草案转为带文件/行号、配置快照、测试结果、责任人和截止日期的正式威胁模型；在此之前继续保持 **NON-BINDING / CODE NOT INSPECTED**。
