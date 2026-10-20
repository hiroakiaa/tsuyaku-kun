param([string]$OutputDirectory=(Join-Path $PSScriptRoot '../checks/photo-test'))
Add-Type -AssemblyName System.Drawing
[void](New-Item -ItemType Directory -Force -Path $OutputDirectory)
$lines=@('架空の学校案内・確認用','提出日は10月20日です。','参加費は1200円です。','お弁当は必要ありません。','教科書と筆記用具を持ってきてください。','欠席する場合は前日までに学校へ連絡してください。','集合場所は未定です。')
foreach($variant in @('clear','low-contrast','rotated','table')){
 $bitmap=[Drawing.Bitmap]::new(1400,1200);$graphics=[Drawing.Graphics]::FromImage($bitmap);$graphics.Clear([Drawing.Color]::White)
 $font=[Drawing.Font]::new('Yu Gothic',28);$brush=[Drawing.SolidBrush]::new($(if($variant -eq 'low-contrast'){[Drawing.Color]::FromArgb(170,170,170)}else{[Drawing.Color]::Black}))
 try{
  if($variant -eq 'rotated'){$graphics.TranslateTransform(700,600);$graphics.RotateTransform(7);$graphics.TranslateTransform(-700,-600)}
  $y=70
  foreach($line in $lines){if($variant -eq 'table'){$graphics.DrawRectangle([Drawing.Pens]::Gray,35,$y-10,1310,110)};$graphics.DrawString($line,$font,$brush,55,$y);$y+=140}
  $path=Join-Path $OutputDirectory ('synthetic-'+$variant+'.jpg');$bitmap.Save($path,[Drawing.Imaging.ImageFormat]::Jpeg)
 }finally{$graphics.Dispose();$bitmap.Dispose();$font.Dispose();$brush.Dispose()}
}
Write-Output 'Created four synthetic photo fixtures; no personal documents used.'
