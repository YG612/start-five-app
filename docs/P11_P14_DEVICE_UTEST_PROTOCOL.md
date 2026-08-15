# P11–P14 DEVICE / UTEST Protocol

更新时间：2026-08-15（Asia/Shanghai）

| 场景 | 步骤 | 期望 | 匿名记录字段 | 通过标准 | 当前状态 |
| --- | --- | --- | --- | --- | --- |
| 冷启动 | 清除进程后启动 | 四象限和唯一主行动可见 | `home_primary_shown.durationMs/source/success` | 就绪后主行动 ≤100ms；无白屏 | PENDING_EXTERNAL |
| 唯一主行动 | 分别准备活动专注、继续任务、推荐任务、空任务 | 每个状态只有一个最高视觉等级按钮 | `home_primary_shown/source` | 主按钮数始终 ≤1 | PENDING_EXTERNAL |
| 快速记录 | 点“记下第一项”，只输入标题并保存 | 输入自动聚焦，任务保留 | `quick_capture_started/saved` | 中位数 ≤5s，p90 ≤8s | PENDING_EXTERNAL |
| 待判断 | 打开一项即将到期的待判断任务并回答两问 | 最多三次选择后进入正确象限 | `triage_started/completed` | 中位数 ≤15s | PENDING_EXTERNAL |
| 搜索 | 在 5000 项数据中搜索标题、第一小步和备注 | 结果可直接开始或编辑 | `search_opened/result_action` | p95 ≤100ms，再点击 ≤1 次 | PENDING_EXTERNAL |
| 完成恢复 | 从完成记录恢复并再次完成 | 任务恢复且不重复发成长值 | `search_result_action` | 重复奖励 0 | PENDING_EXTERNAL |
| 长任务计划 | 建立步骤和分段推进计划 | 60s 内保存，首页只突出最近行动 | `work_plan_created` | 中位数 ≤60s | PENDING_EXTERNAL |
| 通知 | 冷/热启动点“先做 5 分钟”、延后和重新安排 | 精确任务打开且不重复会话 | `notification_action` | 重复会话 0 | PENDING_EXTERNAL |
| 备份恢复 | 选择备份、查看预览、确认恢复 | 预览不写入；失败保持原数据 | `backup_previewed/restore_finished` | 预览写入 0；原数据完整 100% | PENDING_EXTERNAL |
| 最大字体 | 系统字体调到最大后走主行动、任务编辑、专注 | 可滚动，文字不截断关键操作 | 不记录内容 | 核心操作全部可达 | PENDING_EXTERNAL |
| TalkBack | 开启 TalkBack 后浏览清单、移动、开始和完成 | 不拖动也能完成核心路径 | 不记录内容 | 等价操作覆盖 100% | PENDING_EXTERNAL |

诊断限制：仅记录事件名、时间、会话 ID、来源、耗时、成功状态、错误码和匿名任务引用；不记录标题、备注、卡住答案或通知正文；内存最多保留最近 500 条。
