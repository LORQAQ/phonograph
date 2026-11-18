Add-Type -AssemblyName System.Drawing

# ===== 留声（Phonograph）图标：黑胶唱片 + 绿色标签 =====
$S = 256
$bmp = [System.Drawing.Bitmap]::new($S, $S)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAlias
$g.Clear([System.Drawing.Color]::Transparent)

$r = 54
$rect = [System.Drawing.Rectangle]::new(6, 6, $S - 12, $S - 12)
$path = [System.Drawing.Drawing2D.GraphicsPath]::new()
$path.AddArc($rect.X, $rect.Y, $r, $r, 180, 90)
$path.AddArc($rect.Right - $r, $rect.Y, $r, $r, 270, 90)
$path.AddArc($rect.Right - $r, $rect.Bottom - $r, $r, $r, 0, 90)
$path.AddArc($rect.X, $rect.Bottom - $r, $r, $r, 90, 90)
$path.CloseFigure()
$bgA = [System.Drawing.Color]::FromArgb(255, 26, 34, 30)
$bgB = [System.Drawing.Color]::FromArgb(255, 13, 18, 16)
$bgBrush = [System.Drawing.Drawing2D.LinearGradientBrush]::new($rect, $bgA, $bgB, 60)
$g.FillPath($bgBrush, $path)
$bgBrush.Dispose()

$disc = [System.Drawing.Rectangle]::new(30, 30, 196, 196)
$discA = [System.Drawing.Color]::FromArgb(255, 24, 26, 24)
$discB = [System.Drawing.Color]::FromArgb(255, 8, 9, 8)
$discBrush = [System.Drawing.Drawing2D.LinearGradientBrush]::new($disc, $discA, $discB, 50)
$g.FillEllipse($discBrush, $disc)
$discBrush.Dispose()

$grooveColor = [System.Drawing.Color]::FromArgb(38, 255, 255, 255)
$groove = [System.Drawing.Pen]::new($grooveColor, 1)
for ($i = 0; $i -lt 11; $i++) {
  $d = 168 - ($i * 11)
  $off = (196 - $d) / 2
  $g.DrawEllipse($groove, 30 + $off, 30 + $off, $d, $d)
}
$groove.Dispose()

$hi = [System.Drawing.Drawing2D.GraphicsPath]::new()
$hi.AddArc(38, 38, 118, 118, 200, 85)
$hiColor = [System.Drawing.Color]::FromArgb(60, 255, 255, 255)
$hiPen = [System.Drawing.Pen]::new($hiColor, 7)
$g.DrawPath($hiPen, $hi)
$hiPen.Dispose()
$hi.Dispose()

$label = [System.Drawing.Rectangle]::new(90, 90, 76, 76)
$lblA = [System.Drawing.Color]::FromArgb(255, 45, 190, 116)
$lblB = [System.Drawing.Color]::FromArgb(255, 21, 132, 78)
$lblBrush = [System.Drawing.Drawing2D.LinearGradientBrush]::new($label, $lblA, $lblB, 55)
$g.FillEllipse($lblBrush, $label)
$lblBrush.Dispose()

$tri = [System.Drawing.PointF[]]@(
  [System.Drawing.PointF]::new(115, 108),
  [System.Drawing.PointF]::new(115, 148),
  [System.Drawing.PointF]::new(147, 128)
)
$triBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(245, 255, 255, 255))
$g.FillPolygon($triBrush, $tri)
$triBrush.Dispose()

$holeBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(255, 12, 16, 13))
$g.FillEllipse($holeBrush, 124, 124, 8, 8)
$holeBrush.Dispose()

$g.Dispose()

$root = Split-Path $PSScriptRoot -Parent
$pngPath = Join-Path $root "LXMusic.png"
$bmp.Save($pngPath, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()

# ===== 多尺寸 ICO =====
$sizes = @(16, 24, 32, 48, 64, 128, 256)
$blobs = @()
foreach ($sz in $sizes) {
  $src = [System.Drawing.Image]::FromFile($pngPath)
  $small = [System.Drawing.Bitmap]::new($sz, $sz)
  $sg = [System.Drawing.Graphics]::FromImage($small)
  $sg.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $sg.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $sg.DrawImage($src, 0, 0, $sz, $sz)
  $sg.Dispose()
  $src.Dispose()
  $ms = [System.IO.MemoryStream]::new()
  $small.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
  $blobs += ,$ms.ToArray()
  $small.Dispose()
  $ms.Dispose()
}

$out = [System.IO.MemoryStream]::new()
$bw = [System.IO.BinaryWriter]::new($out)
$bw.Write([UInt16]0)
$bw.Write([UInt16]1)
$bw.Write([UInt16]$sizes.Count)
$offset = 6 + 16 * $sizes.Count
for ($i = 0; $i -lt $sizes.Count; $i++) {
  $sz = $sizes[$i]
  $dim = if ($sz -ge 256) { 0 } else { $sz }
  $bw.Write([Byte]$dim)
  $bw.Write([Byte]$dim)
  $bw.Write([Byte]0)
  $bw.Write([Byte]0)
  $bw.Write([UInt16]1)
  $bw.Write([UInt16]32)
  $bw.Write([UInt32]$blobs[$i].Length)
  $bw.Write([UInt32]$offset)
  $offset += $blobs[$i].Length
}
foreach ($b in $blobs) { $bw.Write($b) }
$bw.Flush()
[System.IO.File]::WriteAllBytes((Join-Path $root "LXMusic.ico"), $out.ToArray())
$bw.Dispose()
$out.Dispose()
Write-Output ("ICO OK: " + $sizes.Count + " sizes, " + (Get-Item (Join-Path $root "LXMusic.ico")).Length + " bytes")
