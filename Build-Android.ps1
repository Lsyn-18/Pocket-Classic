$ErrorActionPreference = 'Stop'
$taskProject = $PSScriptRoot
$taskPortableJava = Join-Path $taskProject 'work\toolchain\jdk17'
if (Test-Path -LiteralPath $taskPortableJava) {
    $taskJdk = Get-ChildItem -LiteralPath $taskPortableJava -Directory | Select-Object -First 1
    $env:JAVA_HOME = $taskJdk.FullName
}
if (!$env:JAVA_HOME) { throw '请配置完整 JDK 17 的 JAVA_HOME，或在 Android Studio 中打开 android-player 工程。' }
$taskWeb = Join-Path $taskProject 'web-model'
if ((Get-Command node -ErrorAction SilentlyContinue) -and (Test-Path -LiteralPath (Join-Path $taskWeb 'node_modules/esbuild'))) {
    & node (Join-Path $taskWeb 'build.mjs') --android
    if ($LASTEXITCODE -ne 0) { throw '安卓界面资源打包未通过。' }
} elseif (!(Test-Path -LiteralPath (Join-Path $taskProject 'android-player/app/src/main/assets/player.html'))) {
    throw '缺少安卓界面资源，请先在 web-model 中运行 npm ci 和 npm run build:android。'
}
$env:GRADLE_USER_HOME = Join-Path $taskProject 'work\gradle-cache'
$env:ANDROID_USER_HOME = Join-Path $taskProject 'work\android-user'
& (Join-Path $taskProject 'android-player\gradlew.bat') -p (Join-Path $taskProject 'android-player') :app:assembleDebug :app:testDebugUnitTest :app:lintDebug --console=plain
if ($LASTEXITCODE -ne 0) { throw '安卓构建或检查未通过。' }
New-Item -ItemType Directory -Force -Path (Join-Path $taskProject 'outputs') | Out-Null
$taskVersionMatch = [regex]::Match((Get-Content -LiteralPath (Join-Path $taskProject 'android-player/app/build.gradle.kts') -Raw),'versionName\s*=\s*"([^"]+)"')
if (!$taskVersionMatch.Success) { throw '无法读取安卓版本号。' }
$taskApkName = 'Pocket-Classic-' + $taskVersionMatch.Groups[1].Value + '-debug.apk'
Copy-Item -LiteralPath (Join-Path $taskProject 'android-player\app\build\outputs\apk\debug\app-debug.apk') -Destination (Join-Path $taskProject ('outputs/' + $taskApkName))
