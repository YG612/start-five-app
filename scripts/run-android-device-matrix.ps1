[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$Serial,

    [string]$ApkPath,

    [string]$EvidenceRoot,

    [switch]$SkipInstall
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$appRoot = Split-Path -Parent $PSScriptRoot
if ([string]::IsNullOrWhiteSpace($ApkPath)) {
    $ApkPath = Join-Path $appRoot 'android\app\build\outputs\apk\internal\app-internal.apk'
}
$ApkPath = [System.IO.Path]::GetFullPath($ApkPath)

$safeSerial = $Serial -replace '[^A-Za-z0-9._-]', '_'
$runId = Get-Date -Format 'yyyyMMdd-HHmmss'
if ([string]::IsNullOrWhiteSpace($EvidenceRoot)) {
    $EvidenceRoot = Join-Path $appRoot "android\captures\r20-02\$runId-$safeSerial"
}
$EvidenceRoot = [System.IO.Path]::GetFullPath($EvidenceRoot)

$packageName = 'com.startfive.app.internal'
$widthsDp = @(320, 360, 412)
$fontScales = @(1.0, 1.3, 1.6, 2.0)
$themes = @('light', 'dark')
$motionModes = @('regular', 'reduced')

function Resolve-AdbPath {
    $command = Get-Command adb -ErrorAction SilentlyContinue
    if ($null -ne $command) {
        return $command.Source
    }

    $sdkRoots = @($env:ANDROID_SDK_ROOT, $env:ANDROID_HOME) |
        Where-Object { -not [string]::IsNullOrWhiteSpace($_) } |
        Select-Object -Unique
    foreach ($sdkRoot in $sdkRoots) {
        $candidate = Join-Path $sdkRoot 'platform-tools\adb.exe'
        if (Test-Path -LiteralPath $candidate -PathType Leaf) {
            return $candidate
        }
    }

    throw 'adb was not found. Put platform-tools on PATH or set ANDROID_SDK_ROOT/ANDROID_HOME.'
}

$adbPath = Resolve-AdbPath

function Invoke-Adb {
    param(
        [Parameter(Mandatory = $true)]
        [string[]]$Arguments,

        [switch]$AllowFailure
    )

    $output = @(& $adbPath @Arguments 2>&1)
    $exitCode = $LASTEXITCODE
    if (-not $AllowFailure -and $exitCode -ne 0) {
        throw "adb failed with exit code ${exitCode}: adb $($Arguments -join ' ')`n$($output -join [Environment]::NewLine)"
    }

    return [pscustomobject]@{
        ExitCode = $exitCode
        Output = $output
    }
}

function Invoke-DeviceShell {
    param(
        [Parameter(Mandatory = $true)]
        [string[]]$Arguments,

        [switch]$AllowFailure
    )

    return Invoke-Adb -Arguments (@('-s', $Serial, 'shell') + $Arguments) -AllowFailure:$AllowFailure
}

function Get-SettingValue {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Namespace,

        [Parameter(Mandatory = $true)]
        [string]$Name
    )

    $value = (Invoke-DeviceShell -Arguments @('settings', 'get', $Namespace, $Name)).Output -join ''
    return $value.Trim()
}

function Set-SettingValue {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Namespace,

        [Parameter(Mandatory = $true)]
        [string]$Name,

        [Parameter(Mandatory = $true)]
        [string]$Value
    )

    [void](Invoke-DeviceShell -Arguments @('settings', 'put', $Namespace, $Name, $Value))
}

function Write-Utf8Lines {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path,

        [Parameter(Mandatory = $true)]
        [object[]]$Lines
    )

    [System.IO.File]::WriteAllLines($Path, [string[]]$Lines, [System.Text.UTF8Encoding]::new($false))
}

if (-not (Test-Path -LiteralPath $ApkPath -PathType Leaf)) {
    throw "Internal APK not found: $ApkPath"
}

$deviceLines = (Invoke-Adb -Arguments @('devices')).Output
$escapedSerial = [Regex]::Escape($Serial)
$matchingLine = $deviceLines | Where-Object { $_ -match "^$escapedSerial\s+device$" }
if ($null -eq $matchingLine) {
    throw "Device '$Serial' is not online. Run adb devices -l and authorize USB debugging first."
}

New-Item -ItemType Directory -Path $EvidenceRoot -Force | Out-Null

$apk = Get-Item -LiteralPath $ApkPath
$apkHash = (Get-FileHash -LiteralPath $ApkPath -Algorithm SHA256).Hash.ToLowerInvariant()
$deviceModel = ((Invoke-DeviceShell -Arguments @('getprop', 'ro.product.model')).Output -join '').Trim()
$androidVersion = ((Invoke-DeviceShell -Arguments @('getprop', 'ro.build.version.release')).Output -join '').Trim()
$sdkVersion = ((Invoke-DeviceShell -Arguments @('getprop', 'ro.build.version.sdk')).Output -join '').Trim()
$sizeOutput = (Invoke-DeviceShell -Arguments @('wm', 'size')).Output -join [Environment]::NewLine
$densityOutput = (Invoke-DeviceShell -Arguments @('wm', 'density')).Output -join [Environment]::NewLine

$physicalSizeMatch = [Regex]::Match($sizeOutput, 'Physical size:\s*(\d+)x(\d+)')
if (-not $physicalSizeMatch.Success) {
    throw "Could not determine physical display size from: $sizeOutput"
}
$physicalWidthPx = [int]$physicalSizeMatch.Groups[1].Value

$originalDensityMatch = [Regex]::Match($densityOutput, 'Override density:\s*(\d+)')
$originalDensityOverride = if ($originalDensityMatch.Success) { $originalDensityMatch.Groups[1].Value } else { $null }
$originalFontScale = Get-SettingValue -Namespace 'system' -Name 'font_scale'
$originalWindowAnimation = Get-SettingValue -Namespace 'global' -Name 'window_animation_scale'
$originalTransitionAnimation = Get-SettingValue -Namespace 'global' -Name 'transition_animation_scale'
$originalAnimatorDuration = Get-SettingValue -Namespace 'global' -Name 'animator_duration_scale'
$nightOutput = (Invoke-DeviceShell -Arguments @('cmd', 'uimode', 'night')).Output -join [Environment]::NewLine
$nightMatch = [Regex]::Match($nightOutput, 'Night mode:\s*(yes|no|auto|custom)')
$originalNightMode = if ($nightMatch.Success) { $nightMatch.Groups[1].Value } else { 'auto' }

$environment = [ordered]@{
    runId = $runId
    serial = $Serial
    model = $deviceModel
    androidVersion = $androidVersion
    sdk = $sdkVersion
    adb = $adbPath
    apkPath = $ApkPath
    apkBytes = $apk.Length
    apkSha256 = $apkHash
    packageName = $packageName
    physicalSize = $sizeOutput
    originalDensity = $densityOutput
    originalFontScale = $originalFontScale
    originalNightMode = $originalNightMode
    originalAnimationScales = @{
        window = $originalWindowAnimation
        transition = $originalTransitionAnimation
        animator = $originalAnimatorDuration
    }
    evidenceType = 'AUTO_CAPTURE_NOT_MANUAL_ACCEPTANCE'
}
$environment | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $EvidenceRoot 'environment.json') -Encoding UTF8

if (-not $SkipInstall) {
    $install = Invoke-Adb -Arguments @('-s', $Serial, 'install', '-r', $ApkPath)
    Write-Utf8Lines -Path (Join-Path $EvidenceRoot 'install.txt') -Lines $install.Output
}

$packagePath = (Invoke-DeviceShell -Arguments @('pm', 'path', $packageName)).Output -join [Environment]::NewLine
if ($packagePath -notmatch '^package:') {
    throw "Package $packageName is not installed after the install step."
}

$activityLines = (Invoke-DeviceShell -Arguments @('cmd', 'package', 'resolve-activity', '--brief', $packageName)).Output
$activityCandidate = $activityLines | Where-Object { $_ -match '/' } | Select-Object -Last 1
if ($null -eq $activityCandidate -or [string]::IsNullOrWhiteSpace([string]$activityCandidate)) {
    throw "Could not resolve the launch activity for $packageName."
}
$activity = ([string]$activityCandidate).Trim()

$results = [System.Collections.Generic.List[object]]::new()

try {
    [void](Invoke-DeviceShell -Arguments @('input', 'keyevent', 'KEYCODE_WAKEUP') -AllowFailure)
    [void](Invoke-DeviceShell -Arguments @('wm', 'dismiss-keyguard') -AllowFailure)

    foreach ($widthDp in $widthsDp) {
        $densityDpi = [int][Math]::Round(($physicalWidthPx * 160.0) / $widthDp)
        [void](Invoke-DeviceShell -Arguments @('wm', 'density', [string]$densityDpi))

        foreach ($fontScale in $fontScales) {
            Set-SettingValue -Namespace 'system' -Name 'font_scale' -Value $fontScale.ToString('0.0', [Globalization.CultureInfo]::InvariantCulture)

            foreach ($theme in $themes) {
                $nightMode = if ($theme -eq 'dark') { 'yes' } else { 'no' }
                [void](Invoke-DeviceShell -Arguments @('cmd', 'uimode', 'night', $nightMode))

                foreach ($motionMode in $motionModes) {
                    $animationScale = if ($motionMode -eq 'reduced') { '0' } else { '1' }
                    Set-SettingValue -Namespace 'global' -Name 'window_animation_scale' -Value $animationScale
                    Set-SettingValue -Namespace 'global' -Name 'transition_animation_scale' -Value $animationScale
                    Set-SettingValue -Namespace 'global' -Name 'animator_duration_scale' -Value $animationScale

                    $caseId = "w${widthDp}-f$($fontScale.ToString('0.0', [Globalization.CultureInfo]::InvariantCulture).Replace('.', '_'))-$theme-$motionMode"
                    $caseRoot = Join-Path $EvidenceRoot $caseId
                    New-Item -ItemType Directory -Path $caseRoot -Force | Out-Null

                    [void](Invoke-Adb -Arguments @('-s', $Serial, 'logcat', '-c'))
                    [void](Invoke-DeviceShell -Arguments @('am', 'force-stop', $packageName))
                    $launch = Invoke-DeviceShell -Arguments @('am', 'start', '-W', '-n', $activity)
                    Write-Utf8Lines -Path (Join-Path $caseRoot 'launch.txt') -Lines $launch.Output

                    $remoteBase = "/sdcard/Download/start-five-r20-$caseId"
                    $dump = Invoke-DeviceShell -Arguments @('uiautomator', 'dump', "$remoteBase.xml") -AllowFailure
                    Write-Utf8Lines -Path (Join-Path $caseRoot 'uiautomator-command.txt') -Lines $dump.Output
                    if ($dump.ExitCode -eq 0) {
                        [void](Invoke-Adb -Arguments @('-s', $Serial, 'pull', "$remoteBase.xml", (Join-Path $caseRoot 'window.xml')))
                    }

                    [void](Invoke-DeviceShell -Arguments @('screencap', '-p', "$remoteBase.png"))
                    [void](Invoke-Adb -Arguments @('-s', $Serial, 'pull', "$remoteBase.png", (Join-Path $caseRoot 'screen.png')))
                    [void](Invoke-DeviceShell -Arguments @('rm', '-f', "$remoteBase.xml", "$remoteBase.png") -AllowFailure)

                    $activityDump = Invoke-DeviceShell -Arguments @('dumpsys', 'activity', 'activities')
                    Write-Utf8Lines -Path (Join-Path $caseRoot 'activity.txt') -Lines $activityDump.Output
                    $logcat = Invoke-Adb -Arguments @('-s', $Serial, 'logcat', '-d', '-t', '500')
                    Write-Utf8Lines -Path (Join-Path $caseRoot 'logcat.txt') -Lines $logcat.Output

                    $launchText = $launch.Output -join [Environment]::NewLine
                    $activityText = $activityDump.Output -join [Environment]::NewLine
                    $logcatText = $logcat.Output -join [Environment]::NewLine
                    $hasFatal = $logcatText -match 'FATAL EXCEPTION|Fatal signal|ReactNativeJS:\s*Error'
                    $isForeground = $activityText -match [Regex]::Escape($packageName)
                    $hasScreenshot = Test-Path -LiteralPath (Join-Path $caseRoot 'screen.png') -PathType Leaf
                    $hasUiDump = Test-Path -LiteralPath (Join-Path $caseRoot 'window.xml') -PathType Leaf
                    $status = if ($launchText -match 'Status:\s*ok' -and $isForeground -and -not $hasFatal -and $hasScreenshot -and $hasUiDump) {
                        'PASS_AUTO_CAPTURE'
                    }
                    else {
                        'FAIL_AUTO_CAPTURE'
                    }

                    $results.Add([pscustomobject]@{
                        Case = $caseId
                        WidthDp = $widthDp
                        DensityDpi = $densityDpi
                        FontScale = $fontScale
                        Theme = $theme
                        Motion = $motionMode
                        Status = $status
                        FatalLog = $hasFatal
                        Foreground = $isForeground
                        Screenshot = $hasScreenshot
                        UiDump = $hasUiDump
                        Evidence = $caseRoot
                    })
                }
            }
        }
    }
}
finally {
    if ($null -eq $originalDensityOverride) {
        [void](Invoke-DeviceShell -Arguments @('wm', 'density', 'reset') -AllowFailure)
    }
    else {
        [void](Invoke-DeviceShell -Arguments @('wm', 'density', $originalDensityOverride) -AllowFailure)
    }
    [void](Invoke-DeviceShell -Arguments @('settings', 'put', 'system', 'font_scale', $originalFontScale) -AllowFailure)
    [void](Invoke-DeviceShell -Arguments @('cmd', 'uimode', 'night', $originalNightMode) -AllowFailure)
    [void](Invoke-DeviceShell -Arguments @('settings', 'put', 'global', 'window_animation_scale', $originalWindowAnimation) -AllowFailure)
    [void](Invoke-DeviceShell -Arguments @('settings', 'put', 'global', 'transition_animation_scale', $originalTransitionAnimation) -AllowFailure)
    [void](Invoke-DeviceShell -Arguments @('settings', 'put', 'global', 'animator_duration_scale', $originalAnimatorDuration) -AllowFailure)
}

$results | Export-Csv -LiteralPath (Join-Path $EvidenceRoot 'matrix-results.csv') -NoTypeInformation -Encoding UTF8
$summary = [ordered]@{
    total = $results.Count
    passed = @($results | Where-Object Status -eq 'PASS_AUTO_CAPTURE').Count
    failed = @($results | Where-Object Status -eq 'FAIL_AUTO_CAPTURE').Count
    manualAcceptanceStillRequired = $true
    evidenceRoot = $EvidenceRoot
}
$summary | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $EvidenceRoot 'summary.json') -Encoding UTF8

Write-Output "R20-02 automatic capture complete: $($summary.passed)/$($summary.total) configurations passed automatic launch evidence."
Write-Output "Evidence: $EvidenceRoot"
Write-Output 'This result does not replace manual Sheet, drag, TalkBack, notification, restart or first-user acceptance.'

if ($summary.failed -gt 0) {
    exit 1
}
