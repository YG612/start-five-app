# GAP-P0-08R2 测试规范：历史读取竞态与离页安全

## 权威与范围

- 本受控增量钉住已接受的 GAP-P0-08R1 candidate self：
  `8e066a4bab0d505b7d1b46ce443d385390dc8ca358b0e69508572a8840afb24a`。
- 只新增一个 `FocusHistoryScreen` 公共 UI 契约测试；既有测试、测试工具和生产文件均不得修改。
- 测试仅经页面公开的 `day`、`history.listReceiptHistory()` 与 `onBack()` props 驱动，不接触 AppRoot 闭包、Provider/context、repository、storage key 或 envelope。

## 唯一验收旅程

1. 首次公共历史查询保持 pending；用户按“重新读取”后必须立即发起第二次查询，第二次查询先返回一条新的已确认回执。
2. 页面显示新回执后，较早的首次查询以 `OLD_HISTORY_QUERY_FAILED` 失败。旧失败不得重新显示错误、清空或覆盖新结果。
3. 再次按“重新读取”发起第三次 pending 查询，保存并按公开“返回任务工作台”按钮，使 wrapper 卸载历史页面。
4. 离页后释放第三次查询为旧快照；页面不得重新抢占工作台，也不得产生 `console.error`。

## 确定性与禁项

- deferred Promise 由测试直接控制，不使用 sleep、fake timer、process listener 或网络。
- 禁止识别持久化 key/envelope，禁止原始读写次数断言，禁止私有 Provider/context。
- 只运行本文件一次与 `tsc --noEmit`；不运行宽测、quality gate、registry、native build 或 package。

