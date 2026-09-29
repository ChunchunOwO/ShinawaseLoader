# One-command mirror deploy. Uploads what scripts\build-update-mirror.mjs produced.
#
#   node .\scripts\build-update-mirror.mjs ".\mirror-out" --with-node
#   powershell -ExecutionPolicy Bypass -File .\scripts\update-mirror\deploy.ps1 -Setup   # first time
#   powershell -ExecutionPolicy Bypass -File .\scripts\update-mirror\deploy.ps1          # every release
#
# ssh asks for the password (or uses your key) once; nothing is stored. -Setup also installs
# nginx and the mirror site (replaces the stock default site). Then it checks the public URLs.
param(
  [string]$Server = 'root@43.248.10.82',
  [string]$MirrorDir = (Join-Path (Split-Path -Parent (Split-Path -Parent $PSScriptRoot)) 'mirror-out'),
  [switch]$Setup
)
$ErrorActionPreference = 'Stop'
if (-not (Test-Path (Join-Path $MirrorDir 'mirror-manifest.json'))) { throw "No mirror in $MirrorDir - run scripts\build-update-mirror.mjs first." }
$hostName = ($Server -split '@')[-1]
$stage = Join-Path ([IO.Path]::GetTempPath()) ('shinawase-deploy-' + [guid]::NewGuid().ToString('N'))
$tar = "$stage.tar"
New-Item -ItemType Directory -Force -Path (Join-Path $stage 'www') | Out-Null
try {
  Copy-Item -Path (Join-Path $MirrorDir '*') -Destination (Join-Path $stage 'www') -Recurse -Force
  Copy-Item (Join-Path $PSScriptRoot 'nginx.conf.example') (Join-Path $stage 'nginx.conf')
  $script = @'
#!/bin/bash
set -e
D=/tmp/shinawase-deploy
if [ "$SETUP" = "1" ]; then
  apt-get update -qq
  DEBIAN_FRONTEND=noninteractive apt-get install -y -qq nginx rsync
  mkdir -p /var/cache/nginx/shinawase-npm
  cp $D/nginx.conf /etc/nginx/conf.d/shinawase.conf
  rm -f /etc/nginx/sites-enabled/default
fi
mkdir -p /var/www/shinawase
if command -v rsync >/dev/null; then rsync -a --delete $D/www/ /var/www/shinawase/
else rm -rf /var/www/shinawase/* && cp -a $D/www/. /var/www/shinawase/; fi
chmod -R a+rX /var/www/shinawase
nginx -t
systemctl reload nginx
rm -rf $D
echo deployed
'@
  [IO.File]::WriteAllText((Join-Path $stage 'run.sh'), ($script -replace "`r`n", "`n"), (New-Object Text.UTF8Encoding($false)))
  & tar.exe -cf $tar -C $stage .
  $flag = if ($Setup) { '1' } else { '0' }
  # one ssh session = one password prompt: stream the archive in, unpack, run
  # cmd's `type | ssh` keeps the bytes raw (a PowerShell 5.1 pipeline would mangle the binary tar)
  $remoteCmd = "rm -rf /tmp/shinawase-deploy && mkdir -p /tmp/shinawase-deploy && tar -xf - -C /tmp/shinawase-deploy && SETUP=$flag bash /tmp/shinawase-deploy/run.sh"
  cmd.exe /c "type `"$tar`" | ssh $Server `"$remoteCmd`""
  if ($LASTEXITCODE -ne 0) { throw "Deploy failed (exit $LASTEXITCODE)." }
} finally {
  Remove-Item -LiteralPath $stage -Recurse -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $tar -Force -ErrorAction SilentlyContinue
}

Write-Host "`nVerifying http://$hostName/shinawase/ ..."
foreach ($path in 'mirror-manifest.json', 'mirror-manifest.sig', 'ShinawaseLoader-main.zip') {
  try { $r = Invoke-WebRequest -UseBasicParsing -Method Head -Uri "http://$hostName/shinawase/$path" -TimeoutSec 15; '{0,-28} {1}' -f $path, $r.StatusCode }
  catch { '{0,-28} FAILED ({1})' -f $path, $_.Exception.Message }
}
(Invoke-RestMethod -Uri "http://$hostName/shinawase/mirror-manifest.json" -TimeoutSec 15).loader | Format-List version, sha256
