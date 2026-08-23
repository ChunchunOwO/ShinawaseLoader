$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Console]::InputEncoding = New-Object System.Text.UTF8Encoding $false
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false

$null = Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

public static class EchoAbNative {
  [StructLayout(LayoutKind.Sequential)]
  public struct RECT {
    public int Left;
    public int Top;
    public int Right;
    public int Bottom;
  }

  [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
  public static extern IntPtr FindWindow(string lpClassName, string lpWindowName);

  [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
  public static extern IntPtr FindWindowEx(IntPtr hwndParent, IntPtr hwndChildAfter, string lpszClass, string lpszWindow);

  [DllImport("user32.dll", SetLastError = true)]
  public static extern bool GetWindowRect(IntPtr hWnd, ref RECT lpRect);
}
'@

function Write-Res([hashtable]$obj) {
  $json = ConvertTo-Json -InputObject $obj -Compress -Depth 6
  [Console]::Out.WriteLine($json)
  [Console]::Out.Flush()
}

function Get-RectMap([IntPtr]$hwnd) {
  $r = New-Object EchoAbNative+RECT
  if (-not [EchoAbNative]::GetWindowRect($hwnd, [ref]$r)) { return $null }
  return @{
    x = [int]$r.Left
    y = [int]$r.Top
    w = [int]($r.Right - $r.Left)
    h = [int]($r.Bottom - $r.Top)
  }
}

function Get-LightTheme {
  try {
    $v = (Get-ItemProperty -LiteralPath 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Themes\Personalize' -Name 'SystemUsesLightTheme' -ErrorAction Stop).SystemUsesLightTheme
    return ([int]$v -eq 1)
  } catch {
    return $false
  }
}

function Get-Tray {
  return [EchoAbNative]::FindWindow('Shell_TrayWnd', $null)
}

function Get-Notify([IntPtr]$tray) {
  if ($tray -eq [IntPtr]::Zero) { return [IntPtr]::Zero }
  return [EchoAbNative]::FindWindowEx($tray, [IntPtr]::Zero, 'TrayNotifyWnd', $null)
}

while ($true) {
  $line = [Console]::In.ReadLine()
  if ($null -eq $line) { break }
  if ([string]::IsNullOrWhiteSpace($line)) { continue }
  $id = $null
  try {
    $req = $line | ConvertFrom-Json
    $id = $req.id
    $op = [string]$req.op
    if ($op -eq 'query') {
      $tray = Get-Tray
      if ($tray -eq [IntPtr]::Zero) {
        Write-Res @{ id = $id; ok = $true; tray = $null; notify = $null; lightTheme = (Get-LightTheme) }
      } else {
        $notify = Get-Notify $tray
        $trayMap = Get-RectMap $tray
        $notifyMap = $null
        if ($notify -ne [IntPtr]::Zero) { $notifyMap = Get-RectMap $notify }
        Write-Res @{
          id = $id
          ok = $true
          tray = $trayMap
          notify = $notifyMap
          lightTheme = (Get-LightTheme)
        }
      }
    } else {
      throw 'unknown_op'
    }
  } catch {
    $msg = $_.Exception.Message
    if ([string]::IsNullOrWhiteSpace($msg)) { $msg = 'error' }
    Write-Res @{ id = $id; ok = $false; error = $msg }
  }
}
