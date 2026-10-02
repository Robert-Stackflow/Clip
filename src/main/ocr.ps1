param([ValidateSet('Status','Recognize')][string]$Mode='Status',[string]$ImagePath,[string]$Language='')
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null=[Windows.Media.Ocr.OcrEngine,Windows.Foundation,ContentType=WindowsRuntime]
$null=[Windows.Storage.StorageFile,Windows.Storage,ContentType=WindowsRuntime]
$null=[Windows.Storage.Streams.IRandomAccessStream,Windows.Storage.Streams,ContentType=WindowsRuntime]
$null=[Windows.Graphics.Imaging.BitmapDecoder,Windows.Graphics.Imaging,ContentType=WindowsRuntime]
$null=[Windows.Graphics.Imaging.SoftwareBitmap,Windows.Graphics.Imaging,ContentType=WindowsRuntime]
$null=[Windows.Globalization.Language,Windows.Globalization,ContentType=WindowsRuntime]
$asTask=[System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.IsGenericMethod -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' } | Select-Object -First 1
function Await-Operation($operation,[Type]$resultType) { $task=$asTask.MakeGenericMethod($resultType).Invoke($null,@($operation));$task.GetAwaiter().GetResult() }
try {
  $languages=@([Windows.Media.Ocr.OcrEngine]::AvailableRecognizerLanguages | ForEach-Object { @{tag=$_.LanguageTag;name=$_.DisplayName} })
  if($Mode -eq 'Status') { @{languages=$languages;maxDimension=[Windows.Media.Ocr.OcrEngine]::MaxImageDimension} | ConvertTo-Json -Depth 6 -Compress;exit 0 }
  if(-not [IO.Path]::IsPathRooted($ImagePath) -or -not (Test-Path -LiteralPath $ImagePath -PathType Leaf)) { throw '识别图片不存在' }
  if($Language) { $engine=[Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage([Windows.Globalization.Language]::new($Language)) } else { $engine=[Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages() }
  if(-not $engine) { throw '未安装所选 OCR 语言，请在 Windows 设置中添加对应语言的光学字符识别组件' }
  $file=Await-Operation ([Windows.Storage.StorageFile]::GetFileFromPathAsync($ImagePath)) ([Windows.Storage.StorageFile])
  $stream=Await-Operation ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
  try {
    $decoder=Await-Operation ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
    $bitmap=Await-Operation ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
    try { $result=Await-Operation ($engine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult]);@{text=($result.Lines | ForEach-Object {$_.Text}) -join "`n";language=$engine.RecognizerLanguage.LanguageTag} | ConvertTo-Json -Compress -Depth 5 } finally { $bitmap.Dispose() }
  } finally { $stream.Dispose() }
} catch { @{error=$_.Exception.Message} | ConvertTo-Json -Compress;exit 1 }
