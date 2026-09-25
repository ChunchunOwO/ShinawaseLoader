[CmdletBinding()]
param(
  [string]$EchoRoot = 'D:\SteamLibrary\steamapps\common\ECHO',
  # Empty = resolve from the target install. Fallback is Electron 43.3.0
  # (echo-steam 26.9.1 / Chromium 150). Never default to 42.3.1.
  [string]$ElectronVersion,
  [ValidateSet('electron', 'node')]
  [string]$Runtime = 'electron'
)

$ErrorActionPreference = 'Stop'
$FallbackElectron = '43.3.0'
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$selectionFile = Join-Path $(if ($env:LOCALAPPDATA) { $env:LOCALAPPDATA } else { [IO.Path]::GetTempPath() }) 'ShinawaseLoader\selection.json'
$sourceId = ''
if (Test-Path -LiteralPath $selectionFile) {
  try { $sourceId = [string]((Get-Content -LiteralPath $selectionFile -Raw | ConvertFrom-Json).nodeMirror) } catch {}
}
$officialSource = $sourceId -eq 'official'
$npmRegistry = if ($officialSource) { 'https://registry.npmjs.org' } else { 'https://registry.npmmirror.com' }
$headerBase = if ($Runtime -eq 'electron') {
  if ($officialSource) { 'https://electronjs.org/headers' } else { 'https://npmmirror.com/mirrors/electron' }
} elseif ($officialSource) { 'https://nodejs.org/dist' } else { 'https://npmmirror.com/mirrors/node' }
$NativeRoot = Join-Path $ProjectRoot 'ShinawaseLoader\native'
$Gyp = Join-Path $NativeRoot 'binding.gyp'
if (-not (Test-Path -LiteralPath $Gyp)) { throw 'native/binding.gyp is missing.' }

# ECHO.exe FileVersion is the app stamp (26.9.1), not Electron.
# Accept only 40+ x.y.z as an Electron ABI (current host is 43.3.0).
function Test-ElectronAbiVersion([string]$value) {
  return [bool]($value -match '^(?:4[0-9]|[5-9]\d)\.\d+\.\d+')
}

function Resolve-EchoElectronVersion([string]$root) {
  if ($root) {
    $versionFile = Join-Path $root 'version'
    if (Test-Path -LiteralPath $versionFile) {
      $fromFile = (Get-Content -LiteralPath $versionFile -Raw).Trim()
      if ($fromFile -match '^(\d+\.\d+\.\d+)') { return $Matches[1] }
    }

    foreach ($name in @('ECHO.exe', 'ECHO Steam.exe')) {
      $exe = Join-Path $root $name
      if (-not (Test-Path -LiteralPath $exe)) { continue }
      $fileVersion = [string][Diagnostics.FileVersionInfo]::GetVersionInfo($exe).FileVersion
      $candidate = ($fileVersion -split '\s+')[0]
      if (Test-ElectronAbiVersion $candidate) { return $candidate }
    }
  }
  return $FallbackElectron
}

if (-not $PSBoundParameters.ContainsKey('ElectronVersion') -or -not $ElectronVersion) {
  $ElectronVersion = Resolve-EchoElectronVersion $EchoRoot
} elseif (-not (Test-ElectronAbiVersion $ElectronVersion)) {
  Write-Warning "Ignoring non-Electron version '$ElectronVersion' (ECHO.exe FileVersion is the app stamp). Resolving ABI from $EchoRoot or $FallbackElectron."
  $ElectronVersion = Resolve-EchoElectronVersion $EchoRoot
}

Push-Location $NativeRoot
$previousRegistry = $env:npm_config_registry
$previousDistUrl = [Environment]::GetEnvironmentVariable('npm_config_dist-url', 'Process')
$previousTarget = $env:npm_config_target
$previousArch = $env:npm_config_arch
$previousRuntime = $env:npm_config_runtime
try {
  # node-gyp 12 dropped `--target` from nopt defs. Space-separated
  # `--target 43.3.0` leaves `43.3.0` as a leftover gyp input file.
  # Prefer npm_config_* plus `--flag=value` so only Electron headers are used.
  $env:npm_config_registry = $npmRegistry
  [Environment]::SetEnvironmentVariable('npm_config_dist-url', $headerBase, 'Process')
  if ($Runtime -eq 'electron') {
    [Environment]::SetEnvironmentVariable('npm_config_target', $ElectronVersion, 'Process')
    [Environment]::SetEnvironmentVariable('npm_config_arch', 'x64', 'Process')
    [Environment]::SetEnvironmentVariable('npm_config_runtime', 'electron', 'Process')
  }
  $gypArgs = @('--yes', "--registry=$npmRegistry", '--', 'node-gyp', 'rebuild')
  if ($Runtime -eq 'electron') {
    $gypArgs += @(
      "--target=$ElectronVersion",
      '--arch=x64',
      "--dist-url=$headerBase"
    )
  } else {
    $gypArgs += "--dist-url=$headerBase"
  }
  Write-Host "Building echo-native-host for $Runtime $ElectronVersion (echo-steam Electron ABI)"
  npx @gypArgs
  $built = Join-Path $NativeRoot 'build\Release\echo-native-host.node'
  if (-not (Test-Path -LiteralPath $built)) { throw 'echo-native-host.node was not produced.' }
  Copy-Item -LiteralPath $built -Destination (Join-Path $ProjectRoot 'ShinawaseLoader\echo-native-host.node') -Force
  Write-Host "Native host: $built"
} finally {
  $env:npm_config_registry = $previousRegistry
  [Environment]::SetEnvironmentVariable('npm_config_dist-url', $previousDistUrl, 'Process')
  $env:npm_config_target = $previousTarget
  $env:npm_config_arch = $previousArch
  $env:npm_config_runtime = $previousRuntime
  Pop-Location
}
