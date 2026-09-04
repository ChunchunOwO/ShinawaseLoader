#Requires -Version 5.1
<#
.SYNOPSIS
  Pack local example mods, import into ECHO, enable them, then launch with desktop bridge.

.DESCRIPTION
  Steam ECHO leaves window.echo.accounts null. Shinawase restores accounts/streaming
  only when ECHO is started with --inspect so main-bootstrap can load streaming-bridge.
  This script always quits existing ECHO first (unless -KeepRunning), then starts
  Loader in debug/run mode and waits for the inspect port before finishing.

.PARAMETER EchoRoot
  ECHO install folder that contains ECHO.exe (and ShinawaseLoader after setup).

.PARAMETER Mods
  Mod source folders relative to the repo, or absolute paths to echomod dirs.
  Default: ECHO-MV + ECHO-Streaming.

.PARAMETER Watch
  Keep running and re-pack / import / reinject when source files change.

.PARAMETER NoLaunch
  Only pack + import + enable (no quit / no launch).

.PARAMETER KeepRunning
  Do not quit ECHO. If Loader is already up, only reinject. Skips desktop-bridge relaunch.

.PARAMETER LaunchDebug
  Pass --debug --log-level debug to Loader (default true).
#>
[CmdletBinding()]
param(
  [string]$EchoRoot,
  [string[]]$Mods = @('examples\ECHO-MV\echomod', 'examples\ECHO-Streaming\echomod'),
  [switch]$Watch,
  [switch]$NoLaunch,
  [switch]$KeepRunning,
  [bool]$LaunchDebug = $true
)

$ErrorActionPreference = 'Stop'
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$PackScript = Join-Path $ProjectRoot 'scripts\pack-echomod.mjs'
$SelectionFile = Join-Path $env:LOCALAPPDATA 'ShinawaseLoader\selection.json'
$LoaderPort = 17862
$DebugPort = 9229
$InspectPort = 9230
$OutDir = Join-Path $ProjectRoot 'examples\packages\.dev'
$DebounceMs = 800
$BridgeWaitSeconds = 45

function Write-Step([string]$Message, [string]$Color = 'Cyan') {
  Write-Host ("[{0}] {1}" -f (Get-Date -Format 'HH:mm:ss'), $Message) -ForegroundColor $Color
}

function Read-JsonFile([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path)) { return $null }
  return (Get-Content -LiteralPath $Path -Raw -Encoding UTF8 | ConvertFrom-Json)
}

function Resolve-EchoRoot {
  if ($EchoRoot) {
    $candidate = $EchoRoot.Trim().TrimEnd('\', '/')
    if (Test-Path -LiteralPath (Join-Path $candidate 'ECHO.exe')) { return (Resolve-Path -LiteralPath $candidate).Path }
    if ((Split-Path -Leaf $candidate) -ieq 'ECHO.exe' -and (Test-Path -LiteralPath $candidate)) {
      return (Resolve-Path -LiteralPath (Split-Path -Parent $candidate)).Path
    }
    throw "EchoRoot is invalid (need a folder with ECHO.exe): $EchoRoot"
  }

  $envRoot = $env:ECHO_ROOT
  if ($envRoot) {
    $candidate = $envRoot.Trim().TrimEnd('\', '/')
    if ((Split-Path -Leaf $candidate) -ieq 'ECHO.exe') { $candidate = Split-Path -Parent $candidate }
    if (Test-Path -LiteralPath (Join-Path $candidate 'ECHO.exe')) { return (Resolve-Path -LiteralPath $candidate).Path }
  }

  $selection = Read-JsonFile $SelectionFile
  if ($selection -and $selection.echoExe -and (Test-Path -LiteralPath $selection.echoExe)) {
    return (Resolve-Path -LiteralPath (Split-Path -Parent $selection.echoExe)).Path
  }

  foreach ($fallback in @(
      'E:\Steam\steamapps\common\ECHO',
      'D:\ECHOSteam\dist\win-unpacked',
      'D:\SteamLibrary\steamapps\common\ECHO'
    )) {
    if (Test-Path -LiteralPath (Join-Path $fallback 'ECHO.exe')) { return $fallback }
  }

  throw 'Could not find ECHO. Pass -EchoRoot, set ECHO_ROOT, or run setup-modloader.bat once.'
}

function Resolve-ModSource([string]$Spec) {
  if ([IO.Path]::IsPathRooted($Spec) -and (Test-Path -LiteralPath $Spec)) {
    return (Resolve-Path -LiteralPath $Spec).Path
  }
  $relative = Join-Path $ProjectRoot $Spec
  if (Test-Path -LiteralPath $relative) { return (Resolve-Path -LiteralPath $relative).Path }
  throw "Mod source not found: $Spec"
}

function Get-NodeExe([string]$LoaderRoot) {
  $bundled = Join-Path $LoaderRoot 'node.exe'
  if (Test-Path -LiteralPath $bundled) { return $bundled }
  $cmd = Get-Command node -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  throw 'node.exe not found (expected in ShinawaseLoader or on PATH).'
}

function Read-LoaderPorts([string]$LoaderRoot) {
  $cfg = Read-JsonFile (Join-Path $LoaderRoot 'loader.config.json')
  if ($cfg) {
    if ($cfg.port) { $script:LoaderPort = [int]$cfg.port }
    if ($cfg.debugPort) { $script:DebugPort = [int]$cfg.debugPort }
    if ($cfg.inspectPort) { $script:InspectPort = [int]$cfg.inspectPort }
  }
}

function Test-HttpOk([string]$Url, [int]$TimeoutSec = 2) {
  try {
    $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec $TimeoutSec
    return ($response.StatusCode -ge 200 -and $response.StatusCode -lt 300)
  } catch {
    return $false
  }
}

function Test-LoaderApi { Test-HttpOk "http://127.0.0.1:$LoaderPort/api/status" }

function Test-InspectPort { Test-HttpOk "http://127.0.0.1:$InspectPort/json" }

function Test-CdpPort { Test-HttpOk "http://127.0.0.1:$DebugPort/json" }

function Invoke-LoaderApi([string]$Method, [string]$Path) {
  $uri = "http://127.0.0.1:$LoaderPort$Path"
  return Invoke-WebRequest -Uri $uri -Method $Method -UseBasicParsing -TimeoutSec 30
}

function Stop-EchoProcesses {
  param([string]$EchoRootPath)

  $stopped = @()
  $pathMatchers = @(
    "$EchoRootPath\ECHO.exe",
    "$EchoRootPath\ECHO.modded.exe",
    "$EchoRootPath\ShinawaseLoader\modded-runtime\ECHO.exe"
  )

  Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
    Where-Object {
      $exePath = [string]$_.ExecutablePath
      if ($_.Name -match '^(ECHO|ECHO\.modded)\.exe$') { return $true }
      if (-not $exePath) { return $false }
      foreach ($pattern in $pathMatchers) {
        if ($exePath -like $pattern) { return $true }
      }
      return $false
    } |
    ForEach-Object {
      try {
        Stop-Process -Id $_.ProcessId -Force -ErrorAction Stop
        $stopped += ("{0}({1})" -f $_.Name, $_.ProcessId)
      } catch {}
    }

  # Name-based fallback (child utility processes share ECHO.exe name).
  foreach ($name in @('ECHO', 'ECHO.modded')) {
    Get-Process -Name $name -ErrorAction SilentlyContinue | ForEach-Object {
      try {
        Stop-Process -Id $_.Id -Force -ErrorAction Stop
        $stopped += ("{0}({1})" -f $_.ProcessName, $_.Id)
      } catch {}
    }
  }

  if ($stopped.Count -gt 0) {
    Write-Step ("Quit ECHO: {0}" -f (($stopped | Select-Object -Unique) -join ', ')) 'Yellow'
    Start-Sleep -Seconds 1
  } else {
    Write-Step 'No running ECHO process'
  }
}

function Get-CdpPages {
  try {
    $response = Invoke-WebRequest -Uri "http://127.0.0.1:$DebugPort/json" -UseBasicParsing -TimeoutSec 2
    $pages = $response.Content | ConvertFrom-Json
    if ($pages -isnot [System.Array]) { $pages = @($pages) }
    return @($pages | Where-Object { $_.type -eq 'page' -and $_.webSocketDebuggerUrl })
  } catch {
    return @()
  }
}

function Test-AccountsBridgeViaCdp {
  # Real check: renderer must see Shinawase streaming/accounts preload API.
  # Packaged Steam ECHO ignores --inspect, so :9230 alone is NOT proof.
  $pages = Get-CdpPages
  if ($pages.Count -eq 0) { return $false }

  Add-Type -AssemblyName System.Net.Http -ErrorAction SilentlyContinue
  foreach ($page in $pages) {
    $wsUrl = [string]$page.webSocketDebuggerUrl
    if (-not $wsUrl) { continue }
    try {
      $ws = New-Object System.Net.WebSockets.ClientWebSocket
      $cts = New-Object System.Threading.CancellationTokenSource
      $cts.CancelAfter(4000)
      $ws.ConnectAsync([Uri]$wsUrl, $cts.Token).Wait()
      $id = Get-Random -Minimum 1000 -Maximum 999999
      $expr = @'
(() => {
  const extra = window.__echoShinawaseStreaming;
  const echo = window.echo;
  const accounts = (echo && echo.accounts) || (extra && extra.accounts) || null;
  return {
    hasExtra: Boolean(extra),
    hasAccounts: Boolean(accounts && typeof accounts.getStatuses === 'function'),
    patched: Boolean(window.__echoShinawaseEchoPatched),
    href: String(location.href || '').slice(0, 120)
  };
})()
'@
      $payload = @{ id = $id; method = 'Runtime.evaluate'; params = @{ expression = $expr; returnByValue = $true; awaitPromise = $true } } | ConvertTo-Json -Compress -Depth 6
      $send = [System.Text.Encoding]::UTF8.GetBytes($payload)
      $ws.SendAsync((New-Object ArraySegment[byte] -ArgumentList @(,$send)), [System.Net.WebSockets.WebSocketMessageType]::Text, $true, $cts.Token).Wait()

      $buffer = New-Object byte[] 65536
      $resultText = ''
      $deadline = (Get-Date).AddSeconds(4)
      while ((Get-Date) -lt $deadline) {
        $seg = New-Object ArraySegment[byte] -ArgumentList @(,$buffer)
        $recv = $ws.ReceiveAsync($seg, $cts.Token).Result
        $resultText += [System.Text.Encoding]::UTF8.GetString($buffer, 0, $recv.Count)
        if ($recv.EndOfMessage) { break }
      }
      try { $ws.CloseAsync([System.Net.WebSockets.WebSocketCloseStatus]::NormalClosure, 'bye', $cts.Token).Wait(500) | Out-Null } catch {}
      $ws.Dispose()

      $json = $resultText | ConvertFrom-Json
      $value = $json.result.result.value
      if ($value -and $value.hasAccounts -eq $true) {
        return $true
      }
    } catch {
      continue
    }
  }
  return $false
}

function Wait-DesktopBridge {
  param([int]$Seconds = 45)

  Write-Step ("Waiting for accounts bridge via CDP :{0} (asar-bridge / streaming-preload)..." -f $DebugPort)
  $deadline = (Get-Date).AddSeconds($Seconds)
  $cdpOk = $false
  $accountsOk = $false
  while ((Get-Date) -lt $deadline) {
    if (-not $cdpOk) { $cdpOk = Test-CdpPort }
    if ($cdpOk) {
      $accountsOk = Test-AccountsBridgeViaCdp
      if ($accountsOk) { break }
    }
    Start-Sleep -Milliseconds 700
  }

  $inspectOk = Test-InspectPort
  if ($accountsOk) {
    Write-Step ("Desktop bridge OK  accounts API live  cdp=:{0}  inspect=:{1}" -f $DebugPort, $(if ($inspectOk) { $InspectPort } else { 'n/a' })) 'Green'
    return $true
  }

  Write-Step @"
Desktop bridge FAILED - window.echo.accounts is still null.
Steam ECHO ignores --inspect; use ECHO.modded.exe (asar-bridge).
cdp=:$DebugPort ($cdpOk)  inspect=:$InspectPort ($inspectOk)
Fully quit every ECHO process, do not use Steam Start, then re-run this bat.
"@ 'Red'
  return $false
}

function Publish-Mods {
  param(
    [string]$Node,
    [string]$LoaderJs,
    [string]$EchoExePath,
    [string[]]$Sources
  )

  New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
  $imported = @()

  foreach ($source in $Sources) {
    $manifestPath = Join-Path $source 'echo.mod.json'
    if (-not (Test-Path -LiteralPath $manifestPath)) { throw "Missing echo.mod.json in $source" }
    $manifest = Read-JsonFile $manifestPath
    $id = [string]$manifest.id
    $name = if ($manifest.name) { [string]$manifest.name } else { $id }
    $outFile = Join-Path $OutDir ("{0}.echomod" -f $id)

    Write-Step "Pack $name ($id)"
    $packOut = & $Node $PackScript $source $outFile --zip 2>&1 | Out-String
    if ($LASTEXITCODE -ne 0) {
      Write-Host $packOut
      throw "pack-echomod failed for $source"
    }

    Write-Step "Import $name"
    $importOut = & $Node $LoaderJs 'import' $outFile '--echo' $EchoExePath 2>&1 | Out-String
    if ($LASTEXITCODE -ne 0) {
      Write-Host $importOut
      throw "import failed for $id"
    }

    Write-Step "Enable $name"
    $enableOut = & $Node $LoaderJs 'enable' $id '--echo' $EchoExePath 2>&1 | Out-String
    if ($LASTEXITCODE -ne 0) {
      Write-Host $enableOut
      throw "enable failed for $id"
    }

    $imported += [pscustomobject]@{ Id = $id; Name = $name; Package = $outFile }
  }

  return $imported
}

function Request-Reinject {
  if (-not (Test-LoaderApi)) {
    Write-Step 'Loader API not up yet; skip reinject' 'Yellow'
    return $false
  }
  Write-Step 'Reinject enabled mods'
  [void](Invoke-LoaderApi -Method Post -Path '/api/reinject')
  return $true
}

function Start-EchoFresh {
  param(
    [string]$Node,
    [string]$LoaderRoot,
    [string]$LoaderJs,
    [string]$EchoRootPath,
    [string]$EchoExePath,
    [bool]$UseDebug
  )

  Stop-EchoProcesses -EchoRootPath $EchoRootPath

  # Stock Steam ECHO.exe ignores --inspect, so accounts/streaming stay null.
  # ECHO.modded.exe launches the isolated asar-bridge runtime that loads
  # streaming-bridge + streaming-preload in-process (see loader.config autoStartMode).
  $moddedHost = Join-Path $EchoRootPath 'ECHO.modded.exe'
  $moddedRuntime = Join-Path $LoaderRoot 'modded-runtime\ECHO.exe'
  $launcherCmd = Join-Path $LoaderRoot 'start-echo-with-mods.cmd'

  if (-not (Test-Path -LiteralPath $moddedHost) -or -not (Test-Path -LiteralPath $moddedRuntime)) {
    throw @"
ECHO.modded.exe / modded-runtime missing.
Run setup-modloader.bat -Action install against $EchoRootPath first.
"@
  }

  Write-Step 'Start ECHO.modded.exe (asar-bridge runtime for accounts)' 'Green'
  if (Test-Path -LiteralPath $launcherCmd) {
    Start-Process -FilePath $launcherCmd -WorkingDirectory $EchoRootPath
  } else {
    # runtime-sync then modded host
    & $Node (Join-Path $LoaderRoot 'runtime-sync.mjs') '--echo' $EchoRootPath 2>&1 | Out-Null
    Start-Process -FilePath $moddedHost -WorkingDirectory $EchoRootPath
  }

  $deadline = (Get-Date).AddSeconds(25)
  while ((Get-Date) -lt $deadline -and -not (Test-LoaderApi)) {
    Start-Sleep -Milliseconds 500
  }
  if (-not (Test-LoaderApi)) {
    Write-Step "Loader API :$LoaderPort not up yet (modded host may still be syncing)" 'Yellow'
  }

  return Wait-DesktopBridge -Seconds $BridgeWaitSeconds
}

# ---- main ----
try {
  [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false
} catch {}

$echoRootResolved = Resolve-EchoRoot
$echoExe = Join-Path $echoRootResolved 'ECHO.exe'
$loaderRoot = Join-Path $echoRootResolved 'ShinawaseLoader'
$loaderJs = Join-Path $loaderRoot 'ShinawaseLoader.mjs'
Read-LoaderPorts $loaderRoot

Write-Host ''
Write-Host 'ShinawaseLoader - dev with latest mods' -ForegroundColor White
Write-Host ("  Project   {0}" -f $ProjectRoot) -ForegroundColor DarkGray
Write-Host ("  ECHO      {0}" -f $echoRootResolved) -ForegroundColor DarkGray
Write-Host ("  Inspect   :{0}   CDP :{1}   Loader :{2}" -f $InspectPort, $DebugPort, $LoaderPort) -ForegroundColor DarkGray
Write-Host ("  Watch     {0}" -f ($(if ($Watch) { 'on' } else { 'off' }))) -ForegroundColor DarkGray
Write-Host ''

if (-not (Test-Path -LiteralPath $loaderJs)) {
  throw @"
ShinawaseLoader is not installed at:
  $loaderRoot

Install once:
  .\setup-modloader.bat -Action install -EchoRoot `"$echoRootResolved`"

Or point -EchoRoot at your Steam ECHO (from selection.json).
"@
}

if (-not (Test-Path -LiteralPath $PackScript)) {
  throw "pack script missing: $PackScript"
}

$modSources = @($Mods | ForEach-Object { Resolve-ModSource $_ })
$node = Get-NodeExe $loaderRoot

Write-Step 'Sync latest mod sources into ECHO'
$published = Publish-Mods -Node $node -LoaderJs $loaderJs -EchoExePath $echoExe -Sources $modSources
foreach ($item in $published) {
  Write-Host ("    OK  {0}  ->  {1}" -f $item.Name, $item.Id) -ForegroundColor Green
}

$bridgeOk = $true
if ($NoLaunch) {
  Write-Step 'Mods imported (-NoLaunch). No ECHO quit/launch.' 'Yellow'
  $bridgeOk = $false
} elseif ($KeepRunning) {
  if (Test-LoaderApi) {
    [void](Request-Reinject)
    $bridgeOk = Test-AccountsBridgeViaCdp
    if (-not $bridgeOk) {
      Write-Step 'Accounts bridge still null with -KeepRunning. Re-run without -KeepRunning to relaunch ECHO.modded.exe.' 'Red'
    }
  } else {
    Write-Step '-KeepRunning set but Loader is not up; launching fresh.' 'Yellow'
    $bridgeOk = Start-EchoFresh -Node $node -LoaderRoot $loaderRoot -LoaderJs $loaderJs -EchoRootPath $echoRootResolved -EchoExePath $echoExe -UseDebug $LaunchDebug
  }
} else {
  $bridgeOk = Start-EchoFresh -Node $node -LoaderRoot $loaderRoot -LoaderJs $loaderJs -EchoRootPath $echoRootResolved -EchoExePath $echoExe -UseDebug $LaunchDebug
  if ($bridgeOk -and (Test-LoaderApi)) {
    Start-Sleep -Milliseconds 1200
    [void](Request-Reinject)
  }
}

if (-not $Watch) {
  if ($NoLaunch) {
    Write-Step 'Done (-NoLaunch). Run the bat again without -NoLaunch to start ECHO.modded.exe.' 'Green'
    Write-Host ''
    exit 0
  }
  if ($bridgeOk) {
    Write-Step 'Done. Open Settings > Account: QQ / NetEase should work now.' 'Green'
    Write-Host ''
    exit 0
  }
  Write-Step 'Done with bridge warning. Check ShinawaseLoader\Logs\loader.log' 'Yellow'
  Write-Host ''
  exit 2
}

Write-Step 'Watching mod sources (Ctrl+C to stop)...' 'Magenta'
$sync = [hashtable]::Synchronized(@{ pending = $false })
$lastFire = Get-Date

$watchers = @()
$subscribers = @()
foreach ($source in $modSources) {
  $watcher = New-Object System.IO.FileSystemWatcher $source, '*.*'
  $watcher.IncludeSubdirectories = $true
  $watcher.NotifyFilter = [IO.NotifyFilters]'FileName, LastWrite, Size'
  $watcher.EnableRaisingEvents = $true
  foreach ($evt in @('Changed', 'Created', 'Renamed', 'Deleted')) {
    $subscribers += Register-ObjectEvent -InputObject $watcher -EventName $evt -MessageData $sync -Action {
      $Event.MessageData.pending = $true
    }
  }
  $watchers += $watcher
  Write-Host ("  watch  {0}" -f $source) -ForegroundColor DarkGray
}

try {
  while ($true) {
    Start-Sleep -Milliseconds 200
    if (-not $sync.pending) { continue }
    if (((Get-Date) - $lastFire).TotalMilliseconds -lt $DebounceMs) { continue }
    $sync.pending = $false
    $lastFire = Get-Date
    Write-Host ''
    try {
      Write-Step 'Change detected - rebuild + import'
      [void](Publish-Mods -Node $node -LoaderJs $loaderJs -EchoExePath $echoExe -Sources $modSources)
      if (Test-LoaderApi) {
        [void](Request-Reinject)
        if (-not (Test-AccountsBridgeViaCdp)) {
          Write-Step 'Accounts bridge missing; re-run bat without -KeepRunning to relaunch ECHO.modded.exe.' 'Red'
        } else {
          Write-Step 'Live update applied' 'Green'
        }
      } else {
        Write-Step 'Loader not running; packages updated on disk.' 'Yellow'
      }
    } catch {
      Write-Step ("Update failed: {0}" -f $_.Exception.Message) 'Red'
    }
  }
} finally {
  foreach ($sub in $subscribers) {
    Unregister-Event -SourceIdentifier $sub.Name -Force -ErrorAction SilentlyContinue
  }
  foreach ($watcher in $watchers) {
    $watcher.EnableRaisingEvents = $false
    $watcher.Dispose()
  }
}
