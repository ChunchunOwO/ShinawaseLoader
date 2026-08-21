[CmdletBinding()]
param(
  [ValidateSet('install', 'update', 'uninstall', 'check', 'launch', 'menu')]
  [string]$Action = 'menu',
  [string]$EchoRoot,
  [switch]$Force,
  [switch]$PatchApp
)

$ErrorActionPreference = 'Stop'
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$LocalSource = Join-Path $ProjectRoot 'ShinawaseLoader'
$Repo = 'https://raw.githubusercontent.com/ChunchunOwO/ShinawaseLoader/main'
$Archive = 'https://github.com/ChunchunOwO/ShinawaseLoader/archive/refs/heads/main.zip'
$BaseData = if ($env:LOCALAPPDATA) { $env:LOCALAPPDATA } else { [IO.Path]::GetTempPath() }
$UserDataRoot = Join-Path $BaseData 'ShinawaseLoader'
$SelectionFile = Join-Path $UserDataRoot 'selection.json'
$RuntimeCache = Join-Path $UserDataRoot 'runtimes'
$Logo = 'Shinawase'

function Read-Json($path, $fallback) {
  if (-not (Test-Path -LiteralPath $path)) { return $fallback }
  try { return Get-Content -Raw -LiteralPath $path | ConvertFrom-Json } catch { return $fallback }
}

function Write-Json($path, $value) {
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $path) | Out-Null
  $json = $value | ConvertTo-Json -Depth 20
  $utf8 = New-Object System.Text.UTF8Encoding -ArgumentList $false
  [IO.File]::WriteAllText($path, "$json`n", $utf8)
}

function Read-Version($path) {
  $value = Read-Json $path $null
  if ($value) { return $value.version }
  return $null
}

function Test-VersionGreater([string]$left, [string]$right) {
  try { return [version]$left -gt [version]$right } catch { return $false }
}

function Add-UniquePath([System.Collections.Generic.List[string]]$list, [string]$path) {
  if ([string]::IsNullOrWhiteSpace($path)) { return }
  try { $full = [IO.Path]::GetFullPath($path) } catch { return }
  if (-not $list.Contains($full)) { $list.Add($full) }
}

function Combine-Path([string]$base, [string]$child) {
  if ([string]::IsNullOrWhiteSpace($base)) { return $null }
  return [IO.Path]::Combine($base, $child)
}

function Get-SteamLibraryRoots {
  $roots = [System.Collections.Generic.List[string]]::new()
  $vdfCandidates = @(
    (Join-Path ${env:PROGRAMFILES(x86)} 'Steam\steamapps\libraryfolders.vdf'),
    (Join-Path $env:PROGRAMFILES 'Steam\steamapps\libraryfolders.vdf'),
    (Join-Path $env:LOCALAPPDATA 'Steam\steamapps\libraryfolders.vdf')
  )
  foreach ($vdf in $vdfCandidates) {
    if (Test-Path -LiteralPath $vdf) {
      $text = Get-Content -Raw -LiteralPath $vdf
      [regex]::Matches($text, '"path"\s+"([^"]+)"') | ForEach-Object { Add-UniquePath $roots $_.Groups[1].Value.Replace('\\', '\') }
    }
  }
  foreach ($drive in Get-PSDrive -PSProvider FileSystem -ErrorAction SilentlyContinue) {
    Add-UniquePath $roots (Join-Path $drive.Root 'SteamLibrary')
    Add-UniquePath $roots (Join-Path $drive.Root 'steamapps\common')
  }
  return $roots
}

function Get-EchoCandidates([string]$Hint) {
  if ($Hint -and (Test-Path -LiteralPath $Hint -PathType Leaf)) { return @([IO.Path]::GetFullPath($Hint)) }
  if ($Hint -and (Test-Path -LiteralPath $Hint -PathType Container)) {
    $direct = @(Get-ChildItem -LiteralPath $Hint -Filter '*.exe' -File -ErrorAction SilentlyContinue | Where-Object { $_.Name -match '^ECHO(?:\s+(?:NEXT|Playtest|Steam))?\.exe$' })
    if ($direct.Count -eq 1) { return @($direct[0].FullName) }
  }
  $found = [System.Collections.Generic.List[string]]::new()
  $roots = [System.Collections.Generic.List[string]]::new()
  if ($Hint) {
    if (Test-Path -LiteralPath $Hint -PathType Leaf) { Add-UniquePath $found $Hint }
    else { Add-UniquePath $roots $Hint }
  }
  $saved = Read-Json $SelectionFile $null
  if ($saved -and $saved.echoExe) { Add-UniquePath $found $saved.echoExe }
  foreach ($root in @(
    (Get-Location).Path,
    $ProjectRoot,
    (Join-Path $env:PROGRAMFILES 'ECHO'),
    (Join-Path ${env:PROGRAMFILES(x86)} 'ECHO'),
    (Join-Path $env:PROGRAMFILES 'Steam\steamapps\common'),
    (Join-Path ${env:PROGRAMFILES(x86)} 'Steam\steamapps\common'),
    (Join-Path $env:LOCALAPPDATA 'Programs')
  )) { Add-UniquePath $roots $root }
  foreach ($library in Get-SteamLibraryRoots) {
    Add-UniquePath $roots (Combine-Path $library 'steamapps\common')
    Add-UniquePath $roots $library
  }
  foreach ($root in $roots) {
    if (-not (Test-Path -LiteralPath $root -PathType Container)) { continue }
    try {
      $items = Get-ChildItem -LiteralPath $root -Filter '*.exe' -File -Recurse -Depth 6 -ErrorAction SilentlyContinue
      foreach ($item in $items) {
        if ($item.Name -match '^ECHO(?:\s+(?:NEXT|Playtest|Steam))?\.exe$') { Add-UniquePath $found $item.FullName }
      }
    } catch { }
  }
  return @($found | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } | Sort-Object -Unique)
}

function Select-EchoExecutable([string]$Hint) {
  $candidates = @(Get-EchoCandidates $Hint)
  if ($candidates.Count -eq 1) { return $candidates[0] }
  if (-not $candidates.Count) {
    $manual = Read-Host 'ECHO directory or executable (0 = back)'
    if ($manual -eq '0' -or [string]::IsNullOrWhiteSpace($manual)) { return $null }
    $retry = @(Get-EchoCandidates $manual.Trim())
    if ($retry.Count -eq 1) { return $retry[0] }
    throw "No ECHO executable found under '$manual'."
  }
  Write-Host ''
  for ($i = 0; $i -lt $candidates.Count; $i++) { Write-Host ("  [{0}] {1}" -f ($i + 1), $candidates[$i]) -ForegroundColor Gray }
  Write-Host '  [M] enter another directory    [0] back' -ForegroundColor DarkGray
  while ($true) {
    $choice = (Read-Host 'Choose ECHO').Trim()
    if ($choice -eq '0') { return $null }
    if ($choice -match '^[mM]$') { return Select-EchoExecutable (Read-Host 'ECHO directory') }
    $number = 0
    if ([int]::TryParse($choice, [ref]$number) -and $number -ge 1 -and $number -le $candidates.Count) { return $candidates[$number - 1] }
    Write-Host 'Invalid choice.' -ForegroundColor Yellow
  }
}

function Resolve-EchoExecutable {
  $path = Select-EchoExecutable $EchoRoot
  if (-not $path) { throw 'ECHO selection cancelled.' }
  $path = [IO.Path]::GetFullPath($path)
  Write-Json $SelectionFile @{ echoExe = $path; selectedAt = (Get-Date).ToUniversalTime().ToString('o') }
  return $path
}

function Download-File([string]$Uri, [string]$Destination) {
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $Destination) | Out-Null
  $request = [Net.HttpWebRequest]::Create($Uri)
  $request.Method = 'GET'
  $request.UserAgent = 'ShinawaseLoader/1.3'
  $request.Timeout = 30000
  $response = $request.GetResponse()
  $input = $response.GetResponseStream()
  $output = [IO.File]::Open($Destination, [IO.FileMode]::Create, [IO.FileAccess]::Write, [IO.FileShare]::None)
  try {
    $total = [double]$response.ContentLength
    $loaded = [int64]0
    $buffer = New-Object byte[] (1024 * 128)
    while (($read = $input.Read($buffer, 0, $buffer.Length)) -gt 0) {
      $output.Write($buffer, 0, $read)
      $loaded += $read
      if ($total -gt 0) { Write-Progress -Activity "Downloading $([IO.Path]::GetFileName($Destination))" -Status ("{0:N1} MB / {1:N1} MB" -f ($loaded / 1MB), ($total / 1MB)) -PercentComplete ([math]::Min(100, ($loaded / $total) * 100)) }
      else { Write-Progress -Activity "Downloading $([IO.Path]::GetFileName($Destination))" -Status ("{0:N1} MB" -f ($loaded / 1MB)) }
    }
  } finally {
    $output.Dispose(); $input.Dispose(); $response.Dispose(); Write-Progress -Activity 'Download' -Completed
  }
}

function Get-NodeRuntime($versionInfo, $loaderRoot) {
  New-Item -ItemType Directory -Force -Path $RuntimeCache | Out-Null
  $cacheDir = Join-Path $RuntimeCache ("node-" + $versionInfo.nodeVersion)
  $cacheNode = Join-Path $cacheDir 'node.exe'
  if (-not (Test-Path -LiteralPath $cacheNode)) {
    $zip = Join-Path $RuntimeCache ("node-" + $versionInfo.nodeVersion + '.zip')
    $extract = Join-Path $RuntimeCache (".node-" + [guid]::NewGuid().ToString('N'))
    try {
      Download-File $versionInfo.nodeUrl $zip
      Expand-Archive -LiteralPath $zip -DestinationPath $extract -Force
      $downloaded = Get-ChildItem -LiteralPath $extract -Filter 'node.exe' -File -Recurse | Select-Object -First 1
      if (-not $downloaded) { throw 'node.exe was not found in the downloaded archive.' }
      New-Item -ItemType Directory -Force -Path $cacheDir | Out-Null
      Copy-Item -LiteralPath $downloaded.FullName -Destination $cacheNode -Force
    } finally { Remove-Item -LiteralPath $zip, $extract -Recurse -Force -ErrorAction SilentlyContinue }
  }
  $localNode = Join-Path $loaderRoot 'node.exe'
  try { Copy-Item -LiteralPath $cacheNode -Destination $localNode -Force; return $localNode } catch { return $cacheNode }
}

function Stop-Loader($loaderRoot) {
  Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -like "*$loaderRoot*ShinawaseLoader.mjs*" } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
}

function New-HardLinkOrCopy([string]$source, [string]$destination) {
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $destination) | Out-Null
  try {
    New-Item -ItemType HardLink -Path $destination -Target $source -Force -ErrorAction Stop | Out-Null
  } catch {
    Copy-Item -LiteralPath $source -Destination $destination -Force
  }
}

function Export-OriginalIcon([string]$echoExe, [string]$loaderRoot) {
  $iconPath = Join-Path $loaderRoot 'echo-original.ico'
  Add-Type -AssemblyName System.Drawing
  $icon = [System.Drawing.Icon]::ExtractAssociatedIcon($echoExe)
  if (-not $icon) { throw "Could not extract the icon from '$echoExe'." }
  try {
    $stream = [IO.File]::Open($iconPath, [IO.FileMode]::Create, [IO.FileAccess]::Write, [IO.FileShare]::None)
    try { $icon.Save($stream) } finally { $stream.Dispose() }
  } finally { $icon.Dispose() }
  return $iconPath
}

function Build-ModdedHost([string]$echoRoot, [string]$loaderRoot, [string]$echoExe) {
  $source = Join-Path $loaderRoot 'modded-host.cs'
  $target = Join-Path $echoRoot 'ECHO.modded.exe'
  $icon = Export-OriginalIcon $echoExe $loaderRoot
  $compiler = @(
    (Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'),
    (Join-Path $env:WINDIR 'Microsoft.NET\Framework\v4.0.30319\csc.exe')
  ) | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
  if (-not $compiler) { throw 'Microsoft C# compiler was not found; cannot create ECHO.modded.exe.' }
  & $compiler /nologo /target:winexe /optimize+ /win32icon:$icon /out:$target $source
  if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $target)) { throw 'ECHO.modded.exe compilation failed.' }
  return $target
}

function Prepare-ModdedRuntime([string]$echoRoot, [string]$echoExe, [string]$loaderRoot, [string]$node) {
  $runtimeRoot = Join-Path $loaderRoot 'modded-runtime'
  if (Test-Path -LiteralPath $runtimeRoot) { Remove-Item -LiteralPath $runtimeRoot -Recurse -Force }
  New-Item -ItemType Directory -Force -Path (Join-Path $runtimeRoot 'resources') | Out-Null

  foreach ($item in Get-ChildItem -LiteralPath $echoRoot -File -Force) {
    if ($item.Name -in @('ECHO.exe', 'ECHO.modded.exe')) { continue }
    New-HardLinkOrCopy $item.FullName (Join-Path $runtimeRoot $item.Name)
  }
  foreach ($item in Get-ChildItem -LiteralPath $echoRoot -Directory -Force) {
    if ($item.Name -in @('resources', 'ShinawaseLoader', 'Mods', 'Plugins')) { continue }
    $target = Join-Path $runtimeRoot $item.Name
    try { New-Item -ItemType Junction -Path $target -Target $item.FullName -ErrorAction Stop | Out-Null }
    catch { Copy-Item -LiteralPath $item.FullName -Destination $target -Recurse -Force }
  }
  $originalAsar = Join-Path $echoRoot 'resources\app.asar'
  $backupAsar = Join-Path $loaderRoot 'backups\app.asar.original'
  if (Test-Path -LiteralPath $backupAsar) { $originalAsar = $backupAsar }
  New-HardLinkOrCopy $echoExe (Join-Path $runtimeRoot 'ECHO.exe')
  foreach ($item in Get-ChildItem -LiteralPath (Join-Path $echoRoot 'resources') -File -Force) {
    if ($item.Name -eq 'app.asar') { continue }
    New-HardLinkOrCopy $item.FullName (Join-Path (Join-Path $runtimeRoot 'resources') $item.Name)
  }
  Copy-Item -LiteralPath $originalAsar -Destination (Join-Path $runtimeRoot 'resources\app.asar') -Force
  $unpacked = Join-Path $runtimeRoot 'resources\app.asar.unpacked'
  $sourceUnpacked = Join-Path $echoRoot 'resources\app.asar.unpacked'
  try { New-Item -ItemType Junction -Path $unpacked -Target $sourceUnpacked -ErrorAction Stop | Out-Null }
  catch { Copy-Item -LiteralPath $sourceUnpacked -Destination $unpacked -Recurse -Force }
  # Keep Electron's native helper directories available in the isolated runtime.
  foreach ($item in Get-ChildItem -LiteralPath (Join-Path $echoRoot 'resources') -Directory -Force) {
    if ($item.Name -eq 'app.asar.unpacked') { continue }
    $target = Join-Path (Join-Path $runtimeRoot 'resources') $item.Name
    try { New-Item -ItemType Junction -Path $target -Target $item.FullName -ErrorAction Stop | Out-Null }
    catch { Copy-Item -LiteralPath $item.FullName -Destination $target -Recurse -Force }
  }
  New-Item -ItemType Directory -Force -Path (Join-Path $runtimeRoot 'ShinawaseLoader\backups') | Out-Null
  & $node (Join-Path $loaderRoot 'echo-asar.mjs') patch $runtimeRoot | Out-Host
  return $runtimeRoot
}

function Copy-Loader([string]$source, [string]$echoExe, $versionInfo, [bool]$EnableDirectAutoStart = $false) {
  $echoRoot = Split-Path -Parent $echoExe
  $loaderRoot = Join-Path $echoRoot 'ShinawaseLoader'
  $modsRoot = Join-Path $echoRoot 'Mods'
  $pluginsRoot = Join-Path $echoRoot 'Plugins'
  $logsRoot = Join-Path $loaderRoot 'Logs'
  New-Item -ItemType Directory -Force -Path $loaderRoot, $modsRoot, $pluginsRoot, $logsRoot | Out-Null
  Stop-Loader $loaderRoot
  Get-ChildItem -LiteralPath $source -Force | Where-Object { $_.Name -notin @('node.exe', 'loader-state.json', 'loader-debug.log', 'loader.config.json', 'Logs', 'backups') } |
    ForEach-Object { Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $loaderRoot $_.Name) -Recurse -Force }
  $node = Get-NodeRuntime $versionInfo $loaderRoot
  $configPath = Join-Path $loaderRoot 'loader.config.json'
  $config = Read-Json $configPath (Read-Json (Join-Path $source 'loader.config.json') @{})
  $config | Add-Member -NotePropertyName runtimePath -NotePropertyValue $node -Force
  if (-not $config.PSObject.Properties['autoStart']) { $config | Add-Member -NotePropertyName autoStart -NotePropertyValue $false }
  if (-not $config.PSObject.Properties['autoStartMode']) { $config | Add-Member -NotePropertyName autoStartMode -NotePropertyValue 'manual' }
  $config | Add-Member -NotePropertyName loadMode -NotePropertyValue 'external-cdp' -Force
  Write-Json $configPath $config
  & $node (Join-Path $loaderRoot 'ShinawaseLoader.mjs') init | Out-Host
  $config | Add-Member -NotePropertyName autoStart -NotePropertyValue $true -Force
  $config | Add-Member -NotePropertyName autoStartMode -NotePropertyValue 'app-asar-bridge' -Force
  Write-Json $configPath $config
  Prepare-ModdedRuntime $echoRoot $echoExe $loaderRoot $node | Out-Null
  $moddedHost = Build-ModdedHost $echoRoot $loaderRoot $echoExe
  $escapedRoot = $echoRoot.Replace('%', '%%')
  $launcherSpecs = @(
    @{ Name = 'start-echo-with-mods.cmd'; Command = 'host'; Description = 'modded host with Steam-aware ECHO child' },
    @{ Name = 'start-echo-debug.cmd'; Command = 'run --debug --web-console --log-level debug'; Description = 'development and debug logging' },
    @{ Name = 'start-echo-safe.cmd'; Command = 'run --safe-mode'; Description = 'start ECHO without Mod or Plugin injection' },
    @{ Name = 'attach-to-echo.cmd'; Command = 'attach'; Description = 'attach Loader to an already running ECHO instance' }
  )
  foreach ($spec in $launcherSpecs) {
    $launcherPath = Join-Path $loaderRoot $spec.Name
    if ($spec.Command -eq 'host') {
      @("@echo off", "setlocal", "cd /d `"$escapedRoot`"", "`"$moddedHost`" %*", "endlocal") | Set-Content -LiteralPath $launcherPath -Encoding ASCII
    } else {
      @("@echo off", "setlocal", "cd /d `"$escapedRoot`"", "`"$node`" `"%~dp0ShinawaseLoader.mjs`" $($spec.Command) --echo `"$echoExe`" %*", "endlocal") | Set-Content -LiteralPath $launcherPath -Encoding ASCII
    }
  }
  $launcher = Join-Path $loaderRoot 'start-echo-with-mods.cmd'
  if ($EnableDirectAutoStart) { Write-Host 'Direct ECHO.exe patching is no longer required; use ECHO.modded.exe for isolated loading.' -ForegroundColor DarkGray }
  Write-Host "Installed ShinawaseLoader $($versionInfo.version)" -ForegroundColor Green
  Write-Host "ECHO: $echoExe" -ForegroundColor Cyan
  Write-Host "Modded host: $moddedHost" -ForegroundColor Cyan
  Write-Host "Start with mods: $launcher" -ForegroundColor Cyan
  Write-Host "Plugins: $pluginsRoot" -ForegroundColor Cyan
  Write-Host "Logs: $logsRoot" -ForegroundColor Cyan
  Write-Host 'Dependency downloads use the user cache; protected install folders may still require Windows permission for the loader itself.' -ForegroundColor DarkGray
}

function Get-RemoteVersion {
  try { return Invoke-RestMethod -Uri "$Repo/ShinawaseLoader/loader-version.json" -TimeoutSec 15 } catch { return $null }
}

function Download-RemoteSource {
  $zip = Join-Path ([IO.Path]::GetTempPath()) "shinawase-loader-$([guid]::NewGuid()).zip"
  $dir = Join-Path ([IO.Path]::GetTempPath()) "shinawase-loader-$([guid]::NewGuid())"
  Download-File $Archive $zip
  Expand-Archive -LiteralPath $zip -DestinationPath $dir -Force
  Remove-Item -LiteralPath $zip -Force -ErrorAction SilentlyContinue
  $source = Get-ChildItem -LiteralPath $dir -Directory | Select-Object -First 1
  if (-not $source) { Remove-Item -LiteralPath $dir -Recurse -Force; throw 'Remote source archive is empty.' }
  return @{ Path = (Join-Path $source.FullName 'ShinawaseLoader'); Temp = $dir }
}

function Invoke-Install($selectedExe, [bool]$Update, [bool]$EnableDirectAutoStart = $false) {
  $loaderRoot = Join-Path (Split-Path -Parent $selectedExe) 'ShinawaseLoader'
  $localVersion = Read-Json (Join-Path $LocalSource 'loader-version.json') $null
  $versionInfo = $localVersion
  $remote = $null
  $useRemote = $false
  if ($Update) {
    $remote = Get-RemoteVersion
    if ($remote -and (Test-VersionGreater $remote.version $localVersion.version)) { $versionInfo = $remote; $useRemote = $true }
  }
  $remoteSource = $null
  try {
    if ($useRemote -and (Read-Version (Join-Path $loaderRoot 'loader-version.json'))) {
      if ([version]$remote.version -gt [version](Read-Version (Join-Path $loaderRoot 'loader-version.json'))) { $remoteSource = Download-RemoteSource }
    }
    $installSource = if ($remoteSource) { $remoteSource.Path } else { $LocalSource }
    Copy-Loader $installSource $selectedExe $versionInfo $EnableDirectAutoStart
  } finally { if ($remoteSource) { Remove-Item -LiteralPath $remoteSource.Temp -Recurse -Force -ErrorAction SilentlyContinue } }
}

function Show-Status($selectedExe) {
  $root = Split-Path -Parent $selectedExe
  $remote = Get-RemoteVersion
  [pscustomobject]@{
    ECHO = $selectedExe
    Loader = Join-Path $root 'ShinawaseLoader'
    Local = Read-Version (Join-Path $LocalSource 'loader-version.json')
    Installed = Read-Version (Join-Path $root 'ShinawaseLoader\loader-version.json')
    Remote = $(if ($remote) { $remote.version } else { 'unavailable' })
    Launcher = Join-Path $root 'ShinawaseLoader\start-echo-with-mods.cmd'
  } | Format-List
}

function Invoke-Uninstall($selectedExe) {
  $root = Split-Path -Parent $selectedExe
  $loaderRoot = Join-Path $root 'ShinawaseLoader'
  $node = Join-Path $loaderRoot 'node.exe'
  $asar = Join-Path $loaderRoot 'echo-asar.mjs'
  if ((Test-Path -LiteralPath $node) -and (Test-Path -LiteralPath $asar)) {
    $restoreArgs = @($asar, 'restore', $root)
    if ($Force) { $restoreArgs += '--force' }
    & $node @restoreArgs | Out-Host
  }
  Stop-Loader $loaderRoot
  Remove-Item -LiteralPath $loaderRoot -Recurse -Force -ErrorAction Stop
  Write-Host "Loader removed. Mods and Plugins kept at $(Join-Path $root 'Mods') and $(Join-Path $root 'Plugins')." -ForegroundColor Green
}

function Pause-Menu { [void](Read-Host 'Press Enter to continue') }

function Invoke-Menu {
  $selected = $null
  while ($true) {
    Clear-Host
    $version = Read-Version (Join-Path $LocalSource 'loader-version.json')
    Write-Host "$Logo  $version" -ForegroundColor White
    Write-Host '──────────' -ForegroundColor DarkGray
    Write-Host ("target  " + $(if ($selected) { $selected } else { 'not selected' })) -ForegroundColor DarkGray
    Write-Host ''
    Write-Host '  1  install / update'
    Write-Host '  2  status'
    Write-Host '  3  launch'
    Write-Host '  4  choose ECHO'
    Write-Host '  5  uninstall loader'
    Write-Host '  6  isolated runtime (ECHO.modded.exe)'
    Write-Host '  0  exit' -ForegroundColor DarkGray
    switch ((Read-Host 'select').Trim()) {
      '1' { try { if (-not $selected) { $selected = Resolve-EchoExecutable }; Invoke-Install $selected $true ([bool]$PatchApp) } catch { Write-Host $_.Exception.Message -ForegroundColor Red }; Pause-Menu }
      '2' { try { if (-not $selected) { $selected = Resolve-EchoExecutable }; Show-Status $selected } catch { Write-Host $_.Exception.Message -ForegroundColor Red }; Pause-Menu }
      '3' { try { if (-not $selected) { $selected = Resolve-EchoExecutable }; $root = Split-Path -Parent $selected; $launcher = Join-Path $root 'ShinawaseLoader\start-echo-with-mods.cmd'; if (-not (Test-Path $launcher)) { Invoke-Install $selected $false ([bool]$PatchApp) }; Start-Process -FilePath $launcher; Write-Host 'ECHO launched.' -ForegroundColor Green } catch { Write-Host $_.Exception.Message -ForegroundColor Red }; Pause-Menu }
      '4' { try { $choice = Select-EchoExecutable $null; if ($choice) { $selected = [IO.Path]::GetFullPath($choice); Write-Json $SelectionFile @{ echoExe = $selected } } } catch { Write-Host $_.Exception.Message -ForegroundColor Red }; Pause-Menu }
      '5' { try { if (-not $selected) { $selected = Resolve-EchoExecutable }; Invoke-Uninstall $selected; $selected = $null } catch { Write-Host $_.Exception.Message -ForegroundColor Red }; Pause-Menu }
      '6' { try { if (-not $selected) { $selected = Resolve-EchoExecutable }; Invoke-Install $selected $false $true; Write-Host 'Direct ECHO.exe auto start is enabled.' -ForegroundColor Green } catch { Write-Host $_.Exception.Message -ForegroundColor Red }; Pause-Menu }
      '0' { return }
      default { Write-Host 'Invalid choice.' -ForegroundColor Yellow; Pause-Menu }
    }
  }
}

try {
  if ($Action -eq 'menu') { Invoke-Menu; return }
  $selected = Resolve-EchoExecutable
  switch ($Action) {
    'install' { Invoke-Install $selected $false ([bool]$PatchApp) }
    'update' { Invoke-Install $selected $true ([bool]$PatchApp) }
    'check' { Show-Status $selected }
    'launch' { $root = Split-Path -Parent $selected; $launcher = Join-Path $root 'ShinawaseLoader\start-echo-with-mods.cmd'; if (-not (Test-Path $launcher)) { Invoke-Install $selected $false ([bool]$PatchApp) }; Start-Process -FilePath $launcher }
    'uninstall' { Invoke-Uninstall $selected }
  }
} catch {
  Write-Host "`nSetup failed: $($_.Exception.Message)" -ForegroundColor Red
  exit 1
}
