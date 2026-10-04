param(
  [Parameter(Mandatory = $true)][string]$Value,
  [Parameter(Mandatory = $true)][string]$Ready,
  [Parameter(Mandatory = $true)][string]$Stop,
  [Parameter(Mandatory = $true)][string]$Failure,
  [Parameter(Mandatory = $true)][uint32]$ExpectedSequence
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'clipboard-guard.ps1')
$word = $null
$document = $null
$range = $null
try {
  $word = New-Object -ComObject Word.Application
  $word.Visible = $false
  $word.DisplayAlerts = 0
  $document = $word.Documents.Add()
  $range = $document.Range(0, 0)
  $range.Text = $Value
  $range = $document.Range(0, $Value.Length)
  $range.Font.Bold = -1
  $range.Font.Size = 18
  $range.Font.Color = 4007639
  Assert-ClipboardUnchanged $ExpectedSequence
  [void]$range.Copy()
  [System.IO.File]::WriteAllText($Ready, 'ready')
  $deadline = [DateTime]::UtcNow.AddSeconds(45)
  while ([DateTime]::UtcNow -lt $deadline -and -not (Test-Path -LiteralPath $Stop)) {
    Start-Sleep -Milliseconds 100
  }
} catch {
  [System.IO.File]::WriteAllText($Failure, [string]$_)
} finally {
  if ($null -ne $document) { try { $document.Close($false) } catch {} }
  if ($null -ne $word) { try { $word.Quit() } catch {} }
  foreach ($object in @($range, $document, $word)) {
    if ($null -ne $object) { [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($object) }
  }
}
