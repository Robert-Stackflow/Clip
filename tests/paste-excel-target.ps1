param(
  [Parameter(Mandatory = $true)][string]$Ready,
  [Parameter(Mandatory = $true)][string]$Result,
  [Parameter(Mandatory = $true)][string]$Stop,
  [Parameter(Mandatory = $true)][string]$Failure
)

$ErrorActionPreference = 'Stop'
$excel = $null
$workbook = $null
try {
  $excel = New-Object -ComObject Excel.Application
  $excel.Visible = $true
  $excel.DisplayAlerts = $false
  $workbook = $excel.Workbooks.Add()
  $workbook.Activate()
  $sheet = $workbook.ActiveSheet
  $sheet.Range('A1').Select()
  [System.IO.File]::WriteAllText($Ready, 'ready')
  $deadline = [DateTime]::UtcNow.AddSeconds(45)
  while ([DateTime]::UtcNow -lt $deadline -and -not (Test-Path -LiteralPath $Stop)) {
    $value = [string]$sheet.Range('A1').Value2
    if ($value.Length -gt 0) {
      [System.IO.File]::WriteAllText($Result, $value)
    }
    Start-Sleep -Milliseconds 100
  }
} catch {
  [System.IO.File]::WriteAllText($Failure, [string]$_)
} finally {
  if ($null -ne $workbook) { try { $workbook.Close($false) } catch {} }
  if ($null -ne $excel) { try { $excel.Quit() } catch {} }
  if ($null -ne $workbook) { [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($workbook) }
  if ($null -ne $excel) { [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($excel) }
}
