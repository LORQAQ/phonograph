Add-Type -AssemblyName System.Drawing

$size = 256
$bmp = New-Object System.Drawing.Bitmap($size, $size)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAlias

$r = 56
$rect = New-Object System.Drawing.Rectangle(8, 8, 240, 240)
$path = New-Object System.Drawing.Drawing2D.GraphicsPath
$path.AddArc($rect.X, $rect.Y, $r, $r, 180, 90)
$path.AddArc($rect.Right - $r, $rect.Y, $r, $r, 270, 90)
$path.AddArc($rect.Right - $r, $rect.Bottom - $r, $r, $r, 0, 90)
$path.AddArc($rect.X, $rect.Bottom - $r, $r, $r, 90, 90)
$path.CloseFigure()

$c1 = [System.Drawing.Color]::FromArgb(255, 58, 205, 138)
$c2 = [System.Drawing.Color]::FromArgb(255, 16, 122, 78)
$brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush($rect, $c1, $c2, 45)
$g.FillPath($brush, $path)

# 右上角音符：符头 + 符干
$white = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(235, 255, 255, 255))
$g.FillEllipse($white, 150, 52, 30, 26)
$g.FillRectangle($white, 174, 64, 7, 54)

$font = New-Object System.Drawing.Font("Segoe UI", 76, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$dark = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 7, 26, 17))
$fmt = New-Object System.Drawing.StringFormat
$fmt.Alignment = [System.Drawing.StringAlignment]::Center
$fmt.LineAlignment = [System.Drawing.StringAlignment]::Center
$g.DrawString("LX", $font, $dark, (New-Object System.Drawing.RectangleF(-6, 18, 210, 230)), $fmt)
$g.Dispose()

$root = Split-Path $PSScriptRoot -Parent
$pngPath = Join-Path $root "LXMusic.png"
$bmp.Save($pngPath, [System.Drawing.Imaging.ImageFormat]::Png)

$png = [System.IO.File]::ReadAllBytes($pngPath)
$ms = New-Object System.IO.MemoryStream
$bw = New-Object System.IO.BinaryWriter($ms)
$bw.Write([UInt16]0)
$bw.Write([UInt16]1)
$bw.Write([UInt16]1)
$bw.Write([Byte]0)
$bw.Write([Byte]0)
$bw.Write([Byte]0)
$bw.Write([Byte]0)
$bw.Write([UInt16]1)
$bw.Write([UInt16]32)
$bw.Write([UInt32]$png.Length)
$bw.Write([UInt32]22)
$bw.Write([byte[]]$png)
$bw.Flush()
[System.IO.File]::WriteAllBytes((Join-Path $root "LXMusic.ico"), $ms.ToArray())
$bw.Dispose(); $ms.Dispose(); $bmp.Dispose()
Write-Output ("icon bytes: " + (Get-Item (Join-Path $root "LXMusic.ico")).Length)
