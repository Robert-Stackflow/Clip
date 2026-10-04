param(
  [Parameter(Mandatory = $true)][string]$Ready,
  [Parameter(Mandatory = $true)][string]$Result,
  [Parameter(Mandatory = $true)][string]$Stop,
  [Parameter(Mandatory = $true)][string]$Failure,
  [switch]$Details
)

$ErrorActionPreference = 'Stop'
$powerpoint = $null
$presentation = $null
$slide = $null
$shape = $null
try {
  $powerpoint = New-Object -ComObject PowerPoint.Application
  $powerpoint.Visible = -1
  $presentation = $powerpoint.Presentations.Add(-1)
  $slide = $presentation.Slides.Add(1, 12)
  $shape = $slide.Shapes.AddTextbox(1, 90, 120, 640, 110)
  $shape.TextFrame.TextRange.Text = 'Replace this text'
  $presentation.Windows.Item(1).Activate()
  $shape.TextFrame.TextRange.Select()
  [System.IO.File]::WriteAllText($Ready, 'ready')
  $inspected = $false
  $deadline = [DateTime]::UtcNow.AddSeconds(45)
  while ([DateTime]::UtcNow -lt $deadline -and -not (Test-Path -LiteralPath $Stop)) {
    $value = [string]$shape.TextFrame.TextRange.Text
    if (-not $inspected -and $value -ne 'Replace this text' -and $value.Trim().Length -gt 0) {
      if ($Details) {
        $font = $shape.TextFrame.TextRange.Characters(1, $value.Length).Font
        $summary = @{ text = $value; bold = [int]$font.Bold; color = [long]$font.Color.RGB; size = [double]$font.Size }
        [System.IO.File]::WriteAllText($Result, ($summary | ConvertTo-Json -Compress))
      } else {
        [System.IO.File]::WriteAllText($Result, $value)
      }
      $inspected = $true
    }
    Start-Sleep -Milliseconds 100
  }
} catch {
  [System.IO.File]::WriteAllText($Failure, [string]$_)
} finally {
  if ($null -ne $presentation) { try { $presentation.Close() } catch {} }
  if ($null -ne $powerpoint) { try { $powerpoint.Quit() } catch {} }
  if ($null -ne $shape) { [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($shape) }
  if ($null -ne $slide) { [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($slide) }
  if ($null -ne $presentation) { [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($presentation) }
  if ($null -ne $powerpoint) { [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($powerpoint) }
}
