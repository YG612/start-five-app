[CmdletBinding()]
param(
    [ValidateSet('arm64-v8a', 'armeabi-v7a', 'x86', 'x86_64')]
    [string]$Architecture = 'arm64-v8a',

    [string]$CxxStaging = "${env:SystemDrive}\sf-cxx"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$appRoot = Split-Path -Parent $PSScriptRoot
$androidRoot = Join-Path $appRoot 'android'
$gradleWrapper = Join-Path $androidRoot 'gradlew.bat'
$nodeModules = Join-Path $appRoot 'node_modules'
$apkPath = Join-Path $androidRoot 'app\build\outputs\apk\internal\app-internal.apk'

if (-not (Test-Path -LiteralPath $gradleWrapper -PathType Leaf)) {
    throw "Gradle wrapper not found: $gradleWrapper"
}
if (-not (Test-Path -LiteralPath $nodeModules -PathType Container)) {
    throw 'node_modules is missing. Install the locked pnpm dependencies first.'
}

$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
if ($null -eq $nodeCommand) {
    throw 'Node.js 20 or newer must be available on PATH.'
}
$nodeMajor = [int](& $nodeCommand.Source -p 'process.versions.node.split(String.fromCharCode(46))[0]')
if ($LASTEXITCODE -ne 0 -or $nodeMajor -lt 20) {
    throw 'Node.js 20 or newer must be available on PATH.'
}

$hermesCandidates = @(
    Get-ChildItem -Path (Join-Path $nodeModules '.pnpm\hermes-compiler@*\node_modules\hermes-compiler\hermesc\win64-bin\hermesc.exe') -File -ErrorAction SilentlyContinue
)
if ($hermesCandidates.Count -eq 0) {
    throw 'Windows Hermes compiler was not found in the locked pnpm install. Reinstall dependencies from pnpm-lock.yaml.'
}
if ($hermesCandidates.Count -gt 1) {
    throw 'More than one Windows Hermes compiler was found. Refresh the locked pnpm install before building.'
}

$previousHermesc = $env:START_FIVE_HERMESC
$previousCxxStaging = $env:START_FIVE_CXX_STAGING
$previousGradleOptions = $env:GRADLE_OPTS

try {
    $env:START_FIVE_HERMESC = $hermesCandidates[0].FullName
    $env:START_FIVE_CXX_STAGING = [System.IO.Path]::GetFullPath($CxxStaging)
    $env:GRADLE_OPTS = (@($previousGradleOptions, '-Dkotlin.incremental=false') |
        Where-Object { -not [string]::IsNullOrWhiteSpace($_) }) -join ' '

    Push-Location $androidRoot
    try {
        & $gradleWrapper ':app:assembleInternal' "-PreactNativeArchitectures=$Architecture" '--no-daemon' '--no-build-cache'
        if ($LASTEXITCODE -ne 0) {
            throw "Android internal build failed with exit code $LASTEXITCODE."
        }
    }
    finally {
        Pop-Location
    }
}
finally {
    $env:START_FIVE_HERMESC = $previousHermesc
    $env:START_FIVE_CXX_STAGING = $previousCxxStaging
    $env:GRADLE_OPTS = $previousGradleOptions
}

if (-not (Test-Path -LiteralPath $apkPath -PathType Leaf)) {
    throw "Gradle succeeded but the APK was not found: $apkPath"
}

$apk = Get-Item -LiteralPath $apkPath
$hash = Get-FileHash -LiteralPath $apkPath -Algorithm SHA256
Write-Output "Internal-only APK (debug key; not for production): $($apk.FullName)"
Write-Output "Size: $($apk.Length) bytes"
Write-Output "SHA256: $($hash.Hash.ToLowerInvariant())"
