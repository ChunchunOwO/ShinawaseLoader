[CmdletBinding()]
param(
  [string]$EchoRoot,
  [string]$ElectronVersion = '42.3.1',
  [ValidateSet('electron', 'node')]
  [string]$Runtime = 'electron'
)

$ErrorActionPreference = 'Stop'
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$NativeRoot = Join-Path $ProjectRoot 'ShinawaseLoader\native'
$Gyp = Join-Path $NativeRoot 'binding.gyp'
if (-not (Test-Path -LiteralPath $Gyp)) { throw 'native/binding.gyp is missing.' }

if ($EchoRoot) {
  $exe = Join-Path $EchoRoot 'ECHO.exe'
  if (Test-Path -LiteralPath $exe) {
    $info = [Diagnostics.FileVersionInfo]::GetVersionInfo($exe)
    if ($info.FileVersion) { $ElectronVersion = $info.FileVersion }
  }
}

Push-Location $NativeRoot
try {
  $gypArgs = @('node-gyp', 'rebuild')
  if ($Runtime -eq 'electron') {
    $gypArgs += @('--target', $ElectronVersion, '--arch', 'x64', '--dist-url', 'https://electronjs.org/headers')
  }
  Write-Host "Building echo-native-host for $Runtime $ElectronVersion"
  npx --yes @gypArgs
  $built = Join-Path $NativeRoot 'build\Release\echo-native-host.node'
  if (-not (Test-Path -LiteralPath $built)) { throw 'echo-native-host.node was not produced.' }
  Copy-Item -LiteralPath $built -Destination (Join-Path $ProjectRoot 'ShinawaseLoader\echo-native-host.node') -Force
  Write-Host "Native host: $built"
} finally {
  Pop-Location
}
