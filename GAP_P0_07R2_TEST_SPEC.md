# GAP-P0-07R2 测试规范：刷新失败与 durable 回执确认的一致边界

## 权威与范围

- 本受控修订钉住已接受的 GAP-P0-07 candidate self：`a3ff5d286480d4903f616233fd34de88e107a159a7e113cb7045a77a9f31d2a2`。
- 同时钉住已接受的 GAP-P0-07R1 candidate self：`7571d9810bae7df3d0fc1f08366695baf91dd8235e603ea04f5017adf0d63d22`。
- 只消解旧 GAP-P0-07 Test 3 的“刷新成功后完整 backend 字节仍等于结算字节”与 R1 durable receipt acknowledgement 的冲突；旧 Test 1、Test 2，以及 Test 3 在刷新失败阶段之前和之中的其余语义继续有效。
- 只新增一条 `createStartFiveApp(...).AppRoot` 公共 UI 旅程。不得修改旧 GAP-P0-07、GAP-P0-07R1 或生产文件。

## 唯一验收旅程

1. 创建一项可完成的 Q2 主任务和一项 pending Q4 后备任务；通过公共工作台与专注 UI 完成小步、提前结束专注，并显式选择“完成任务”，得到一次 45 分回执与“今日专注：1次 / 2分钟”。
2. 仅让下一次公共 KV read 失败，然后按“返回任务工作台”。同一回执必须继续可见，并显示“工作台刷新失败”和“重试刷新工作台”。失败阶段完整 backend 字节保持结算后字节，公共查询仍证明主任务只完成一次、后备任务仍 pending、总分仍为 45；结算、任务完成、积分与今日专注均不得重放。
3. 按公共刷新重试后，允许且要求 durable acknowledgement 写入成功：进入工作台，主任务从活动象限移除，后备任务成为今日推荐。删除旧 Test 3 中“成功后完整 backend 字节仍等于结算字节”的断言；改为锁定成功确认后的完整 `acknowledgedBytes`，并继续用公共查询证明主任务 completed、后备任务 pending、总分 45，且回执不再显示。
4. 仅复制 `acknowledgedBytes` 创建新 AppRoot。重启后必须直接进入工作台，不再出现同一复盘或回执；工作台通过与既有回执相同的公开标签和格式继续显示“今日专注：1次 / 2分钟”，证明 acknowledgement 与恢复没有重放今日统计；公共查询仍是同一终态，且只读恢复不得改动完整 backend 字节。

## 公共边界与禁令

- 只使用公共 `AsyncKeyValueBackend`、ISO clock、ID generator、结构化 focus runtime clock、公共 UI 与公共任务查询。
- 禁止识别或解析 storage key/envelope，禁止 raw set 次数断言，禁止跨仓瞬时原子性断言，禁止私有 Provider/context、sleep、fake timer 或 process listener。
- 候选固定为恰好 `1 it`，只运行本目录一次与 `tsc --noEmit`。

## Controlled supersession

旧 GAP-P0-07 Test 3 仅有以下 oracle 被受控替代：成功刷新并完成 durable acknowledgement 后，不再要求完整 backend 字节等于 `settledBytes`。替代 oracle 还要求 byte-only restart 后的公开工作台保留同一“今日专注：1次 / 2分钟”摘要。其余 Test 3 语义继续有效；Test 1 与 Test 2 完全不变。
