# R20-02 Android 完整设备矩阵进度

更新时间：2026-08-22（Asia/Shanghai）
启动 HEAD：`292591f3e655c52bf010e929e376694316534a3f`
状态：`IN_PROGRESS / PENDING_DEVICE`

## 当前环境实测

| 项目 | 真实结果 |
| --- | --- |
| 启动工作区 | 干净；`main` 比 `origin/main` 领先 1 个本地提交 |
| ADB | `1.0.41` / platform-tools `37.0.0-14910828` |
| SDK | `D:/CodexData/Android/Sdk` |
| `adb devices -l` | 0 台设备；无 online/offline/unauthorized 设备记录 |
| Emulator | SDK 中不存在 `emulator/emulator.exe` |
| AVD | 本机没有已有 AVD |
| D 盘可用空间 | `12,616,351,744 bytes` |
| 本轮 APK | `android/app/build/outputs/apk/internal/app-internal.apk`；`20,294,203 bytes`；SHA-256 `611cda1c846869a1a257f7c44b11ce67aa2d3d5dc235fe0b055c90241a2ef2df` |

未在只有约 12.6 GB 可用空间的环境中自动下载 Emulator 与系统镜像；本轮没有设备，因此没有新增安装、截图、录屏、触摸、TalkBack、通知或重启通过声明。

## 已落地的执行工具

| 路径 | 状态 | 职责 |
| --- | --- | --- |
| `scripts/run-android-device-matrix.ps1` | DONE_AUTO | 需要显式 serial；使用 `adb install -r` 保留数据；依次采集 320/360/412dp × fontScale 1.0/1.3/1.6/2.0 × light/dark × regular/reduced 共 48 组启动证据 |
| `tests/r20-device-matrix/deviceMatrixScript.contract.test.ts` | PASS | 锁定显式设备、禁止卸载/清除、48 组矩阵、证据边界和设置恢复 |
| `android/captures/r20-02/<run>-<serial>/` | PENDING_DEVICE | 运行后保存 environment、install、CSV、summary，以及每组 screenshot、UI XML、launch、activity、logcat；该目录已由 Android captures 忽略规则排除 Git |

工具只生成 `AUTO_CAPTURE_NOT_MANUAL_ACCEPTANCE` 证据。它不会把首页启动截图替代 Bottom Sheet、拖动、TalkBack、通知、系统重启或首次用户观察。

## 本轮测试结果

| 检查 | 结果 |
| --- | --- |
| PowerShell AST 解析 | PASS |
| 设备矩阵脚本契约 | 1 suite、4/4 tests PASS |
| runner + native-scaffold 聚合回归 | 7/7 suites、34/34 tests PASS |
| TypeScript | `tsc --noEmit` PASS |
| 不存在 serial 的 fail-closed 入口 | PASS；在安装和设备设置修改前返回 `Device ... is not online` |
| 实际 48 组设备采集 | `PENDING_DEVICE` |

## 当前门禁状态

| 验收范围 | 状态 | 证据边界 |
| --- | --- | --- |
| 新 APK 安装与冷启动 | `PENDING_DEVICE` | 2026-08-21 OnePlus 9R 旧 APK 证据保留，但未替代本轮 APK |
| 48 组尺寸/字体/主题/动效自动采集 | `PENDING_DEVICE` | runner 已就绪，尚无设备输出目录 |
| 所有 Sheet 人工手势与脏状态 | `PENDING_DEVICE` | 不能由脚本静态测试替代 |
| 四象限两阶段拖动与滚动竞争 | `PENDING_DEVICE` | 不能由 React Test Renderer 替代真实触摸 |
| TalkBack、通知、后台、杀进程、系统重启 | `PENDING_DEVICE` | 需要已授权 Android 设备 |
| 首次用户测试 | `PENDING_EXTERNAL_USERS` | 需要至少 5 名未读说明的目标用户 |

R20-02 尚未达到 PASS，不进入 R20-03。

## 设备到位后的唯一启动入口

```powershell
$env:ANDROID_SDK_ROOT = 'D:\CodexData\Android\Sdk'
& $env:ANDROID_SDK_ROOT\platform-tools\adb.exe devices -l
powershell -ExecutionPolicy Bypass -File .\scripts\run-android-device-matrix.ps1 -Serial '<online-serial>'
```

运行结束后先审核 `matrix-results.csv` 与每组截图/UI XML，再按 `docs/P19_DEVICE_UTEST_ACCEPTANCE.md` 逐项补充人工触摸、TalkBack、通知和重启证据。
