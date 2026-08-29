[CmdletBinding()]
param(
  [string]$OutputRoot,
  [switch]$NoZip
)

$ErrorActionPreference = 'Stop'
$ProjectRoot = Split-Path -Parent $PSScriptRoot
if (-not $OutputRoot) { $OutputRoot = Join-Path $ProjectRoot 'release' }
$versionInfo = Get-Content -Raw -LiteralPath (Join-Path $ProjectRoot 'ShinawaseLoader\loader-version.json') | ConvertFrom-Json
$version = [string]$versionInfo.version
if ([string]::IsNullOrWhiteSpace($version)) { throw 'loader version is missing.' }

$output = [IO.Path]::GetFullPath($OutputRoot)
$releaseName = "ShinawaseLoader-$version"
$releaseRoot = [IO.Path]::GetFullPath((Join-Path $output $releaseName))
if (-not $releaseRoot.StartsWith($output.TrimEnd('\') + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'release path is outside output root.' }

New-Item -ItemType Directory -Force -Path $output | Out-Null
if (Test-Path -LiteralPath $releaseRoot) { Remove-Item -LiteralPath $releaseRoot -Recurse -Force }
New-Item -ItemType Directory -Force -Path $releaseRoot | Out-Null

$loaderSource = Join-Path $ProjectRoot 'ShinawaseLoader'
$loaderTarget = Join-Path $releaseRoot 'ShinawaseLoader'
New-Item -ItemType Directory -Force -Path $loaderTarget | Out-Null
Get-ChildItem -LiteralPath $loaderSource -Force |
  Where-Object { $_.Name -notin @('node.exe', 'loader-state.json', 'loader-debug.log', 'Logs', 'backups', 'native-host.json') } |
  ForEach-Object { Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $loaderTarget $_.Name) -Recurse -Force }

Copy-Item -LiteralPath (Join-Path $ProjectRoot 'setup-modloader.bat') -Destination $releaseRoot
Copy-Item -LiteralPath (Join-Path $ProjectRoot 'pack-mod.bat') -Destination $releaseRoot
New-Item -ItemType Directory -Force -Path (Join-Path $releaseRoot 'scripts') | Out-Null
Copy-Item -LiteralPath (Join-Path $ProjectRoot 'scripts\setup-modloader.ps1') -Destination (Join-Path $releaseRoot 'scripts\setup-modloader.ps1')
Copy-Item -LiteralPath (Join-Path $ProjectRoot 'scripts\pack-echomod.mjs') -Destination (Join-Path $releaseRoot 'scripts\pack-echomod.mjs')

@(
  '# ShinawaseLoader release',
  '',
  'This folder is the portable end-user release, not the development source tree.',
  '',
  '1. Run setup-modloader.bat.',
  '2. Let it scan for ECHO.exe or select the Steam ECHO Playtest directory.',
  '3. Use the generated ShinawaseLoader\start-echo-with-mods.cmd beside ECHO.exe.',
  '',
  'The installer uses an external CDP connection and never patches Steam resources\app.asar.',
  'Install builds an isolated ShinawaseLoader\modded-runtime plus ECHO.modded.exe. -PatchApp is accepted for older callers and ignored.',
  'It downloads Node into the current user cache only when required.',
  'Drop Mod packages into Mods and Plugin packages into Plugins for automatic import.',
  'Logs are written to ShinawaseLoader\Logs\loader.log and ShinawaseLoader\Logs\errors.log.',
  'Launchers: start-echo-with-mods.cmd, start-echo-debug.cmd, start-echo-safe.cmd, attach-to-echo.cmd.',
  'Use pack-mod.bat <package-directory> <output.echo> --zip to package a Mod or Plugin.',
  'Debug mode is for developing and debugging ShinawaseLoader, Plugins, and Mods.',
  ''
) | Set-Content -LiteralPath (Join-Path $releaseRoot 'README.md') -Encoding ASCII

@(
  "ShinawaseLoader $version",
  '',
  'This is the portable release output, not the development source tree.',
  'Run setup-modloader.bat to scan or select ECHO and create the external-CDP launcher.',
  'The installer downloads Node into the current user cache only when needed.'
) | Set-Content -LiteralPath (Join-Path $releaseRoot 'RELEASE.txt') -Encoding ASCII

if (-not $NoZip) {
  $zip = Join-Path $output "$releaseName.zip"
  Compress-Archive -LiteralPath $releaseRoot -DestinationPath $zip -Force
  Write-Host "Release ZIP: $zip" -ForegroundColor Green
}
Write-Host "Release folder: $releaseRoot" -ForegroundColor Green
