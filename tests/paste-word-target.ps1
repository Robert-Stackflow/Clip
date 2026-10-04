param(
  [Parameter(Mandatory = $true)][string]$Ready,
  [Parameter(Mandatory = $true)][string]$Result,
  [Parameter(Mandatory = $true)][string]$Stop,
  [Parameter(Mandatory = $true)][string]$Failure,
  [switch]$Details
)

$ErrorActionPreference = 'Stop'
$word = $null
$document = $null
$richDocument = $null
$htmlDocument = $null
$inspected = $false
try {
  $word = New-Object -ComObject Word.Application
  $word.Visible = $true
  $word.DisplayAlerts = 0
  $document = $word.Documents.Add()
  $document.Activate()
  [System.IO.File]::WriteAllText($Ready, 'ready')
  $deadline = [DateTime]::UtcNow.AddSeconds(45)
  while ([DateTime]::UtcNow -lt $deadline -and -not (Test-Path -LiteralPath $Stop)) {
    $value = [string]$document.Content.Text
    if ($value.Trim().Length -gt 0) {
      if ($Details -and -not $inspected) {
        $inspected = $true
        $range = $document.Range(0, $value.Trim().Length)
        $normal = @{ text = $value; bold = [int]$range.Font.Bold; color = [long]$range.Font.Color; size = [double]$range.Font.Size }
        $pasteOption = [int]$word.Options.PasteFormatFromExternalSource
        $richDocument = $word.Documents.Add()
        $richDocument.Activate()
        $word.Selection.PasteSpecial([Type]::Missing, [Type]::Missing, [Type]::Missing, [Type]::Missing, 1)
        $richText = [string]$richDocument.Content.Text
        $richRange = $richDocument.Range(0, $richText.Trim().Length)
        $rich = @{ text = $richText; bold = [int]$richRange.Font.Bold; color = [long]$richRange.Font.Color; size = [double]$richRange.Font.Size }
        $htmlDocument = $word.Documents.Add()
        $htmlDocument.Activate()
        $word.Selection.PasteSpecial([Type]::Missing, [Type]::Missing, [Type]::Missing, [Type]::Missing, 10)
        $htmlText = [string]$htmlDocument.Content.Text
        $htmlRange = $htmlDocument.Range(0, $htmlText.Trim().Length)
        $html = @{ text = $htmlText; bold = [int]$htmlRange.Font.Bold; color = [long]$htmlRange.Font.Color; size = [double]$htmlRange.Font.Size }
        $data = @{ normal = $normal; rtf = $rich; html = $html; pasteOption = $pasteOption } | ConvertTo-Json -Compress -Depth 4
        [System.IO.File]::WriteAllText($Result, $data)
      } elseif (-not $Details) {
        [System.IO.File]::WriteAllText($Result, $value)
      }
    }
    Start-Sleep -Milliseconds 100
  }
} catch {
  [System.IO.File]::WriteAllText($Failure, [string]$_)
} finally {
  if ($null -ne $htmlDocument) { try { $htmlDocument.Close(0) } catch {} }
  if ($null -ne $richDocument) { try { $richDocument.Close(0) } catch {} }
  if ($null -ne $document) { try { $document.Close(0) } catch {} }
  if ($null -ne $word) { try { $word.Quit(0) } catch {} }
  if ($null -ne $htmlDocument) { [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($htmlDocument) }
  if ($null -ne $richDocument) { [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($richDocument) }
  if ($null -ne $document) { [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($document) }
  if ($null -ne $word) { [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($word) }
}
