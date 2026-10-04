param(
  [Parameter(Mandatory = $true)][string]$Ready,
  [Parameter(Mandatory = $true)][string]$Result
)
$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = [System.Text.UTF8Encoding]::new($false)
[System.IO.File]::WriteAllText($Ready, 'ready')
$line = [Console]::ReadLine()
[System.IO.File]::WriteAllText($Result, $line)
