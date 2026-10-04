param(
  [Parameter(Mandatory = $true)][string]$Ready,
  [Parameter(Mandatory = $true)][string]$Result,
  [Parameter(Mandatory = $true)][string]$Stop,
  [Parameter(Mandatory = $true)][string]$Failure,
  [Parameter(Mandatory = $true)][string]$Document
)

$ErrorActionPreference = 'Stop'
$word = $null
$documentObject = $null
try {
  $word = New-Object -ComObject Word.Application
  $word.Visible = $true
  $word.DisplayAlerts = 0
  $documentObject = $word.Documents.Add()
  $documentObject.Activate()
  [System.IO.File]::WriteAllText($Ready, 'ready')
  $deadline = [DateTime]::UtcNow.AddSeconds(45)
  while ([DateTime]::UtcNow -lt $deadline -and -not (Test-Path -LiteralPath $Stop)) {
    if ($documentObject.InlineShapes.Count -gt 0) {
      $shape = $documentObject.InlineShapes.Item(1)
      $summary = @{ inlineShapes = [int]$documentObject.InlineShapes.Count; width = [double]$shape.Width; height = [double]$shape.Height; type = [int]$shape.Type }
      $documentObject.SaveAs2($Document, 16)
      [System.IO.File]::WriteAllText($Result, ($summary | ConvertTo-Json -Compress))
      break
    }
    Start-Sleep -Milliseconds 100
  }
} catch {
  [System.IO.File]::WriteAllText($Failure, [string]$_)
} finally {
  if ($null -ne $documentObject) { try { $documentObject.Close(0) } catch {} }
  if ($null -ne $word) { try { $word.Quit(0) } catch {} }
  if ($null -ne $documentObject) { [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($documentObject) }
  if ($null -ne $word) { [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($word) }
}
