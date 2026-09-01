$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$dotnetSdk = Join-Path $env:LOCALAPPDATA 'dotnet-sdk'
$dotnet = Join-Path $dotnetSdk 'dotnet.exe'
if (-not (Test-Path -LiteralPath $dotnet)) { $dotnet = 'dotnet' }
if (-not $env:DOTNET_ROOT -and (Test-Path -LiteralPath (Join-Path $dotnetSdk 'dotnet.exe'))) {
  $env:DOTNET_ROOT = $dotnetSdk
}
if (-not $env:NUGET_PACKAGES) { $env:NUGET_PACKAGES = Join-Path $env:LOCALAPPDATA 'nuget-packages' }
$proj = Join-Path $root 'winui\AudioBand.WinUI.csproj'
$out = Join-Path $root 'echomod\host'
if (-not (Test-Path -LiteralPath $proj)) { throw "missing $proj" }

$sdkVersion = & $dotnet --version
Write-Host "dotnet $sdkVersion"
Write-Host "NUGET_PACKAGES=$($env:NUGET_PACKAGES)"

$vswhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio\Installer\vswhere.exe'
if (Test-Path -LiteralPath $vswhere) {
  $pri = & $vswhere -latest -products * -find 'MSBuild\Microsoft\VisualStudio\v*\AppxPackage\Microsoft.Build.Packaging.Pri.Tasks.dll' 2>$null
  if ($pri) { Write-Host "VS PRI tasks: $pri" }
  else { Write-Host 'VS PRI tasks: not installed (unpackaged publish uses WinAppSDK EnableMsixTooling from NuGet)' }
} else {
  Write-Host 'VS installer: not found (unpackaged publish uses WinAppSDK EnableMsixTooling from NuGet)'
}

New-Item -ItemType Directory -Force -Path $out | Out-Null
Write-Host "Restoring $proj"
& $dotnet restore $proj -r win-x64
if ($LASTEXITCODE -ne 0) { throw "dotnet restore failed: $LASTEXITCODE" }
Write-Host "Publishing EchoAudioBand -> $out"
& $dotnet publish $proj -c Release -r win-x64 -p:Platform=x64 --self-contained true --no-restore -o $out
if ($LASTEXITCODE -ne 0) { throw "dotnet publish failed: $LASTEXITCODE" }
$exe = Join-Path $out 'EchoAudioBand.exe'
if (-not (Test-Path -LiteralPath $exe)) { throw "publish succeeded but $exe is missing" }
Write-Host "OK $exe"
