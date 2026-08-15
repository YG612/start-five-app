# GAP-P0-06 四象限任务工作台 v1：锁定测试规范

## R1 受控 fixture 一致性状态

- 状态：`PENDING ONE DELTA REVIEW / NO PRODUCTION AUTHORITY`。
- 原 GAP-P0-06 candidate self `74747883719b353243aacdbae245e29607d2f268404e2564186dc1495605873d` 标记为 `CONTROLLED SUPERSEDED FOR ASYNC EVENT + PROTOCOL-NEUTRAL NET-BYTE ORACLE FIXTURE CONSISTENCY / NEVER USED FOR PRODUCTION`。这是测试 fixture 一致性纠正，不是生产质量失败。
- 原规范与测试资产保持冻结、不作修改。R1 只等待两个异步文本输入事件，并将编辑/删除旅程对物理 backend 写入次数的假设替换为协议中立的稳定全字节快照：entries 仅按 key 排序后 `JSON.stringify`，不解析 storage key 或 envelope。失败与取消后的全字节必须和操作前完全相同，成功后的全字节必须发生净变化。所有 6 个旅程与 operation ID 保持原样；不得按 storage key 过滤、扣除固定写入次数或放宽为 `>=`。

## 1. 范围与锁定边界

本测试集只锁定大众用户从 `createStartFiveApp(...).AppRoot` 可见、可操作的多任务工作台。生产实现应复用同一任务 repository、既有任务生命周期/四象限/推荐规则以及既有 5 分钟专注运行时；不得改变现有领域合同。

测试只使用公共 AppRoot/UI、同一个注入 backend、显式 ISO 时钟与 ID 序列。允许通过公开的 `createTaskLifecycleService` 对同一 composition.repository 准备数据；最终验收必须来自 UI，涉及跨启动的旅程必须复制 backend 原始字节后创建全新 composition。测试不得导入任何私有 Provider/context，不手写持久化 envelope 或 storage key，不使用网络、sleep、真实时间或 Jest fake timers，也不重复验证底层仓储原子协议。

候选锁包含且仅包含：

- `GAP_P0_06R1_TEST_SPEC.md`
- `tests/gap-p0-06r1/gapP006TestKit.ts`
- `tests/gap-p0-06r1/taskWorkspace.contract.test.tsx`

测试总量固定为单 suite、6 个 `it`，一项用户旅程对应一个 `it`，后续修复阶段不得修改测试内容。

## 2. 公共 UI 合同

视觉样式与内部组件结构不锁定；以下可访问名称是跨平台公共行为合同：

- 工作台标题：`任务工作台`
- 四象限任务卡按钮：`救火区任务：<标题>`、`成长区任务：<标题>`、`干扰区任务：<标题>`、`清理区任务：<标题>`
- 新建：`新建任务`、输入 `任务名称`、复选框 `重要` / `紧急`、`保存任务`
- 详情：标题文本 `任务详情：<标题>`；小步文本 `小步：<标题>`；积分文本至少明确 `总积分：<数字>`
- 编辑：`编辑任务`、输入 `编辑任务名称`、复选框 `编辑重要` / `编辑紧急`、`保存修改`；写入失败后错误码可见且出现 `重试保存修改`
- 删除：`删除任务`、确认提示 `确认删除“<标题>”？`、`取消删除`、`确认删除`
- 推荐：文本 `今日推荐：<标题>`，推荐卡按钮 `打开今日推荐：<标题>`，动作 `开始5分钟`
- 专注：状态文本 `计时状态：进行中`，并明确当前专注任务 `专注任务：<标题>`

实现可以用私有 Provider/context 向 CoreFlowScreen 提供工作台能力，但公共 `CoreFlowScreenProps`、`CoreAppService` 与领域对象合同不要求改变，测试也不会导入该私有实现。

## 3. 六个锁定旅程

### 3.1 冷启动四象限投影

用公开生命周期服务在同一 repository 中创建 Q1/Q2/Q3/Q4 各一项，并另建一项后完成、另一项后软删除。随后 byte restart 并渲染全新 AppRoot。

验收：四个活动任务分别仅以正确象限卡按钮出现；已完成和已软删除任务均不出现在四象限工作台，也不出现在今日推荐。这与现有 `projectTaskQuadrants` 只投影 pending/in_progress 且未删除任务的策略一致。

### 3.2 UI 新建并跨启动保持

从空 backend 渲染 AppRoot，通过 UI 新建标题、选择重要且不紧急并保存。

验收：任务立即以成长区卡出现；复制原始 backend 字节并创建全新 composition/AppRoot 后，仍只出现在成长区；重启不生成新 ID、不产生网络依赖。

### 3.3 任意卡片详情上下文隔离

公开服务准备两个活动任务及各自不同小步。依次点击两张卡。

验收：详情标题和小步始终对应最后点击的 task；切换后前一任务的小步不残留；总积分为同一 durable state 的真实汇总；专注区域不得把另一任务标成当前详情任务。此测试只锁任务上下文绑定，不重测 subtask/score/focus 的底层状态机。

### 3.4 编辑迁移、失败不假成功、显式重试

打开一项 Q1 任务，进入编辑，将标题修改并取消“重要”（应迁移到 Q3）。对下一次 backend set 注入一次失败。

验收：失败后旧标题仍在 Q1，新标题没有出现在 Q3，错误可见且编辑值保留，并提供显式重试；重试后仅有一次成功持久化，新标题移动到 Q3；byte restart 后结果保持。禁止乐观 UI 假成功。

### 3.5 删除确认/取消、软删除与推荐剔除

准备一项按现有推荐规则胜出的 Q1 任务和一项备选任务。打开胜出任务请求删除。

验收：出现包含标题的确认提示；取消不写 backend，任务与推荐均保留；再次请求并确认后恰有一次成功持久化，任务从工作台和今日推荐消失，推荐切换为备选；byte restart 后删除任务仍不可见。删除必须走现有软删除语义。

### 3.6 今日推荐进入既有 5 分钟专注并恢复

准备多个活动任务，使现有 `recommendNextTask` 规则给出唯一胜出项；渲染 AppRoot。

验收：UI 自动显示与既有规则一致的今日推荐；点击推荐卡打开同一任务详情，点击开始进入既有 5 分钟专注，状态为进行中且专注 taskId/标题不串项；复制 backend 字节并以未到期的显式时钟创建全新 AppRoot 后，仍恢复同一任务的运行中专注。此处只验证工作台到已验收专注链路的连接，不重测专注仓储协议。

## 4. 运行与判定

测试作者首跑只执行：

1. `tests/gap-p0-06r1`（预期：生产修复后 6 个锁定旅程全部通过）；
2. `tsc --noEmit`（预期 0）；
3. 最多一个直接控制：`tests/phase4/startFiveApp.contract.test.tsx`，仅在需要证明 AppRoot 基线未被测试资产破坏时运行。

不执行大回归、质量门、网络或原生构建。测试审查通过并签署最终锁后，生产修复 agent 必须在完全不改测试的前提下使 6/6 通过；之后只需新根、上述单一直接控制与独立代码审查。
