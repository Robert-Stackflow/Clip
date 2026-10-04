param(
  [Parameter(Mandatory = $true)][string]$Ready,
  [Parameter(Mandatory = $true)][string]$Result,
  [Parameter(Mandatory = $true)][string]$Stop,
  [Parameter(Mandatory = $true)][string]$Failure,
  [Parameter(Mandatory = $true)][string]$Presentation
)

$ErrorActionPreference = 'Stop'
$powerpoint = $null
$presentationObject = $null
$slide = $null
try {
  $powerpoint = New-Object -ComObject PowerPoint.Application
  $powerpoint.Visible = -1
  $presentationObject = $powerpoint.Presentations.Add(-1)
  $slide = $presentationObject.Slides.Add(1, 12)
  if ($slide.Shapes.Count -ne 0) { throw 'Blank slide unexpectedly contains shapes' }
  $presentationObject.Windows.Item(1).Activate()
  $slide.Select()
  [System.IO.File]::WriteAllText($Ready, 'ready')
  $deadline = [DateTime]::UtcNow.AddSeconds(45)
  while ([DateTime]::UtcNow -lt $deadline -and -not (Test-Path -LiteralPath $Stop)) {
    if ($slide.Shapes.Count -gt 0) {
      $shape = $slide.Shapes.Item(1)
      $summary = @{ shapes = [int]$slide.Shapes.Count; width = [double]$shape.Width; height = [double]$shape.Height; type = [int]$shape.Type }
      $presentationObject.SaveAs($Presentation, 24)
      [System.IO.File]::WriteAllText($Result, ($summary | ConvertTo-Json -Compress))
      break
    }
    Start-Sleep -Milliseconds 100
  }
} catch {
  [System.IO.File]::WriteAllText($Failure, [string]$_)
} finally {
  if ($null -ne $presentationObject) { try { $presentationObject.Close() } catch {} }
  if ($null -ne $powerpoint) { try { $powerpoint.Quit() } catch {} }
  if ($null -ne $slide) { [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($slide) }
  if ($null -ne $presentationObject) { [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($presentationObject) }
  if ($null -ne $powerpoint) { [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($powerpoint) }
}
