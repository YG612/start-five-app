# P19 全局交互可靠性与发布收口审计

更新时间：2026-08-21（Asia/Shanghai）

## 结论

- P18 基线：`9c28add feat: complete P18 settings reliability gate` 已存在；其后 `b560fa7`、`f17ca11` 已完成 P15R-04B 持续任务布局模式源码与自动测试。
- 本轮从真实源码清点出 P0 `2` 项、P1 `6` 项、P2 `2` 项。
- P0/P1 已完成源码修复和 P19 定点自动测试；Android / iOS 真机与首次用户测试仍为 `PENDING_EXTERNAL`，不得标记 `RELEASE_READY`。
- P2 只集中记录，未在本轮扩展为视觉重设计。

## 共同根因

1. 临时界面类型没有完全收口：专注结束/回执仍使用绝对定位遮罩，无法继承公共 Sheet 的返回、遮罩、下拉、键盘与焦点契约。
2. `AppBottomSheet` 只在把手上处理手势，不知道内部 `ScrollView` / `SectionList` 的偏移；真机上容易出现滚动与下拉关闭互相争抢。
3. 关闭策略由业务页面自行决定，长期任务、快速记录、日程和复盘备注缺少统一的脏状态确认。
4. 创建/编辑草稿只在 React 内存中，进程被终止后没有恢复路径。
5. Android 返回只在四象限布局组件和 RN `Modal` 内局部注册，全屏二级页面缺少页面级回退。
6. 专注汇总使用 UTC 日期片段且对不足一分钟显示为 `0 分钟`，会造成跨时区归日错误和“2 次 / 0 分钟”的误解。

## 问题清单

| ID | 级别 | 原始问题 | 修复 / 状态 |
| --- | --- | --- | --- |
| P19-P0-01 | P0 | 创建或编辑任务后进后台并被杀，未提交输入会丢失 | 新增 version 1、30 天 TTL 的本地草稿存储；坏草稿隔离；250ms 节流写入；提交/放弃后删除；重启自动恢复；`DONE_AUTO` |
| P19-P0-02 | P0 | 快速记录、长期计划、专注日程、复盘备注可通过间接关闭静默丢失 | 公共 `confirmDirty` / `flushBeforeClose` 策略；脏状态必须继续编辑或明确放弃；`DONE_AUTO` |
| P19-P1-01 | P1 | 专注结束和回执是自定义绝对定位遮罩，不支持统一退出 | 两种状态均迁移到 `AppBottomSheet`；回执关闭先刷新并确认；`DONE_AUTO` |
| P19-P1-02 | P1 | Sheet 内滚动与下拉关闭没有边界协作 | 协调 `ScrollView` / `SectionList` 偏移：未到顶部优先滚动，到顶部继续下拉才拖动 Sheet；`DONE_AUTO` |
| P19-P1-03 | P1 | 遮罩、返回、按钮和滑动可能触发不同关闭路径 | 单一关闭原因与 in-flight 去重；键盘先收起；阈值未达回弹；监听/动画卸载清理；`DONE_AUTO` |
| P19-P1-04 | P1 | 历史、今日回顾、备份等全屏二级页缺少 Android 页面返回 | 根页面增加单层返回优先级；Sheet 仍由 RN `Modal.onRequestClose` 优先处理；布局模式由地图监听优先退出；`DONE_AUTO` |
| P19-P1-05 | P1 | 专注统计按 UTC 归日，跨时区可能显示到错误日期 | 结算、今日汇总、今日回顾和历史入口统一使用显式 IANA 时区；非法时区安全回退 UTC；`DONE_AUTO` |
| P19-P1-06 | P1 | 短会话可能显示“2 次 / 0 分钟”；复盘四个动作视觉等权 | 不足一分钟明确显示；确认结算为主操作，继续/稍后继续降级；`DONE_AUTO` |
| P19-P2-01 | P2 | 320dp + 最大字体下的局部间距仍需要真机逐页微调 | 集中保留，等待 DEVICE 证据，不阻断源码阶段 |
| P19-P2-02 | P2 | Sheet 回弹、奖励条和 Snackbar 动效节奏仍可统一优化 | 集中保留；减少动态已停用非必要循环和缩短 Sheet 动效 |

## 界面清点

说明：所有 DEVICE 项目前均为 `PENDING_EXTERNAL`。自动测试列只写当前真实覆盖，不把源码检查当真机通过。

| UI ID / 真实组件 | 入口与类型 | 退出 / Android 返回 | 滚动、键盘、未保存状态 | 遮罩 / 下拉 / 页面或后台行为 | 无障碍与自动测试 | 级别 |
| --- | --- | --- | --- | --- | --- | --- |
| MAIN-Q / `QuadrantHomeScreen` 象限页 | 底部“象限”；主页面 | 非布局态交给系统；布局态首次返回只退出布局 | 页面滚动；任务地图拖动时禁用父滚动 | 切页/后台退出布局；地图提交失败回滚并刷新 repository | 完整任务、象限、状态 label；非手势移动 action；P15R-04B | 已确认 |
| MAIN-F / 同组件专注页 | 底部“专注”；主页面 | 返回象限页；活动专注不被 Sheet 返回误结束 | 页面滚动；无常驻键盘 | 后台按 session 恢复；持续通知由 runtime 协调 | 活动状态非每秒播报；P16 | 已确认 |
| MAIN-G / 同组件成长页 | 底部“成长”；主页面 | 返回象限页 | 页面滚动；最近记录展开 | 切页保留持久化数据，展开态可重置 | 语义化指标；P17 | 已确认 |
| MAIN-M / 同组件我的页 | 底部“我的”；主页面 | 返回象限页 | 页面滚动；设置 Sheet 可能有输入 | Sheet 打开时底部导航不渲染且 `Modal` 截断下层点击 | SettingsRow 角色/状态；P18 | 已确认 |
| PAGE-HISTORY / `FocusHistoryScreen` | 我的/专注“最近专注”；全屏二级页 | 可见“回到象限”；Android 返回关闭一层 | `ScrollView`；无键盘；只读 | 失焦/卸载终止旧查询 generation | Header、记录按钮；既有 reload race 测试 | P1 已修 |
| PAGE-CLOSURE / `DayClosureScreen` | “今日回顾”；全屏二级页 | 可见“回到象限”；Android 返回关闭一层 | `ScrollView`；提醒时间键盘；选择/提醒写入 | 卸载忽略异步结果；通知拒绝保留可理解状态 | 输入与错误 label；day closure/通知契约 | P1 已修 |
| PAGE-BACKUP / `LocalBackupScreen` | 我的“数据与备份”；全屏二级页 | 可见“回到象限”；Android 返回关闭一层 | `ScrollView`；无键盘；导入预览 | 恢复需二次确认；失败原子回滚；pending 防连点 | 按钮禁用状态；P18 与备份契约 | 已确认 |
| SHEET-TASK / `TaskEditor` | 添加、任务卡、通知；Bottom Sheet | 把手、下拉、遮罩、关闭、Android 返回 | 协调滚动；多个键盘字段；创建/编辑草稿 | `flushBeforeClose`；空草稿关闭；非空创建关闭落正式任务；进程杀死由草稿恢复 | 打开聚焦标题；关闭可回焦 API；P15R + P19 restart | P0 已修 |
| SHEET-ORGANIZER / `TaskOrganizerSheet` | 查找、待判断、完成、积压；Bottom Sheet | 公共关闭契约 | `ScrollView` / `SectionList`；快速记录键盘；标题脏状态 | 脏快速记录明确确认；业务写入 pending 防重复 | 标签、按钮、状态；P19 Sheet 契约 | P0/P1 已修 |
| SHEET-PROGRESS / `TaskProgressSheet` | 任务“长期任务计划”；Bottom Sheet | 公共关闭契约 | 长滚动、多行键盘；标准/步骤/计划草稿 | 已保存基线单独记录；未保存修改确认；失败保留输入 | 表单 label、错误 live region；P19 | P0/P1 已修 |
| SHEET-SCHEDULE / `QuadrantHomeScreen` 日程编辑 | 专注页、任务、成长建议；Bottom Sheet | 公共关闭契约 | 协调滚动；时间键盘；完整日程草稿 | pending 时禁止业务关闭；修改后关闭确认；暂停/删除幂等服务 | 分段控件 selected；P16/P18/P19 | P0/P1 已修 |
| SHEET-FOCUS-EXIT / 根页面 | 活动专注“提前结束”；Bottom Sheet | 公共关闭契约 | 无滚动/键盘/草稿 | 关闭不结束会话；选择理由才提交 | 清晰按钮名称；P16/P19 | 已确认 |
| SHEET-PHONE-CONFIRM / 根页面 | “只是想刷手机”；Bottom Sheet / 确认 | 公共关闭取消；确认或继续 | 无滚动/键盘 | 关闭即取消；一次只处理本层 | 明确主次操作 | 已确认 |
| SHEET-LOW-ENERGY / 根页面 | “今天状态不好”；Bottom Sheet | 公共关闭契约 | 无键盘 | 设置只影响当天；不改任务/成长值 | 按钮 label；P9/P19 | 已确认 |
| SHEET-SETTINGS / 根页面 | 我的页 18 个设置入口；Bottom Sheet | 公共关闭契约 | 删除确认含键盘；其余短内容 | 危险操作需精确文本；遮罩仅取消；pending 防重复 | switch/tab/输入状态；P18/P19 | 已确认 |
| SHEET-REVIEW / `PostFocusReviewScreen` pending | 专注终止自动打开；Bottom Sheet | 把手、下拉、遮罩、关闭、Android 返回 | 协调滚动；备注键盘；outcome/note 脏状态 | 脏状态确认；间接关闭结算为“稍后继续”；结算服务单飞幂等 | radio 状态、主次动作；P19 | P1 已修 |
| SHEET-RECEIPT / `PostFocusReviewScreen` receipt | 结算完成自动切换；Bottom Sheet | 公共关闭；关闭先刷新、ack，再返回 | 协调滚动；无键盘 | 刷新/ack 失败不清除 durable receipt，可重试 | live error、回到象限；既有 service 契约 + P19 | P1 已修 |
| DIALOG-DIRTY / RN `Alert` | 公共 Sheet `confirmDirty` | 继续编辑 / 放弃修改；系统返回等价取消 | 无滚动；无键盘 | 只在明确放弃后调用业务关闭一次 | 原生对话框语义；P19 定点 | P0 已修 |
| DIALOG-DELETE / `TaskEditor` 内联确认 | 任务更多操作 | 取消 / 删除 | 无键盘 | 删除单飞；失败不关闭 Sheet | 明确危险按钮 | 已确认 |
| DIALOG-RESTORE / `LocalBackupScreen` 内联确认 | 导入预览后 | 取消 / 确认替换 | 无键盘 | 先完整校验再原子替换；失败回滚 | 明确警告与按钮 | 已确认 |
| DIALOG-CLEAR / settings delete-data | 我的“删除全部数据” | 关闭 Sheet 取消；精确文本后确认 | 键盘；确认文本 | pending 防重复；可先备份；不提供合并 | 输入 label、disabled 状态；P18 | 已确认 |
| OVERLAY-LAYOUT / `QuadrantTaskMap` | 任务长按 1000ms | 外部点击、返回、切页、后台 | 父滚动在拖动时关闭 | 单一持续布局状态机；同手势/二次触碰；失败回滚 | selected、完整 label、四象限移动 actions | P15R-04B DONE_AUTO |
| OVERLAY-FEEDBACK / reward、undo、error、tips | 写入结果或用户主动帮助 | 可见关闭/撤销；非阻断提示自动消失 | 无键盘 | pointerEvents 不形成透明死层；Sheet 打开时由 Modal 覆盖 | live region；DEVICE 待验 | P2 |
| SYS-NOTIFICATION / native notification bridge | 点击、开始、延后、跳过 | 进入正确任务/日程 | 无键盘 | durable event key 去重；前后台/终止恢复 | DEVICE `PENDING_EXTERNAL`；P16 自动测试 | 已确认源码 |
| SYS-APPSTATE / focus、draft、layout runtime | 前后台与进程恢复 | 非 UI | 草稿节流持久化；session/layout 恢复 | 监听卸载；本地日期重新计算 | P19 restart + 既有 focus tests | P0/P1 已修 |

## 返回优先级

```text
系统键盘
→ RN 原生确认框
→ 最上层 AppBottomSheet（Modal.onRequestClose）
→ QuadrantTaskMap 持续布局模式
→ 历史 / 今日回顾 / 备份全屏二级页
→ 非象限主页面回到象限
→ Android 系统 / App
```

一次返回只由最上层处理；Sheet 为原生 `Modal`，打开时底部导航不渲染且下层页面不能接收点击。

## 架构风险统计

- `src/screens/QuadrantHomeScreen.tsx`：`5615` 行。
- `React.useState`：`73` 处；`React.useEffect`：`25` 处；直接订阅/监听入口：`6` 处。
- 根页面直接组合的 Sheet 引用：`10` 处；反馈/提示 overlay 样式引用：`6` 处。
- 职责：四个主页面、任务编辑协调、布局提交、专注日程、专注入口、成长展示、设置、通知入口、备份入口和顶层 overlay 协调。
- 直接依赖任务、专注、成长、设置、通知、备份 application/data/domain 层。
- 本轮只抽取共享 Sheet 状态机、草稿存储、本地日期和汇总展示；未为缩短文件机械拆分，也未引入新全局状态框架。

## 自动测试证据

- P19 定点：4 suites、7/7 tests PASS。
- P15R–P19 相关回归：19 suites、61/61 tests PASS；加上两个原生入口/构建契约后为 21 suites、70/70 tests PASS。
- TypeScript strict：PASS；Android `:app:lintInternal`、`:app:assembleInternal`：PASS。
- internal APK：包名 `com.startfive.app.internal`，20,246,659 bytes；SHA-256 `f8ad0dc4a5b507212494dd4ba1649cdbfbe47b2385f1c9c66af45dc32a9a48d9`。
- Windows CRLF 导致的 V2 bootstrap SHA 误拦截已通过 `.gitattributes` 收口，未改测试内容或哈希。全量门禁现可运行全部 839 项：59/77 suites、807/839 tests PASS；18 suites、32 tests 为历史 P0–P4 精确 API/存储契约及过期 lock inventory 失败，仍是独立发布阻断。
- 覆盖：关闭防重复、滚动边界决策、距离/速度阈值、脏表单确认、键盘关闭、进程重启草稿恢复、坏草稿隔离/过期、本地日期、短时汇总口径，以及既有任务布局、日程、成长、设置和备份回归。
- Android OnePlus 9R 已安装独立 internal 包并通过冷启动、前台 Activity、语义树、无致命日志、任务 Sheet 返回和内容区下拉关闭自动冒烟；旧正式包和数据未被触碰。TalkBack / VoiceOver、最大字体、多尺寸、完整滚动衔接、通知动作和首次用户测试：`PENDING_EXTERNAL`。

## P2 集中记录

1. 320dp + 最大系统字体的局部卡片间距与换行，需要按 `docs/P19_DEVICE_UTEST_ACCEPTANCE.md` 真机逐页记录后再定点微调。
2. Sheet 回弹、奖励提示和 Snackbar 的动效节奏可继续统一；不应在没有真机证据时扩展为全量动效重做。
