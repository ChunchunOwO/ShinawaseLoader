[CmdletBinding()]
param(
  [ValidateSet('install', 'update', 'uninstall', 'check', 'launch', 'menu')]
  [string]$Action = 'menu',
  [string]$EchoRoot,
  [switch]$Force,
  # Accepted for older callers. Install always builds an isolated runtime and
  # never patches the Steam resources\app.asar.
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
$script:Strings = @{
  zh = @{
    choose = '选择语言'
    target = '目标'
    notSelected = '未选择'
    install = '安装 / 更新'
    status = '状态'
    launch = '启动'
    chooseEcho = '选择 ECHO'
    uninstall = '卸载 Loader'
    isolated = '隔离运行时 (ECHO.modded.exe)'
    exit = '退出'
    select = '选择'
    pressEnter = '按 Enter 继续'
    invalid = '无效选项。'
    launched = '已启动'
    failed = '失败'
    language = '语言'
    menuHint = '数字键或 ↑↓ 选中    Enter 确认'
    extrasTitle = '可选包'
    extrasHint = '数字键或 ↑↓ 选中    空格 开关    Enter 下一步'
    pkgStreaming = 'ECHO Streaming'
    pkgPet = 'ECHO Classic Pet'
    pkgOsu = 'ECHO osu!downloader'
    pkgAudioBand = 'ECHO AudioBand'
    pkgMv = 'ECHO MV'
    pkgWallpaper = 'ECHO Wallpaper Bridge'
    progressPrepare = '准备目录'
    progressCopy = '复制 Loader'
    progressNode = '准备 Node 运行时'
    progressInit = '初始化运行时'
    progressRuntime = '构建隔离运行时'
    progressHost = '编译 ECHO.modded.exe'
    progressLaunchers = '写入启动器'
    progressPackages = '安装可选包'
    progressLaunch = '启动 ECHO'
    progressDone = '完成'
    openingEcho = '正在打开 ECHO...'
  }
  en = @{
    choose = 'Choose language'
    target = 'target'
    notSelected = 'not selected'
    install = 'install / update'
    status = 'status'
    launch = 'launch'
    chooseEcho = 'choose ECHO'
    uninstall = 'uninstall loader'
    isolated = 'isolated runtime (ECHO.modded.exe)'
    exit = 'exit'
    select = 'select'
    pressEnter = 'Press Enter to continue'
    invalid = 'Invalid choice.'
    launched = 'launched'
    failed = 'failed'
    language = 'language'
    menuHint = 'Number or arrows to select    Enter to confirm'
    extrasTitle = 'optional packages'
    extrasHint = 'Number or arrows    Space toggle    Enter next'
    pkgStreaming = 'ECHO Streaming'
    pkgPet = 'ECHO Classic Pet'
    pkgOsu = 'ECHO osu!downloader'
    pkgAudioBand = 'ECHO AudioBand'
    pkgMv = 'ECHO MV'
    pkgWallpaper = 'ECHO Wallpaper Bridge'
    progressPrepare = 'prepare folders'
    progressCopy = 'copy loader'
    progressNode = 'prepare Node runtime'
    progressInit = 'initialize runtime'
    progressRuntime = 'build isolated runtime'
    progressHost = 'compile ECHO.modded.exe'
    progressLaunchers = 'write launchers'
    progressPackages = 'install packages'
    progressLaunch = 'start ECHO'
    progressDone = 'done'
    openingEcho = 'Opening ECHO...'
  }
}
function Get-LoaderLocale {
  $saved = Read-Json $SelectionFile @{}
  if ($saved.locale -in @('zh', 'en')) { return $saved.locale }
  $cfg = Read-Json (Join-Path $LocalSource 'loader.config.json') @{}
  if ($cfg.locale -in @('zh', 'en')) { return $cfg.locale }
  return $null
}
function Set-LoaderLocale([string]$value) {
  $saved = Read-Json $SelectionFile @{}
  if (-not $saved) { $saved = [pscustomobject]@{} }
  $saved | Add-Member -NotePropertyName locale -NotePropertyValue $value -Force
  if ($saved.echoExe) { Write-Json $SelectionFile $saved } else { Write-Json $SelectionFile @{ locale = $value } }
  $cfgPath = Join-Path $LocalSource 'loader.config.json'
  $cfg = Read-Json $cfgPath @{}
  $cfg | Add-Member -NotePropertyName locale -NotePropertyValue $value -Force
  Write-Json $cfgPath $cfg
  $script:Locale = $value
}
function T([string]$key) {
  $table = $script:Strings[$script:Locale]
  if (-not $table) { $table = $script:Strings.zh }
  if ($table.ContainsKey($key)) { return $table[$key] }
  return $key
}

function Add-SetupNative {
  if ('Shinawase.SetupNative' -as [type]) { return }
  Add-Type -Namespace Shinawase -Name SetupNative -MemberDefinition @'
[DllImport("kernel32.dll")] public static extern IntPtr GetConsoleWindow();
[DllImport("kernel32.dll")] public static extern IntPtr GetStdHandle(int nStdHandle);
[DllImport("kernel32.dll")] public static extern bool GetConsoleMode(IntPtr hConsoleHandle, out int lpMode);
[DllImport("kernel32.dll")] public static extern bool SetConsoleMode(IntPtr hConsoleHandle, int dwMode);
[DllImport("user32.dll")] public static extern bool PostMessage(IntPtr hWnd, uint Msg, IntPtr wParam, IntPtr lParam);
'@
}

function Initialize-SetupConsole {
  if ($script:ConsoleReady) { return }
  try { $Host.UI.RawUI.WindowTitle = 'ShinawaseLoader - Setup' } catch {}
  try {
    [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false
    $OutputEncoding = [Console]::OutputEncoding
  } catch {}
  try { [Console]::CursorVisible = $false } catch {}
  try {
    Add-SetupNative
    $handle = [Shinawase.SetupNative]::GetStdHandle(-11)
    $mode = 0
    if ([Shinawase.SetupNative]::GetConsoleMode($handle, [ref]$mode)) {
      $script:VtEnabled = [Shinawase.SetupNative]::SetConsoleMode($handle, ($mode -bor 4))
    }
  } catch { $script:VtEnabled = $false }
  $script:ConsoleReady = $true
}

function Test-SetupOwnedWindow {
  if ($env:TERM_PROGRAM -or $env:VSCODE_PID -or $env:VSCODE_INJECTION) { return $false }
  try {
    $me = Get-CimInstance Win32_Process -Filter "ProcessId=$PID" -ErrorAction Stop
    $parent = Get-CimInstance Win32_Process -Filter "ProcessId=$($me.ParentProcessId)" -ErrorAction Stop
    $name = [IO.Path]::GetFileNameWithoutExtension([string]$parent.Name).ToLowerInvariant()
    $cmdLine = [string]$parent.CommandLine
    if ($name -in @('cursor', 'code', 'devenv', 'windowsterminal')) { return $false }
    if ($name -in @('powershell', 'pwsh') -and $cmdLine -notmatch 'setup-modloader') { return $false }
    return $true
  } catch { return $true }
}

function Exit-Setup([int]$Code = 0) {
  try { $Host.UI.RawUI.WindowTitle = 'ShinawaseLoader - Setup' } catch {}
  if (Test-SetupOwnedWindow) {
    try {
      $me = Get-CimInstance Win32_Process -Filter "ProcessId=$PID" -ErrorAction SilentlyContinue
      $parent = Get-CimInstance Win32_Process -Filter "ProcessId=$($me.ParentProcessId)" -ErrorAction SilentlyContinue
      $name = [IO.Path]::GetFileNameWithoutExtension([string]$parent.Name).ToLowerInvariant()
      $cmdLine = [string]$parent.CommandLine
      if ($name -eq 'cmd' -and $cmdLine -match 'setup-modloader') {
        Stop-Process -Id $parent.ProcessId -Force -ErrorAction SilentlyContinue
      }
    } catch {}
    try {
      Add-SetupNative
      $hwnd = [Shinawase.SetupNative]::GetConsoleWindow()
      if ($hwnd -ne [IntPtr]::Zero) {
        [void][Shinawase.SetupNative]::PostMessage($hwnd, 0x0010, [IntPtr]::Zero, [IntPtr]::Zero)
      }
    } catch {}
  }
  [Environment]::Exit($Code)
}

function Get-DisplayWidth([string]$Text) {
  $width = 0
  foreach ($ch in [regex]::Replace([string]$Text, '\x1b\[[0-9;]*m', '').ToCharArray()) {
    if ([int][char]$ch -gt 127) { $width += 2 } else { $width += 1 }
  }
  return $width
}

function ConvertTo-ShimmerText([string]$Text, [int]$Phase) {
  $chars = $Text.ToCharArray()
  if ($chars.Length -le 0) { return $Text }
  if (-not $script:VtEnabled) {
    return $Text
  }
  $esc = [char]27
  $len = $chars.Length
  $span = [math]::Max(10, $len + 6)
  $head = $Phase % $span
  $sb = New-Object System.Text.StringBuilder ($len * 20)
  for ($i = 0; $i -lt $len; $i++) {
    $d = [math]::Abs($i - $head)
    if ($d -gt ($span - $d)) { $d = $span - $d }
    $t = [math]::Max(0.0, 1.0 - ($d / 4.5))
    $r = [int](50 + 205 * $t)
    $g = [int](140 + 115 * $t)
    $b = [int](175 + 80 * $t)
    [void]$sb.Append(($esc.ToString() + '[38;2;' + $r + ';' + $g + ';' + $b + 'm' + $chars[$i]))
  }
  [void]$sb.Append($esc)
  [void]$sb.Append('[0m')
  return $sb.ToString()
}

function Write-SetupRow([string]$Text, [int]$Width, [string]$Color = 'DarkGray', [switch]$Shimmer, [int]$Phase = 0) {
  $plain = [regex]::Replace([string]$Text, '\x1b\[[0-9;]*m', '')
  if ($plain.Length -gt 200) { $plain = $plain.Substring(0, 200) }
  $rendered = if ($Shimmer) { ConvertTo-ShimmerText $plain $Phase } else { $plain }
  $pad = [math]::Max(0, $Width - (Get-DisplayWidth $plain))
  $prev = $null
  try {
    $prev = [Console]::ForegroundColor
    if (-not $Shimmer -or -not $script:VtEnabled) {
      [Console]::ForegroundColor = [ConsoleColor]::$Color
    }
  } catch {}
  [Console]::Write($rendered)
  if ($pad -gt 0) { [Console]::Write((' ' * $pad)) }
  try { if ($null -ne $prev) { [Console]::ForegroundColor = $prev } } catch {}
  [Console]::WriteLine()
}

function Write-SetupLine([string]$Text, [string]$Color = 'Gray') {
  if ($null -eq $Text) { $Text = '' }
  Write-Host $Text -ForegroundColor $Color
}

function Get-LogoArt {
  return @(
    '███████╗██╗  ██╗██╗███╗   ██╗ █████╗ ██╗    ██╗ █████╗ ███████╗███████╗',
    '██╔════╝██║  ██║██║████╗  ██║██╔══██╗██║    ██║██╔══██╗██╔════╝██╔════╝',
    '███████╗███████║██║██╔██╗ ██║███████║██║ █╗ ██║███████║███████╗█████╗  ',
    '╚════██║██╔══██║██║██║╚██╗██║██╔══██║██║███╗██║██╔══██║╚════██║██╔══╝  ',
    '███████║██║  ██║██║██║ ╚████║██║  ██║╚███╔███╔╝██║  ██║███████║███████╗',
    '╚══════╝╚═╝  ╚═╝╚═╝╚═╝  ╚═══╝╚═╝  ╚═╝ ╚══╝╚══╝ ╚═╝  ╚═╝╚══════╝╚══════╝'
  )
}

function Get-LogoLines {
  $art = Get-LogoArt
  try {
    if ([Console]::WindowWidth -le $art[0].Length) { return @('  SHINAWASE') }
  } catch { return @('  SHINAWASE') }
  return $art
}

function Write-SetupHeader {
  param(
    [string]$Subtitle,
    [string[]]$Meta
  )
  Initialize-SetupConsole
  Clear-Host
  $lines = Get-LogoLines
  try {
    if ($lines.Count -gt 1) {
      $top = [Console]::CursorTop
      [Console]::Write($lines[0])
      $wrapped = [Console]::CursorTop -ne $top
      [Console]::SetCursorPosition(0, $top)
      [Console]::Write((' ' * [math]::Max(1, [Console]::WindowWidth - 1)))
      [Console]::SetCursorPosition(0, $top)
      if ($wrapped) { $lines = @('  SHINAWASE') }
    }
  } catch {}
  foreach ($line in $lines) { Write-Host $line -ForegroundColor White }
  if ($Subtitle) { Write-Host $Subtitle -ForegroundColor DarkGray }
  Write-Host ''
  foreach ($line in @($Meta)) { if ($line) { Write-Host $line -ForegroundColor DarkGray } }
  if ($Meta -and @($Meta).Count) { Write-Host '' }
}

function Write-SetupItems {
  param(
    [object[]]$Items,
    [int]$Index = 0,
    [string]$Hint,
    [int]$Phase = 0
  )
  $list = @($Items)
  $width = 79
  try { $width = [math]::Max(20, [Console]::WindowWidth - 1) } catch {}
  for ($i = 0; $i -lt $list.Count; $i++) {
    $item = $list[$i]
    $mark = '  '
    if ($null -ne $item.Checked) { $mark = $(if ($item.Checked) { ' [*] ' } else { ' [ ] ' }) }
    $text = ('  {0}{1}{2}' -f $item.Key, $mark, $item.Label)
    if ($i -eq $Index) {
      if ($script:VtEnabled) {
        Write-SetupRow $text $width -Color 'Cyan' -Shimmer -Phase $Phase
      } else {
        $color = if (([int]($Phase / 6) % 2) -eq 0) { 'White' } else { 'Cyan' }
        Write-SetupRow $text $width -Color $color
      }
    } else {
      Write-SetupRow $text $width -Color 'DarkGray'
    }
  }
  Write-SetupRow '' $width
  if ($Hint) { Write-SetupRow ('  ' + $Hint) $width -Color 'DarkGray' } else { Write-SetupRow '' $width }
}

function Read-MenuKey([int]$TimeoutMs = 40) {
  $deadline = [Environment]::TickCount + [math]::Max(10, $TimeoutMs)
  while (-not [Console]::KeyAvailable) {
    if ([Environment]::TickCount -ge $deadline) { return $null }
    Start-Sleep -Milliseconds 8
  }
  return [Console]::ReadKey($true)
}

function Get-MenuDigit($key) {
  $ch = [string]$key.KeyChar
  if ($ch -match '^[0-9]$') { return $ch }
  switch ($key.Key) {
    'D0' { return '0' } 'D1' { return '1' } 'D2' { return '2' } 'D3' { return '3' } 'D4' { return '4' }
    'D5' { return '5' } 'D6' { return '6' } 'D7' { return '7' } 'D8' { return '8' } 'D9' { return '9' }
    'NumPad0' { return '0' } 'NumPad1' { return '1' } 'NumPad2' { return '2' } 'NumPad3' { return '3' }
    'NumPad4' { return '4' } 'NumPad5' { return '5' } 'NumPad6' { return '6' } 'NumPad7' { return '7' }
    'NumPad8' { return '8' } 'NumPad9' { return '9' }
  }
  return $null
}

function Read-ConsoleMenu {
  param(
    [string]$Subtitle,
    [string[]]$Meta,
    [string[]]$Labels,
    [string[]]$Values,
    [int]$Index = 0,
    [string]$Hint,
    [string]$CancelValue
  )
  if (-not $Values) {
    $Values = @()
    for ($i = 0; $i -lt $Labels.Count; $i++) { $Values += [string]($i + 1) }
  }
  $items = @()
  for ($i = 0; $i -lt $Labels.Count; $i++) { $items += [pscustomobject]@{ Key = $Values[$i]; Label = $Labels[$i]; Checked = $null } }
  $visible = $true
  try { $visible = [Console]::CursorVisible; [Console]::CursorVisible = $false } catch {}
  $script:ProgressStarted = $false
  Write-SetupHeader -Subtitle $Subtitle -Meta $Meta
  $menuTop = 0
  $phase = 0
  try { $menuTop = [Console]::CursorTop } catch {}
  try {
    while ($true) {
      try { [Console]::SetCursorPosition(0, $menuTop) } catch { Write-SetupHeader -Subtitle $Subtitle -Meta $Meta; $menuTop = [Console]::CursorTop }
      Write-SetupItems -Items $items -Index $Index -Hint $Hint -Phase $phase
      $key = Read-MenuKey 40
      if (-not $key) { $phase += 1; continue }
      switch ($key.Key) {
        'UpArrow' { $Index = ($Index + $Labels.Count - 1) % $Labels.Count }
        'DownArrow' { $Index = ($Index + 1) % $Labels.Count }
        'Enter' { return $Values[$Index] }
        'Escape' { if ($CancelValue) { return $CancelValue } }
        default {
          $digit = Get-MenuDigit $key
          if ($digit) {
            $found = [array]::IndexOf(@($Values), $digit)
            if ($found -ge 0) { $Index = $found }
          }
        }
      }
    }
  } finally {
    try { [Console]::CursorVisible = $visible } catch {}
  }
}

function Choose-LoaderLocale {
  $current = Get-LoaderLocale
  if ($current) { $script:Locale = $current; return }
  $picked = Read-ConsoleMenu -Meta @('  选择语言 / Choose language') -Labels @('中文', 'English') -Values @('1', '2') -Hint '数字键或 ↑↓ 选中    Enter 确认 / Number or arrows    Enter'
  if ($picked -eq '2') { Set-LoaderLocale 'en' } else { Set-LoaderLocale 'zh' }
}
$script:Locale = 'zh'

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

# 26.8.28 Steam ships ECHO.exe. NEXT / Playtest / Steam suffixes are leftover
# names from older builds; still accepted so a previous install folder resolves.
$script:EchoGameExePattern = '^ECHO(?:\s+(?:NEXT|Playtest|Steam))?\.exe$'

function Test-EchoPlaytest([string]$ExePath) {
  $normalized = ([string]$ExePath).Replace('/', '\')
  $name = [IO.Path]::GetFileName($normalized)
  $parent = [IO.Path]::GetFileName([IO.Path]::GetDirectoryName($normalized))
  return [bool]($name -imatch '^ECHO Playtest\.exe$' -or $parent -imatch 'ECHO Playtest' -or $normalized -imatch '\\ECHO Playtest\\')
}

function Get-EchoInstallRank([string]$ExePath) {
  $normalized = ([string]$ExePath).Replace('/', '\')
  $name = [IO.Path]::GetFileName($normalized)
  $parent = [IO.Path]::GetFileName([IO.Path]::GetDirectoryName($normalized))
  if (Test-EchoPlaytest $normalized) { return 80 }
  if ($name -match '(?i)^ECHO NEXT\.exe$' -or $parent -match '(?i)^ECHO NEXT$') { return 70 }
  if ($normalized -match '(?i)\\common\\ECHO\\ECHO\.exe$') { return 0 }
  if ($name -ieq 'ECHO Steam.exe') { return 10 }
  if ($name -ieq 'ECHO.exe') { return 20 }
  return 40
}

function Write-CmdFile([string]$Path, [string[]]$Lines) {
  $text = ($Lines -join "`r`n") + "`r`n"
  $utf8Bom = New-Object System.Text.UTF8Encoding $true
  [IO.File]::WriteAllText($Path, $text, $utf8Bom)
}

function Get-EchoCandidates([string]$Hint) {
  if ($Hint -and (Test-Path -LiteralPath $Hint -PathType Leaf)) { return @([IO.Path]::GetFullPath($Hint)) }
  if ($Hint -and (Test-Path -LiteralPath $Hint -PathType Container)) {
    $direct = @(Get-ChildItem -LiteralPath $Hint -Filter '*.exe' -File -ErrorAction SilentlyContinue | Where-Object { $_.Name -match $script:EchoGameExePattern })
    if ($direct.Count -eq 1) { return @($direct[0].FullName) }
    $preferred = @($direct | Where-Object { $_.Name -ieq 'ECHO.exe' -and -not (Test-EchoPlaytest $_.FullName) })
    if (-not $preferred.Count) { $preferred = @($direct | Where-Object { $_.Name -ieq 'ECHO Steam.exe' }) }
    if ($preferred.Count -eq 1) { return @($preferred[0].FullName) }
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
      $items = Get-ChildItem -LiteralPath $root -Filter 'ECHO*.exe' -File -Recurse -Depth 3 -ErrorAction SilentlyContinue
      foreach ($item in $items) {
        if ($item.Name -match $script:EchoGameExePattern) { Add-UniquePath $found $item.FullName }
      }
    } catch { }
  }
  $files = @($found | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } | Sort-Object -Unique)
  return @($files | Sort-Object { Get-EchoInstallRank $_ }, { $_ })
}

function Select-EchoExecutable([string]$Hint) {
  if (-not $Hint) {
    Clear-Host
    foreach ($line in Get-LogoLines) { Write-SetupLine $line 'White' }
    Write-SetupLine ''
    Write-SetupLine $(if ($script:Locale -eq 'en') { '  looking for ECHO...' } else { '  正在查找 ECHO...' }) 'DarkGray'
  }
  $candidates = @(Get-EchoCandidates $Hint)
  if (-not $Hint) {
    $stable = @($candidates | Where-Object { -not (Test-EchoPlaytest $_) })
    if ($stable.Count) { $candidates = $stable }
  }
  if ($candidates.Count -eq 1 -and ($Hint -or -not (Test-EchoPlaytest $candidates[0]))) { return $candidates[0] }
  if (-not $candidates.Count) {
    Clear-Host
    foreach ($line in Get-LogoLines) { Write-SetupLine $line 'White' }
    Write-SetupLine ''
    $manual = Read-Host 'ECHO directory or executable (0 = back)'
    if ($manual -eq '0' -or [string]::IsNullOrWhiteSpace($manual)) { return $null }
    $retry = @(Get-EchoCandidates $manual.Trim())
    if ($retry.Count -eq 1) { return $retry[0] }
    throw "No ECHO executable found under '$manual'."
  }
  $labels = @($candidates)
  $values = @()
  for ($i = 0; $i -lt $candidates.Count; $i++) { $values += [string]($i + 1) }
  $labels += @((T 'chooseEcho'), (T 'exit'))
  $values += @('M', '0')
  $choice = Read-ConsoleMenu -Meta @('ECHO') -Labels $labels -Values $values -Hint (T 'menuHint') -CancelValue '0'
  if ($choice -eq '0') { return $null }
  if ($choice -eq 'M') {
    Clear-Host
    foreach ($line in Get-LogoLines) { Write-SetupLine $line 'White' }
    Write-SetupLine ''
    return Select-EchoExecutable (Read-Host 'ECHO directory')
  }
  $number = 0
  if ([int]::TryParse($choice, [ref]$number) -and $number -ge 1 -and $number -le $candidates.Count) { return $candidates[$number - 1] }
  return $null
}

function Resolve-EchoExecutable {
  if (-not $EchoRoot) {
    if ($env:ECHO_EXE) { $EchoRoot = $env:ECHO_EXE }
    elseif ($env:ECHO_ROOT) { $EchoRoot = $env:ECHO_ROOT }
    elseif ($env:ECHO_INSTALL_ROOT) { $EchoRoot = $env:ECHO_INSTALL_ROOT }
  }
  $path = Select-EchoExecutable $EchoRoot
  if (-not $path) { throw 'ECHO selection cancelled.' }
  $path = [IO.Path]::GetFullPath($path)
  Write-Json $SelectionFile @{ echoExe = $path; locale = $script:Locale; selectedAt = (Get-Date).ToUniversalTime().ToString('o') }
  return $path
}

function Write-SetupProgress([int]$Percent, [string]$Label) {
  Initialize-SetupConsole
  if (-not $script:ProgressStarted) {
    Clear-Host
    foreach ($line in Get-LogoLines) { Write-SetupLine $line 'White' }
    Write-SetupLine ''
    try { $script:ProgressRow = [Console]::CursorTop } catch { $script:ProgressRow = 0 }
    $script:ProgressStarted = $true
  }
  try { [Console]::SetCursorPosition(0, $script:ProgressRow) } catch {}
  $Percent = [math]::Max(0, [math]::Min(100, $Percent))
  $fill = [int][math]::Floor(28 * $Percent / 100.0)
  $bar = ('#' * $fill) + ('-' * (28 - $fill))
  Write-SetupLine (('  [{0}]  {1,3}%  {2}' -f $bar, $Percent, $Label)) 'Cyan'
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
  & $compiler /nologo /target:winexe /optimize+ /win32icon:$icon /out:$target $source | Out-Null
  if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $target)) { throw 'ECHO.modded.exe compilation failed.' }
  return $target
}

function Prepare-ModdedRuntime([string]$echoRoot, [string]$echoExe, [string]$loaderRoot, [string]$node) {
  $runtimeRoot = Join-Path $loaderRoot 'modded-runtime'
  if (Test-Path -LiteralPath $runtimeRoot) { Remove-Item -LiteralPath $runtimeRoot -Recurse -Force }
  New-Item -ItemType Directory -Force -Path (Join-Path $runtimeRoot 'resources') | Out-Null

  foreach ($item in Get-ChildItem -LiteralPath $echoRoot -File -Force) {
    if ($item.Extension -ieq '.exe' -and $item.Name -match '^ECHO') { continue }
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
  # Electron 43.3 embeds the asar header SHA256 in the exe. Copy (never
  # hardlink) ECHO.exe so echo-asar.mjs can rewrite that hash after patching
  # the isolated app.asar without touching the Steam original.
  Copy-Item -LiteralPath $echoExe -Destination (Join-Path $runtimeRoot 'ECHO.exe') -Force
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
  & $node (Join-Path $loaderRoot 'echo-asar.mjs') patch $runtimeRoot
  if ($LASTEXITCODE -ne 0) { throw 'Isolated runtime app.asar patch failed.' }
  return $runtimeRoot
}

function Copy-Loader([string]$source, [string]$echoExe, $versionInfo, [bool]$EnableDirectAutoStart = $false) {
  $echoRoot = Split-Path -Parent $echoExe
  $loaderRoot = Join-Path $echoRoot 'ShinawaseLoader'
  $modsRoot = Join-Path $echoRoot 'Mods'
  $pluginsRoot = Join-Path $echoRoot 'Plugins'
  $logsRoot = Join-Path $loaderRoot 'Logs'
  Write-SetupProgress 8 (T 'progressPrepare')
  New-Item -ItemType Directory -Force -Path $loaderRoot, $modsRoot, $pluginsRoot, $logsRoot | Out-Null
  Stop-Loader $loaderRoot
  Write-SetupProgress 22 (T 'progressCopy')
  Get-ChildItem -LiteralPath $source -Force | Where-Object { $_.Name -notin @('node.exe', 'loader-state.json', 'loader-debug.log', 'loader.config.json', 'Logs', 'backups') } |
    ForEach-Object { Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $loaderRoot $_.Name) -Recurse -Force }
  Write-SetupProgress 38 (T 'progressNode')
  $node = Get-NodeRuntime $versionInfo $loaderRoot
  $configPath = Join-Path $loaderRoot 'loader.config.json'
  $config = Read-Json $configPath (Read-Json (Join-Path $source 'loader.config.json') @{})
  $config | Add-Member -NotePropertyName runtimePath -NotePropertyValue $node -Force
  if (-not $config.PSObject.Properties['autoStart']) { $config | Add-Member -NotePropertyName autoStart -NotePropertyValue $false }
  if (-not $config.PSObject.Properties['autoStartMode']) { $config | Add-Member -NotePropertyName autoStartMode -NotePropertyValue 'manual' }
  $config | Add-Member -NotePropertyName loadMode -NotePropertyValue 'external-cdp' -Force
  if ($script:Locale) { $config | Add-Member -NotePropertyName locale -NotePropertyValue $script:Locale -Force }
  Write-Json $configPath $config
  Write-SetupProgress 52 (T 'progressInit')
  & $node (Join-Path $loaderRoot 'ShinawaseLoader.mjs') init | Out-Null
  # The streaming bridge needs @neteasecloudmusicapienhanced/api installed next
  # to streaming-bridge.cjs (see ShinawaseLoader/package.json); without it the
  # netease provider falls back to raw HTTP endpoints that now return 404.
  if (Test-Path -LiteralPath (Join-Path $loaderRoot 'package.json')) {
    Write-SetupProgress 58 'streaming bridge deps (npm install)'
    $npmCmd = Get-Command npm.cmd -ErrorAction SilentlyContinue
    if (-not $npmCmd) { $npmCmd = Get-Command npm -ErrorAction SilentlyContinue }
    if ($npmCmd) {
      try {
        Push-Location $loaderRoot
        & $npmCmd.Source install --omit=dev --no-audit --no-fund 2>&1 | Out-Null
      } catch {
        Write-Host "npm install failed: $($_.Exception.Message) - netease streaming stays degraded until dependencies are installed." -ForegroundColor Yellow
      } finally { Pop-Location }
    } else {
      Write-Host 'npm not found - run "npm install --omit=dev" inside the ShinawaseLoader folder to enable netease streaming playback.' -ForegroundColor Yellow
    }
  }
  $config | Add-Member -NotePropertyName autoStart -NotePropertyValue $true -Force
  $config | Add-Member -NotePropertyName autoStartMode -NotePropertyValue 'app-asar-bridge' -Force
  Write-Json $configPath $config
  Write-SetupProgress 70 (T 'progressRuntime')
  Prepare-ModdedRuntime $echoRoot $echoExe $loaderRoot $node | Out-Null
  Write-SetupProgress 86 (T 'progressHost')
  $moddedHost = Build-ModdedHost $echoRoot $loaderRoot $echoExe
  Write-SetupProgress 94 (T 'progressLaunchers')
  $escapedRoot = $echoRoot.Replace('%', '%%')
  $launcherSpecs = @(
    @{ Name = 'start-echo-with-mods.cmd'; Command = 'host' },
    @{ Name = 'start-echo-debug.cmd'; Command = 'run --debug --log-level debug' },
    @{ Name = 'start-echo-safe.cmd'; Command = 'run --safe-mode' },
    @{ Name = 'attach-to-echo.cmd'; Command = 'attach' }
  )
  foreach ($spec in $launcherSpecs) {
    $launcherPath = Join-Path $loaderRoot $spec.Name
    if ($spec.Command -eq 'host') {
      Write-CmdFile $launcherPath @('@echo off', 'chcp 65001 >nul', "cd /d `"$escapedRoot`"", "start `"`" `"$moddedHost`" %*")
    } else {
      Write-CmdFile $launcherPath @('@echo off', 'chcp 65001 >nul', "cd /d `"$escapedRoot`"", "start `"`" `"$node`" `"%~dp0ShinawaseLoader.mjs`" $($spec.Command) --echo `"$echoExe`" %*")
    }
  }
  Write-SetupProgress 100 (T 'progressDone')
  return @{ Launcher = (Join-Path $loaderRoot 'start-echo-with-mods.cmd'); Node = $node; LoaderRoot = $loaderRoot; EchoRoot = $echoRoot }
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
    return Copy-Loader $installSource $selectedExe $versionInfo $EnableDirectAutoStart
  } finally { if ($remoteSource) { Remove-Item -LiteralPath $remoteSource.Temp -Recurse -Force -ErrorAction SilentlyContinue } }
}

function Get-ExamplePackagePath([string]$folderName) {
  $pack = Join-Path $ProjectRoot ("examples\packages\{0}.echomod" -f $folderName)
  if (Test-Path -LiteralPath $pack) { return $pack }
  $source = Join-Path $ProjectRoot ("examples\{0}\echomod" -f $folderName)
  if (-not (Test-Path -LiteralPath $source)) { return $null }
  New-Item -ItemType Directory -Force -Path (Join-Path $ProjectRoot 'examples\packages') | Out-Null
  $node = if (Test-Path (Join-Path $LocalSource 'node.exe')) { Join-Path $LocalSource 'node.exe' } else { 'node' }
  & $node (Join-Path $ProjectRoot 'scripts\pack-echomod.mjs') $source $pack --zip | Out-Null
  if (Test-Path -LiteralPath $pack) { return $pack }
  return $null
}

function Choose-OptionalPackages {
  $source = @(
    @{ Key = '1'; Label = T 'pkgStreaming'; Folder = 'ECHO-Streaming'; Checked = $true },
    @{ Key = '2'; Label = T 'pkgPet'; Folder = 'ECHO-Pet'; Checked = $true },
    @{ Key = '3'; Label = T 'pkgOsu'; Folder = 'ECHO-OsuDownloader'; Checked = $true },
    @{ Key = '4'; Label = T 'pkgAudioBand'; Folder = 'ECHO-AudioBand'; Checked = $true },
    @{ Key = '5'; Label = T 'pkgMv'; Folder = 'ECHO-MV'; Checked = $true },
    @{ Key = '6'; Label = T 'pkgWallpaper'; Folder = 'ECHO-WallpaperBridge'; Checked = $true }
  )
  $index = 0
  $visible = $true
  try { $visible = [Console]::CursorVisible; [Console]::CursorVisible = $false } catch {}
  $script:ProgressStarted = $false
  Write-SetupHeader -Meta @('  ' + (T 'extrasTitle'))
  $menuTop = 0
  $phase = 0
  try { $menuTop = [Console]::CursorTop } catch {}
  try {
    while ($true) {
      $rows = @()
      foreach ($item in $source) { $rows += [pscustomobject]@{ Key = $item.Key; Label = $item.Label; Checked = $item.Checked } }
      try { [Console]::SetCursorPosition(0, $menuTop) } catch {}
      Write-SetupItems -Items $rows -Index $index -Hint (T 'extrasHint') -Phase $phase
      $key = Read-MenuKey 40
      if (-not $key) { $phase += 1; continue }
      switch ($key.Key) {
        'UpArrow' { $index = ($index + $source.Count - 1) % $source.Count }
        'DownArrow' { $index = ($index + 1) % $source.Count }
        'Spacebar' { $source[$index].Checked = -not $source[$index].Checked }
        'Enter' { return @($source | Where-Object { $_.Checked } | ForEach-Object { [pscustomobject]@{ Name = $_.Label; Folder = $_.Folder } }) }
        'Escape' { return @() }
        default {
          $digit = Get-MenuDigit $key
          if ($digit) {
            $n = [int]$digit
            if ($n -ge 1 -and $n -le $source.Count) { $index = $n - 1 }
          }
        }
      }
    }
  } finally {
    try { [Console]::CursorVisible = $visible } catch {}
  }
}

function Install-OptionalPackages($selectedExe, $packages) {
  if (-not $packages -or $packages.Count -eq 0) { return }
  $echoRoot = Split-Path -Parent $selectedExe
  $loaderRoot = Join-Path $echoRoot 'ShinawaseLoader'
  $node = Join-Path $loaderRoot 'node.exe'
  if (-not (Test-Path -LiteralPath $node)) { $node = 'node' }
  $loader = Join-Path $loaderRoot 'ShinawaseLoader.mjs'
  $previousHome = $env:ECHO_MOD_HOME
  $previousGame = $env:ECHO_GAME_ROOT
  $env:ECHO_MOD_HOME = $loaderRoot
  $env:ECHO_GAME_ROOT = $echoRoot
  try {
    $done = 0
    foreach ($package in $packages) {
      $done += 1
      $percent = [int](100 * $done / $packages.Count)
      Write-SetupProgress $percent ((T 'progressPackages') + '  ' + $package.Name)
      $path = if ($package.Path) { $package.Path } else { Get-ExamplePackagePath $package.Folder }
      if (-not $path) { throw ("Package not found: {0}" -f $package.Folder) }
      & $node $loader import $path | Out-Null
      if ($LASTEXITCODE -ne 0) { throw ("Failed to import {0}" -f $package.Name) }
    }
  } finally {
    $env:ECHO_MOD_HOME = $previousHome
    $env:ECHO_GAME_ROOT = $previousGame
  }
  Write-SetupProgress 100 (T 'progressDone')
}

function Start-EchoWithProgress($selectedExe) {
  $root = Split-Path -Parent $selectedExe
  $modded = Join-Path $root 'ECHO.modded.exe'
  Write-SetupProgress 35 (T 'progressLaunch')
  if (-not (Test-Path -LiteralPath $modded)) { throw 'ECHO.modded.exe is missing. Install the loader first.' }
  Write-SetupProgress 72 (T 'openingEcho')
  Start-Process -FilePath $modded -WorkingDirectory $root
  Write-SetupProgress 100 (T 'progressDone')
}

function Complete-InstallAndLaunch($selectedExe, [bool]$Update, [bool]$EnableDirectAutoStart = $false) {
  [void](Invoke-Install $selectedExe $Update $EnableDirectAutoStart)
  $chosen = @(Choose-OptionalPackages)
  if ($chosen.Count) { Install-OptionalPackages $selectedExe $chosen }
  Start-EchoWithProgress $selectedExe
  Exit-Setup 0
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
  # Isolated runtime lives under ShinawaseLoader\modded-runtime. Never write
  # Steam's resources\app.asar; deleting the loader folder removes the copy.
  Stop-Loader $loaderRoot
  Remove-Item -LiteralPath $loaderRoot -Recurse -Force -ErrorAction Stop
  Write-Host "Loader removed. Mods and Plugins kept at $(Join-Path $root 'Mods') and $(Join-Path $root 'Plugins')." -ForegroundColor Green
}

function Pause-Menu { [void](Read-Host (T 'pressEnter')) }

function Show-PulseMenu([string]$SelectedPath) {
  $version = Read-Version (Join-Path $LocalSource 'loader-version.json')
  Read-ConsoleMenu -Subtitle $version -Meta @((T 'target') + '  ' + $(if ($SelectedPath) { $SelectedPath } else { T 'notSelected' })) -Labels @(
    (T 'install'),
    (T 'status'),
    (T 'launch'),
    (T 'chooseEcho'),
    (T 'uninstall'),
    (T 'isolated'),
    (T 'exit')
  ) -Values @('1', '2', '3', '4', '5', '6', '0') -Hint (T 'menuHint') -CancelValue '0'
}

function Invoke-Menu {
  Choose-LoaderLocale
  $selected = $null
  while ($true) {
    switch (Show-PulseMenu $selected) {
      '1' {
        try {
          if (-not $selected) { $selected = Resolve-EchoExecutable }
          Complete-InstallAndLaunch $selected $true ([bool]$PatchApp)
          return
        } catch { Write-Host $_.Exception.Message -ForegroundColor Red; Pause-Menu }
      }
      '2' { try { if (-not $selected) { $selected = Resolve-EchoExecutable }; Show-Status $selected } catch { Write-Host $_.Exception.Message -ForegroundColor Red }; Pause-Menu }
      '3' {
        try {
          if (-not $selected) { $selected = Resolve-EchoExecutable }
          $modded = Join-Path (Split-Path -Parent $selected) 'ECHO.modded.exe'
          if (-not (Test-Path -LiteralPath $modded)) {
            Complete-InstallAndLaunch $selected $false ([bool]$PatchApp)
          } else {
            Start-EchoWithProgress $selected
            Exit-Setup 0
          }
          return
        } catch { Write-Host $_.Exception.Message -ForegroundColor Red; Pause-Menu }
      }
      '4' { try { $choice = Select-EchoExecutable $null; if ($choice) { $selected = [IO.Path]::GetFullPath($choice); Write-Json $SelectionFile @{ echoExe = $selected; locale = $script:Locale } } } catch { Write-Host $_.Exception.Message -ForegroundColor Red }; Pause-Menu }
      '5' { try { if (-not $selected) { $selected = Resolve-EchoExecutable }; Invoke-Uninstall $selected; $selected = $null } catch { Write-Host $_.Exception.Message -ForegroundColor Red }; Pause-Menu }
      '6' {
        try {
          if (-not $selected) { $selected = Resolve-EchoExecutable }
          Complete-InstallAndLaunch $selected $false $true
          return
        } catch { Write-Host $_.Exception.Message -ForegroundColor Red; Pause-Menu }
      }
      '0' { Exit-Setup 0 }
    }
  }
}

try {
  Initialize-SetupConsole
  Choose-LoaderLocale
  if ($Action -eq 'menu') { Invoke-Menu; return }
  $selected = Resolve-EchoExecutable
  switch ($Action) {
    'install' { Complete-InstallAndLaunch $selected $false ([bool]$PatchApp) }
    'update' { Complete-InstallAndLaunch $selected $true ([bool]$PatchApp) }
    'check' { Show-Status $selected }
    'launch' {
      $modded = Join-Path (Split-Path -Parent $selected) 'ECHO.modded.exe'
      if (-not (Test-Path -LiteralPath $modded)) { Complete-InstallAndLaunch $selected $false ([bool]$PatchApp) }
      else { Start-EchoWithProgress $selected; Exit-Setup 0 }
    }
    'uninstall' { Invoke-Uninstall $selected }
  }
} catch {
  Write-Host "`nSetup failed: $($_.Exception.Message)" -ForegroundColor Red
  exit 1
}
