param(
  [Parameter(Mandatory = $true)][string]$Value,
  [Parameter(Mandatory = $true)][string]$Ready,
  [Parameter(Mandatory = $true)][string]$Stop,
  [Parameter(Mandatory = $true)][string]$Failure
)

$ErrorActionPreference = 'Stop'
$excel = $null
$book = $null
$sheet = $null
$cell = $null
try {
  $excel = New-Object -ComObject Excel.Application
  $excel.Visible = $false
  $excel.DisplayAlerts = $false
  $book = $excel.Workbooks.Add()
  $sheet = $book.Worksheets.Item(1)
  $cell = $sheet.Range('A1')
  $cell.Value2 = $Value
  $cell.Font.Bold = $true
  $cell.Font.Color = 4007639
  [void]$cell.Copy()
  [System.IO.File]::WriteAllText($Ready, 'ready')
  $deadline = [DateTime]::UtcNow.AddSeconds(45)
  while ([DateTime]::UtcNow -lt $deadline -and -not (Test-Path -LiteralPath $Stop)) {
    Start-Sleep -Milliseconds 100
  }
} catch {
  [System.IO.File]::WriteAllText($Failure, [string]$_)
} finally {
  if ($null -ne $book) { try { $book.Close($false) } catch {} }
  if ($null -ne $excel) { try { $excel.Quit() } catch {} }
  foreach ($object in @($cell, $sheet, $book, $excel)) {
    if ($null -ne $object) { [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($object) }
  }
}
