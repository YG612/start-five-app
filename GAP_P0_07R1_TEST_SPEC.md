# GAP-P0-07R1 测试规范：回执确认失败可恢复

## 权威与边界

- 本增量钉住已接受的 GAP-P0-07 候选 self：`a3ff5d286480d4903f616233fd34de88e107a159a7e113cb7045a77a9f31d2a2`。
- 只新增一条 `createStartFiveApp(...).AppRoot` 公共 UI 旅程，不修改或重复 GAP-P0-07 的三条既有旅程。
- 只使用公开 `AsyncKeyValueBackend`、ISO clock、ID generator、结构化 focus runtime clock 与公开查询。
- 禁止识别 storage key、解析 envelope、统计 raw set 次数、访问私有 Provider/context、sleep、fake timer 或 process listener。

## 唯一验收旅程

1. 通过既有公开工作台和专注 UI 启动一项可完成的 Q2 任务，完成小步、提前结束专注，并显式选择“完成任务”取得 45 分回执。
2. 在回执页按“返回任务工作台”。工作台投影读取先成功；公开 KV 包装器只让随后的下一次 `setItem` 失败，以模拟 durable receipt acknowledgement 失败。
3. acknowledgement 失败后必须仍停留在同一“专注回执”，显示明确的“回执确认失败”和“重试确认并返回工作台”。既有回执仍显示本次 45 分及今日仅 1 次专注；公开任务查询仍只有一次完成、总分 45，且后备任务保持 pending，证明结算、回执事实与积分没有重放。
4. 按公开重试后，acknowledgement 成功并进入已经刷新过的任务工作台：已完成主任务不再位于活动象限，后备任务成为推荐，总分仍为 45。
5. 仅复制确认后的完整 backend 字节创建新 AppRoot。重启后直接进入任务工作台，不再出现“专注复盘”或同一“专注回执”；主任务仍只完成一次、总分仍为 45，且只读恢复不改变完整 backend 字节。

## 候选执行纪律

- 候选阶段仅运行本目录这 `1 it` 一次，以及 `tsc --noEmit`。
- 当前生产若没有 durable receipt acknowledgement，预期在第 3 步合法变红；fixture 错误则立即停止。
- 合法红后生成精确两条目的候选清单与 changelog，状态保持 `PENDING INDEPENDENT REVIEW / NO PRODUCTION AUTHORITY`。
