[CmdletBinding()]
param(
  [ValidateSet('install', 'update', 'uninstall', 'check', 'menu')]
  [string]$Action = 'menu',
  [string]$EchoRoot,
  [switch]$Force
)

$ErrorActionPreference = 'Stop'
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$LocalSource = Join-Path $ProjectRoot 'ShinawaseLoader'
$Repo = 'https://raw.githubusercontent.com/ChunchunOwO/ShinawaseLoader/main'
$Archive = 'https://github.com/ChunchunOwO/ShinawaseLoader/archive/refs/heads/main.zip'
$InstalledEchoRoot = 'C:\Program Files\ECHO'
$DefaultEchoRoot = if (Test-Path -LiteralPath (Join-Path $InstalledEchoRoot 'ECHO.exe')) {
  $InstalledEchoRoot
} else {
  Join-Path $ProjectRoot '..\ECHOSteam-main\dist\win-unpacked'
}
$Logo = @'
  ____  _     _
 / ___|| |__ (_)_ __   __ ___      ____ _ ___  ___
 \___ \| '_ \| | '_ \ / _` \ \ /\ / / _` / __|/ _ \
  ___) | | | | | | | | (_| |\ V  V / (_| \__ \  __/
 |____/|_| |_|_|_| |_|\__,_| \_/\_/ \__,_|___/\___|
 | |    ___   __ _  __| | ___ _ __
 | |   / _ \ / _` |/ _` |/ _ \ '__|
 | |__| (_) | (_| | (_| |  __/ |
 |_____\___/ \__,_|\__,_|\___|_|
'@

function Read-Version($path) {
  if (-not (Test-Path -LiteralPath $path)) { return $null }
  try { return (Get-Content -Raw -LiteralPath $path | ConvertFrom-Json).version } catch { return $null }
}

function Ensure-Administrator {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = [Security.Principal.WindowsPrincipal]::new($identity)
  if ($principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { return }

  $forward = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $PSCommandPath)
  $forward += @('-Action', $Action)
  if ($EchoRoot) { $forward += @('-EchoRoot', ('"' + $EchoRoot.Replace('"', '\"') + '"')) }
  if ($Force) { $forward += '-Force' }
  try {
    $child = Start-Process -FilePath (Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe') -Verb RunAs -ArgumentList $forward -Wait -PassThru
    if ($null -eq $child.ExitCode) { exit 0 }
    exit $child.ExitCode
  } catch {
    Write-Error 'Administrator permission is required to install or remove ShinawaseLoader.'
    exit 1
  }
}

function Resolve-EchoRoot {
  if ($EchoRoot) { return [IO.Path]::GetFullPath($EchoRoot) }
  return [IO.Path]::GetFullPath($DefaultEchoRoot)
}

function Get-RemoteVersion {
  try { return Invoke-RestMethod -Uri "$Repo/ShinawaseLoader/loader-version.json" -TimeoutSec 15 } catch { return $null }
}

function Stop-Loader($loaderRoot) {
  Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -like "*$loaderRoot*ShinawaseLoader.mjs*" } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
}

function Download-Node($loaderRoot, $versionInfo) {
  $nodePath = Join-Path $loaderRoot 'node.exe'
  if (Test-Path -LiteralPath $nodePath) { return $nodePath }
  $temp = Join-Path ([IO.Path]::GetTempPath()) "shinawase-node-$([guid]::NewGuid()).zip"
  $extract = Join-Path ([IO.Path]::GetTempPath()) "shinawase-node-$([guid]::NewGuid())"
  try {
    Write-Host "Downloading Node.js $($versionInfo.nodeVersion)..."
    Invoke-WebRequest -Uri $versionInfo.nodeUrl -OutFile $temp -UseBasicParsing
    Expand-Archive -LiteralPath $temp -DestinationPath $extract -Force
    $downloaded = Get-ChildItem -LiteralPath $extract -Filter node.exe -Recurse | Select-Object -First 1
    if (-not $downloaded) { throw 'node.exe was not found in the downloaded archive' }
    Copy-Item -LiteralPath $downloaded.FullName -Destination $nodePath -Force
    return $nodePath
  } finally {
    Remove-Item -LiteralPath $temp, $extract -Recurse -Force -ErrorAction SilentlyContinue
  }
}

function Copy-Loader($source, $echoRoot, $versionInfo) {
  $loaderRoot = Join-Path $echoRoot 'ShinawaseLoader'
  $modsRoot = Join-Path $echoRoot 'Mods'
  New-Item -ItemType Directory -Force -Path $loaderRoot, $modsRoot | Out-Null
  Stop-Loader $loaderRoot
  @('install-mod.bat', 'install-modloader.bat', 'install-echotogether-mod.bat') | ForEach-Object {
    Remove-Item -LiteralPath (Join-Path $loaderRoot $_) -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath (Join-Path $echoRoot $_) -ErrorAction SilentlyContinue
  }
  Get-ChildItem -LiteralPath $source -Force | Where-Object { $_.Name -notin @('node.exe', 'loader-state.json', 'loader-debug.log', 'loader.config.json') } |
    ForEach-Object { Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $loaderRoot $_.Name) -Recurse -Force }
  $node = Download-Node $loaderRoot $versionInfo
  $config = Join-Path $loaderRoot 'loader.config.json'
  if (-not (Test-Path -LiteralPath $config)) { Copy-Item (Join-Path $source 'loader.config.json') $config }
  & $node (Join-Path $loaderRoot 'ShinawaseLoader.mjs') init | Out-Host
  & $node (Join-Path $loaderRoot 'echo-asar.mjs') patch $echoRoot | Out-Host
  & icacls.exe $loaderRoot $modsRoot /grant "${env:USERNAME}:(OI)(CI)M" /T /C | Out-Null
  Write-Host "Installed ShinawaseLoader $($versionInfo.version) in $loaderRoot" -ForegroundColor Green
  Write-Host "Mods folder: $modsRoot" -ForegroundColor Cyan
}

function Get-Status($echoRoot) {
  $loaderRoot = Join-Path $echoRoot 'ShinawaseLoader'
  $local = Read-Version (Join-Path $LocalSource 'loader-version.json')
  $installed = Read-Version (Join-Path $loaderRoot 'loader-version.json')
  $remote = Get-RemoteVersion
  [pscustomobject]@{ Local = $local; Installed = $installed; Remote = if ($remote) { $remote.version } else { 'unavailable' }; EchoRoot = $echoRoot; LoaderRoot = $loaderRoot }
}

function Download-RemoteSource {
  $zip = Join-Path ([IO.Path]::GetTempPath()) "shinawase-loader-$([guid]::NewGuid()).zip"
  $dir = Join-Path ([IO.Path]::GetTempPath()) "shinawase-loader-$([guid]::NewGuid())"
  Invoke-WebRequest -Uri $Archive -OutFile $zip -UseBasicParsing
  Expand-Archive -LiteralPath $zip -DestinationPath $dir -Force
  $source = Get-ChildItem -LiteralPath $dir -Directory | Select-Object -First 1
  try { return Join-Path $source.FullName 'ShinawaseLoader' } finally { Remove-Item -LiteralPath $zip -Force -ErrorAction SilentlyContinue }
}

Ensure-Administrator

Write-Host $Logo -ForegroundColor Cyan
Write-Host 'ShinawaseLoader v0.0.1Beta' -ForegroundColor White
Write-Host ''
if ($Action -eq 'menu') {
  $targetEcho = Resolve-EchoRoot
  while ($true) {
    Write-Host "ShinawaseLoader setup" -ForegroundColor Cyan
    Write-Host "ECHO: $targetEcho"
    Write-Host "1. Install"
    Write-Host "2. Update"
    Write-Host "3. Uninstall loader (keeps Mods)"
    Write-Host "4. Check versions"
    Write-Host "5. Change ECHO directory"
    Write-Host "6. Exit"
    switch (Read-Host 'Select') {
      '1' { $Action = 'install'; break }
      '2' { $Action = 'update'; break }
      '3' { $Action = 'uninstall'; break }
      '4' { $Action = 'check'; break }
      '5' {
        $selectedRoot = Read-Host 'New ECHO directory'
        if ($selectedRoot.Trim()) { $EchoRoot = $selectedRoot.Trim(); $targetEcho = Resolve-EchoRoot }
        continue
      }
      default { exit 0 }
    }
    break
  }
}
$targetEcho = Resolve-EchoRoot

$echoExe = Join-Path $targetEcho 'ECHO.exe'
$loaderRoot = Join-Path $targetEcho 'ShinawaseLoader'
switch ($Action) {
  'check' { Get-Status $targetEcho | Format-List; exit 0 }
  'uninstall' {
    $asarScript = Join-Path $loaderRoot 'echo-asar.mjs'
    $nodePath = Join-Path $loaderRoot 'node.exe'
    if ((Test-Path -LiteralPath $asarScript) -and (Test-Path -LiteralPath $nodePath)) {
      $restoreArgs = @($asarScript, 'restore', $targetEcho)
      if ($Force) { $restoreArgs += '--force' }
      & $nodePath @restoreArgs | Out-Host
    }
    Stop-Loader $loaderRoot
    if (Test-Path -LiteralPath $loaderRoot) { Remove-Item -LiteralPath $loaderRoot -Recurse -Force }
    Write-Host "Loader removed. Mods were kept at $(Join-Path $targetEcho 'Mods')." -ForegroundColor Green
    exit 0
  }
    'install' { if (-not (Test-Path -LiteralPath $echoExe)) { throw "ECHO.exe was not found: $targetEcho" } }
    'update' { if (-not (Test-Path -LiteralPath $echoExe)) { throw "ECHO.exe was not found: $targetEcho" } }
}

$versionInfo = Get-Content -Raw -LiteralPath (Join-Path $LocalSource 'loader-version.json') | ConvertFrom-Json
if ($Action -eq 'update') {
  $remote = Get-RemoteVersion
  if ($remote -and (Read-Version (Join-Path $loaderRoot 'loader-version.json')) -and ([version]$remote.version -gt [version](Read-Version (Join-Path $loaderRoot 'loader-version.json')))) {
    $remoteSource = Download-RemoteSource
    try { Copy-Loader $remoteSource $targetEcho $remote } finally { Remove-Item -LiteralPath (Split-Path -Parent (Split-Path -Parent $remoteSource)) -Recurse -Force -ErrorAction SilentlyContinue }
  } else { Copy-Loader $LocalSource $targetEcho $versionInfo }
} else { Copy-Loader $LocalSource $targetEcho $versionInfo }
