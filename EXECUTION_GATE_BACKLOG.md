# EXECUTION GATE BACKLOG

> **Manager Ledger / Non-authoritative until verified**
>
> 本文件是 Manager Agent 的恢复执行台账，不是测试锁、审查通过证明或交付授权。
> 其中标记为 `draft`、`UNVERIFIED`、`revoked` 或 `TBD` 的内容不得用于派遣生产实现、宣称质量门禁通过或交付。

## 1. 范围与证据边界

- 唯一项目范围：`outputs/start-five`。
- `outputs/qingji-ai` 是独立记账项目，必须保持互不干扰。
- 本台账只记录当前对话中已经明确出现的事实；未在上下文给出完整值的字段写为 `TBD`，禁止补猜。
- 测试作者的旧运行结果不能代替全新独立 reviewer 的亲自运行。
- draft 文件摘要不能代替 manifest self identity；没有正式 self 就没有可冻结测试锁。

## 2. 当前平台阻塞

当前平台触发 usage limit，自动审批提示的恢复方式为：

- 等待至 **2026-08-10 18:54（Asia/Shanghai）** 后重试；或
- 增加可用额度。

在额度恢复前，受阻的 Jest、TypeScript 与需要相同权限的门禁不得通过非提权 Node、替代 cwd、间接命令等方式绕过。未亲自执行的门禁必须保持 `UNVERIFIED`。

## 3. 锁、草案与实现状态

| 工作流 | 当前身份/摘要 | 状态 | 约束与下一步 |
|---|---|---|---|
| GAP-P0-02A | self `a6576289ac7488aa001a5313e688ef4725849778c1ea497ceb4d581c9f935a28` | **已冻结且有效** | 保持不可修改；作为后续正式回归基线。 |
| GAP-P0-01A2 | self 以 `6b92…` 开头；完整 self：`TBD` | **已冻结且有效** | 不得把后续 Review1 draft 混入此锁；完整 self 必须从既有正式记录核对，不能猜测。 |
| GAP-P0-02B | self 以 `9389…` 开头；完整 self：`TBD` | **已冻结且有效** | 不得把后续 Review1 draft 混入此锁；完整 self 必须从既有正式记录核对。 |
| GAP-P0-01A2 Review1 第四轮 | 20 tests；静态预期 15 red / 5 green；无 self | **UNVERIFIED draft** | 精确 `NODE_OPTIONS`：`TBD`。先完成独立运行、正式回归、tsc、锁生成与新 self，再派全新 test reviewer。 |
| GAP-P0-02B Review1 | 3 suites / 14 tests；静态预期 9 red / 5 green；draft SHA 以 `8e577…` 开头；不是 self | **UNVERIFIED draft** | draft SHA 不能作为锁。必须完成门禁、正式 manifest/self 与全新 test review。 |
| GAP-P0-04 | 已撤销 self `e3c99a0f74ecc83d4d5d064acc0addbf7992bcee4a6dd2b9f8ae92bcdcb24555` | **revoked** | 第六轮修订仅处于计划状态，无文件级验证、无新 self；不得派实现。 |
| QUALITY_GATE_V2 | 身份与完整门禁：`TBD` | **非绑定草案** | 不能算 accepted gate 或默认质量入口。 |
| GAP-P0-03A | 身份、测试根与完整门禁：`TBD` | **非绑定草案** | 不能派实现或计入正式回归。 |

## 4. 当前生产实现不得交付

### GAP-P0-01A2 首版实现

- 已记录的首版测试结果：91 / 91。
- 独立代码审查结论：**FAIL**，存在 2 个缺陷。
- 两个缺陷的精确文本在本台账可见上下文中未提供：`TBD-A2-CR-1`、`TBD-A2-CR-2`。
- 91 / 91 不能覆盖代码审查失败，也不能作为交付依据。
- 必须先完成 A2 Review1 的正式测试锁和独立 test review，再返工实现，并重新经历全新 code review。

### GAP-P0-02B 生产实现

- 已记录的实现测试结果：252 / 252。
- 独立代码审查结论：**FAIL**，存在 3 个缺陷。
- 三个缺陷的精确文本在本台账可见上下文中未提供：`TBD-02B-CR-1`、`TBD-02B-CR-2`、`TBD-02B-CR-3`。
- 252 / 252 不能覆盖代码审查失败，也不能作为交付依据。
- 必须先完成 02B Review1 的正式测试锁和独立 test review，再返工实现，并重新经历全新 code review。

## 5. 额度恢复后的强制执行顺序

每个尚未冻结的候选都必须严格按以下顺序执行，禁止跨步：

1. **候选 Jest**：由当前候选作者完成完整候选运行，记录 suites/tests、red/green、退出状态、snapshot 与 open-handle 情况。
2. **正式回归**：运行全部当时已冻结且有效的测试根；活动 draft、撤销锁与非绑定草案必须排除。
3. **TypeScript**：运行 `pnpm exec tsc --noEmit`。
4. **锁核验/生成**：验证既有 accepted manifests 零漂移，并按该候选规格生成正式 manifest。
5. **新 self**：最后计算 manifest 自身 SHA-256；只有这个完整值是候选 self。
6. **全新独立 test review**：reviewer 必须亲跑候选 Jest、正式回归、tsc 与锁核验；作者旧输出不可代替。
7. **实现/返工**：仅在 test review 明确 PASS 后派遣实现 agent；测试锁不可修改。
8. **全新独立 code review**：实现测试全绿仍不得直接交付；代码、锁与门禁必须由未参与作者/实现的 reviewer 再审。FAIL 后返工并重新完整审查。

## 6. 已知可复用命令与根

所有命令从 `outputs/start-five` 执行。精确运行环境中的 Node/pnpm 路径沿用项目既有固定运行时；本台账不补猜未提供的环境变量值。

### 6.1 GAP-P0-04 已知候选根

第六轮仍计划使用已知根 `tests/gap-p0-04`；修订后的 suites/tests 数和新 self 均为 `TBD`：

```powershell
pnpm exec jest --runInBand --ci --coverage=false --detectOpenHandles --roots tests/gap-p0-04
```

撤销的第五轮静态记录是 10 suites / 232 tests、214 red / 18 green，但该旧结果不得引用为第六轮证据。

### 6.2 已知的旧稳定回归命令

以下命令来自现有 P0-04 规格中的明确稳定基线；它只覆盖当时的 15 个 accepted manifests / 87 entries，不自动包含后来冻结的 A2 与 02B：

```powershell
pnpm exec jest --runInBand --ci --coverage=false --roots tests/locked tests/review1 tests/review2 tests/review3 tests/phase4 tests/phase4-review tests/review4 tests/phase4-review2 tests/phase4-review3 tests/phase4-review4 tests/phase4-review5 tests/native-scaffold tests/native-review tests/gap-p0-01a tests/gap-p0-02a
```

该历史基线的已知目标是 57 suites / 353 tests green。额度恢复后的“当前正式回归”还必须加入已冻结 A2 与 02B 的真实测试根；其精确根串应从正式锁记录核对：

```text
GAP-P0-01A2 accepted root: TBD
GAP-P0-02B accepted root: TBD
```

不得根据 manifest 文件名自行猜测根路径。

### 6.3 A2 Review1 第四轮 draft

```text
Candidate root: TBD
NODE_OPTIONS: TBD（必须核对原正式记录；禁止猜测）
Static expectation only: 20 tests = 15 red + 5 green
Manifest self: none
```

恢复后命令模板；替换 `TBD` 前不得执行或冻结：

```powershell
$env:NODE_OPTIONS='TBD'
pnpm exec jest --runInBand --ci --coverage=false --detectOpenHandles --roots TBD
pnpm exec jest --runInBand --ci --coverage=false --roots TBD_CURRENT_ACCEPTED_ROOTS
pnpm exec tsc --noEmit
```

### 6.4 GAP-P0-02B Review1 draft

```text
Candidate root: TBD
Static expectation only: 3 suites / 14 tests = 9 red + 5 green
Draft SHA prefix: 8e577…
Manifest self: none
```

恢复后命令模板：

```powershell
pnpm exec jest --runInBand --ci --coverage=false --detectOpenHandles --roots TBD
pnpm exec jest --runInBand --ci --coverage=false --roots TBD_CURRENT_ACCEPTED_ROOTS
pnpm exec tsc --noEmit
```

### 6.5 通用 TypeScript 与锁门禁

```powershell
pnpm exec tsc --noEmit
```

精确 manifest 构建/核验命令未在当前可见上下文中给出，记为 `TBD`。恢复后必须按各测试规格规定的顺序、路径、格式、库存和 SHA-256 规则执行，不能用手工摘要或 draft SHA 替代。

## 7. 恢复执行队列

1. 补齐 A2 Review1 第四轮的精确 `NODE_OPTIONS`、候选根和正式回归根，完成门禁并生成新 self。
2. 派全新 A2 Review1 test reviewer；PASS 后才允许返工 A2 的 2 个代码审查缺陷。
3. 补齐 02B Review1 的候选根，完成门禁并生成新 self。
4. 派全新 02B Review1 test reviewer；PASS 后才允许返工 02B 的 3 个代码审查缺陷。
5. 编写并门禁 P0-04 第六轮修订，生成新 self，再派全新 test reviewer；旧 `e3c99…` 永久不得复用。
6. 仅在上述交付链闭环后，重新评估 QUALITY_GATE_V2 与 GAP-P0-03A 非绑定草案。

## 8. 禁止性结论

- `6b92…`、`9389…` 与完整 `a6576289…` 是既有冻结身份；Review1 draft 不会自动改变它们。
- A2 Review1 第四轮无 self；02B Review1 的 `8e577…` 只是 draft SHA，不是 self。
- P0-04 `e3c99…` 已撤销，第六轮目前没有新 self。
- 91 / 91 与 252 / 252 都不能覆盖各自 code review FAIL。
- 未恢复额度、未亲跑、未生成正式锁、未完成全新独立 test review 和 code review 前，任何相关功能都不得标记为完成或交付。
