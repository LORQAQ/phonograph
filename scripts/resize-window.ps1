Add-Type @'
using System;
using System.Runtime.InteropServices;
public class WinMove {
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr hWnd, IntPtr after, int x, int y, int cx, int cy, uint flags);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int cmd);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT r);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
}
'@
$p = Get-Process LXMusic -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $p) { Write-Output "NO_PROCESS"; exit 1 }
$h = $p.MainWindowHandle
$w = [int]$args[0]
$ht = [int]$args[1]
[WinMove]::ShowWindow($h, 9) | Out-Null
[WinMove]::SetWindowPos($h, [IntPtr]::Zero, 0, 0, $w, $ht, 0x0004) | Out-Null   # SWP_NOZORDER
Start-Sleep -Milliseconds 400
$r = New-Object WinMove+RECT
[WinMove]::GetWindowRect($h, [ref]$r) | Out-Null
Write-Output ("WINDOW " + ($r.Right - $r.Left) + "x" + ($r.Bottom - $r.Top))
