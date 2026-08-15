# GAP-P0-10 — 明日第一项提醒与通知回流 tests-first contract

## 范围

本切片只把 GAP-P0-09 已持久化的“明日第一项”接到可选通知能力，并锁定通知点击后的安全回流。继续使用现有 `reminderScheduling.ts` 的权限、代际、操作 ID、语义指纹、幂等替换与补偿语义；不得另造第二套提醒协调状态机。

`StartFiveAppDependencies` 可新增一个可选 `tomorrowFirstNotifications` 依赖。它实现现有 `ReminderScheduler`，并最小补充：

- `getPermission()` 与 `requestPermission()`；
- `getInitialTap()`；
- `subscribeTap(listener)`；
- 点击路由仅为 `{kind: 'tomorrow_first', dayKey, taskId}`。

未注入该依赖时，既有应用流程必须保持可用。项目当前没有原生通知包，本切片不安装依赖；生产实现可以先提供平台桥边界。

## 固定语义

- 用户确认明日第一项后，可显式选择“设置明日 08:00 提醒”。提醒拒绝不回滚、不遮挡、不清除收尾选择。
- `not_determined` 最多在同一应用会话触发一次权限请求；拒绝后的重复点击不得形成请求循环。
- 提醒规则 ID 同时是稳定逻辑通知 ID：`tomorrow-first:<closure-dayKey>`。提醒目标必须是收尾记录中的精确任务，触发时间是下一 UTC 日 `08:00:00.000Z`。
- 改选目标时取消旧目标并用同一稳定通知 ID 指向新目标；目标完成或软删除时取消。字节重启/hydration 对已收敛语义不得重复替换。
- 冷启动 `getInitialTap()` 与热启动 `subscribeTap` 都只导航到精确“明日第一项”卡片并重新校验记录与任务；绝不自动开始任务或专注。
- 点击目标失效或路由不再匹配持久化选择时，展示不可用与重新选择入口。不得静默改用当前推荐，更不得自动启动推荐任务。

## 公开契约（恰好三个 AppRoot/UI 测试）

1. 通过公开 GAP-P0-09 收尾流程选择 A，再设置提醒。权限从 `not_determined` 请求为 `denied`：A 的收尾选择仍然存在，UI 明确说明提醒未开启且不影响明日第一项；同会话再次尝试不重复弹权限请求。
2. `granted` 下为 A 创建稳定通知；改选 B 后取消 A 并以同一通知 ID 调度 B。字节重启/hydration 不产生重复逻辑替换。随后 B 完成会取消；再选择 C 并软删除 C 也会取消。
3. 冷启动点击与热启动点击都导航到精确 A 卡片，且 A 仍为 `pending`、没有专注 UI。删除 A 后再次点击同一路由，展示不可用/重新选择；推荐 B 仍为 `pending`，没有自动专注。

## 测试边界

测试只使用 `AppRoot`、可见 UI、公开任务服务、结构化时钟、字节重启和可选通知桥的逻辑调用。不得读取私有 React context、持久化 key/envelope、原始写次数，不使用 sleep、fake timer 或时序碰运气。

## Red-run policy

只运行 `tests/gap-p0-10` 一次，再运行 TypeScript 一次。预期合法红是缺少可选依赖接线或可见提醒/通知回流 UI；若先暴露 fixture 缺陷，修复 fixture 后仍只保留这一轮受控证据。不得运行旧回归、quality gate 或 native build。

## 冻结前序

- GAP-P0-09R2 candidate self：`7b41ee99671e44255f2e270e24f3c93310ac9dab7a2d0d0bde85a45181e00ba7`

## 三项候选记录

1. 新测试命令与结果：待单次隔离运行后填写。
2. TypeScript 结果：待单次运行后填写。
3. 最小生产缺口：待红证据后填写。
