$ErrorActionPreference = 'Stop'
$taskProject = $PSScriptRoot
$taskPortableJava = Join-Path $taskProject 'work\toolchain\jdk17'
if (Test-Path -LiteralPath $taskPortableJava) {
    $taskJdk = Get-ChildItem -LiteralPath $taskPortableJava -Directory | Select-Object -First 1
    $env:JAVA_HOME = $taskJdk.FullName
}
if (!$env:JAVA_HOME) { throw '请配置完整 JDK 17 的 JAVA_HOME，或在 Android Studio 中打开 android-player 工程。' }
$env:GRADLE_USER_HOME = Join-Path $taskProject 'work\gradle-cache'
$env:ANDROID_USER_HOME = Join-Path $taskProject 'work\android-user'
& (Join-Path $taskProject 'android-player\gradlew.bat') -p (Join-Path $taskProject 'android-player') :app:assembleDebug :app:testDebugUnitTest :app:lintDebug --console=plain
if ($LASTEXITCODE -ne 0) { throw '安卓构建或检查未通过。' }
New-Item -ItemType Directory -Force -Path (Join-Path $taskProject 'outputs') | Out-Null
Copy-Item -LiteralPath (Join-Path $taskProject 'android-player\app\build\outputs\apk\debug\app-debug.apk') -Destination (Join-Path $taskProject 'outputs\Pocket-Classic-0.1.0-debug.apk')
