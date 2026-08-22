# R20-02 Android 完整设备矩阵进度

更新时间：2026-08-22（Asia/Shanghai）
启动 HEAD：`292591f3e655c52bf010e929e376694316534a3f`
本次续跑 HEAD：`ad6aaacc756f65350f600ade1ac9b3803dfefe0e`
状态：`IN_PROGRESS / AUTO_EMULATOR_PASS / MANUAL_DEVICE_IN_PROGRESS`

## 当前环境实测

| 项目 | 真实结果 |
| --- | --- |
| 续跑前工作区 | 干净；`main` 与 `origin/main` 同步于 `ad6aaac` |
| ADB | `1.0.41` / platform-tools `35.0.2-12147458` |
| SDK | `D:/Android_SDK` |
| 自动采集设备 | `emulator-5554`；Android 16 / API 36 / `sdk_gphone64_x86_64` |
| Emulator / AVD | WHPX 可用；新增专用 AVD `start-five-r20-02-api36` |
| D 盘续跑前可用空间 | `44,006,617,088 bytes` |
| 默认真机 APK | `android/app/build/outputs/apk/internal/app-internal.apk`；arm64-v8a；`20,294,875 bytes`；SHA-256 `5e84b1ca3ee090d83a3f58e124ec61e6b58d0b8bde6735e58a5b23161b50f7a6` |
| 模拟器证据 APK | `android/captures/r20-02/20260822-151835-emulator-5554/app-internal-x86_64.apk`；`20,621,922 bytes`；SHA-256 `b3a8ea9145d43bb1d20f2cd4a7c0f703b614faea9b2eb96f5033fc46e127e968` |

本次使用本机已有 Android 36 x86_64 系统镜像创建专用 AVD，并完成 48/48 自动启动证据采集。该结果证明当前 x86_64 internal APK 在模拟器的尺寸、字体、主题和动效组合下可启动并形成语义树，不替代 arm64 真机触摸、TalkBack、通知、后台、杀进程或系统重启证据。

## 已落地的执行工具

| 路径 | 状态 | 职责 |
| --- | --- | --- |
| `scripts/run-android-device-matrix.ps1` | DONE_AUTO | 显式 serial；`adb install -r`；48 组矩阵；Android 16 夜间模式读取回退；ADB 单命令超时/清理；启动后 1500ms 稳定窗口；结束恢复设置 |
| `tests/r20-device-matrix/deviceMatrixScript.contract.test.ts` | PASS | 锁定显式设备、禁止卸载/清除、48 组矩阵、证据边界、设置恢复、Android 16 兼容和 ADB 超时 |
| `android/captures/r20-02/20260822-151835-emulator-5554/` | PASS_AUTO_CAPTURE | 48 份 screenshot、48 份 UI XML、48 份 launch/activity/logcat，另含 environment、install、CSV、summary 和 x86_64 APK；目录由 captures 忽略规则排除 Git |

工具只生成 `AUTO_CAPTURE_NOT_MANUAL_ACCEPTANCE` 证据。它不会把首页启动截图替代 Bottom Sheet、拖动、TalkBack、通知、系统重启或首次用户观察。

## 本轮测试结果

| 检查 | 结果 |
| --- | --- |
| PowerShell AST 解析 | PASS |
| 设备矩阵脚本契约 | 1 suite、6/6 tests PASS |
| runner + native-scaffold 聚合回归 | 7/7 suites、36/36 tests PASS |
| TypeScript | `tsc --noEmit` PASS |
| 不存在 serial 的 fail-closed 入口 | PASS；在安装和设备设置修改前返回 `Device ... is not online` |
| Android 16 模拟器 48 组自动采集 | 48/48 `PASS_AUTO_CAPTURE`；0 fatal；设备设置已恢复 |
| 专注启动、日程保存、恢复与无第一小步结束修复 | P10 + P16 聚合回归 11 suites、48/48 tests PASS；TypeScript PASS；arm64 APK 构建、覆盖安装、真机 5 分钟计时启动及“今天 20:30”日程保存 PASS |

## 当前门禁状态

| 验收范围 | 状态 | 证据边界 |
| --- | --- | --- |
| 新 APK 安装与冷启动 | `PASS_AUTO_EMULATOR / PASS_AUTO_PHYSICAL` | x86_64 APK 在 Android 16 模拟器通过；当前 arm64 APK 在 OnePlus 9R `adb install -r` 及前台启动通过，0 fatal/ANR |
| 48 组尺寸/字体/主题/动效自动采集 | `PASS_AUTO_EMULATOR` | `20260822-151835-emulator-5554` 为最终稳定证据；48/48、0 fatal |
| 所有 Sheet 人工手势与脏状态 | `USER_REPORTED_PASS` | OnePlus 9R 第一轮核心闭环；详见 `20260822-manual-oneplus9r/manual-observations.md` |
| 四象限两阶段拖动与滚动竞争 | `USER_REPORTED_PASS` | OnePlus 9R 第一轮核心闭环；详见 `20260822-manual-oneplus9r/manual-observations.md` |
| 无真实步骤任务的专注结束 | `FIX_INSTALLED / PENDING_USER_RETEST` | 原因为 fallback 文案错调 `completeFirstStep(null)`；修复版已覆盖安装 |
| 安排一段专注 | `USER_REPORTED_PASS / PASS_AUTO_PHYSICAL` | 修复通知快照 ID 混用、后置提醒失败误报及“今天”被解析到明天；OnePlus 9R 显示 `20:30 · 5 分钟`，系统 Alarm 为当日 `12:30Z`，0 fatal/ANR；用户已确认通过 |
| TalkBack、通知、后台、杀进程、系统重启 | `PENDING_DEVICE` | 需要已授权 Android 设备 |
| 首次用户测试 | `PENDING_EXTERNAL_USERS` | 需要至少 5 名未读说明的目标用户 |

R20-02 尚未达到 PASS，不进入 R20-03。

## 设备到位后的唯一启动入口

```powershell
$env:ANDROID_SDK_ROOT = 'D:\Android_SDK'
& $env:ANDROID_SDK_ROOT\platform-tools\adb.exe devices -l
powershell -ExecutionPolicy Bypass -File .\scripts\run-android-device-matrix.ps1 -Serial '<online-serial>'
```

运行结束后先审核 `matrix-results.csv` 与每组截图/UI XML，再按 `docs/P19_DEVICE_UTEST_ACCEPTANCE.md` 逐项补充人工触摸、TalkBack、通知和重启证据。
