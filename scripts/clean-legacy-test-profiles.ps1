[CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
param([switch]$Apply)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$clipRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..')).TrimEnd('\')
$archiveRoot = Join-Path $clipRoot 'work\Clip\legacy-test-profiles'
$manifestPath = Join-Path $clipRoot 'verification\storage\repository-tidy-2026-10-10.json'
$resultPath = Join-Path $clipRoot 'verification\storage\cleanup-legacy-test-profiles-result.json'
$comparison = [StringComparison]::OrdinalIgnoreCase

function Assert-PlainPath([string]$Path) {
    $absolute = [IO.Path]::GetFullPath($Path)
    if ($absolute -ne $clipRoot -and -not $absolute.StartsWith($clipRoot + '\', $comparison)) {
        throw "Path is outside this repository: $absolute"
    }
    $cursor = $absolute
    while ($true) {
        $item = Get-Item -LiteralPath $cursor -Force -ErrorAction SilentlyContinue
        if ($item -and ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
            throw "Linked path is not allowed: $cursor"
        }
        if ($cursor -eq $clipRoot) { break }
        $cursor = Split-Path -Parent $cursor
    }
}

function Get-ProfileSnapshot([string]$Path) {
    Assert-PlainPath $Path
    $pending = [Collections.Generic.Stack[string]]::new()
    $pending.Push($Path)
    $records = [Collections.Generic.List[string]]::new()
    [long]$bytes = 0
    [int]$files = 0
    while ($pending.Count) {
        $directory = Get-Item -LiteralPath $pending.Pop() -Force
        if (-not $directory.PSIsContainer -or ($directory.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
            throw "Expected a plain test directory: $($directory.FullName)"
        }
        $records.Add('D|' + $directory.FullName.Substring($Path.Length))
        foreach ($child in Get-ChildItem -LiteralPath $directory.FullName -Force) {
            if ($child.Attributes -band [IO.FileAttributes]::ReparsePoint) {
                throw "Linked test contents are not allowed: $($child.FullName)"
            }
            if ($child.Name -eq '.active') { throw "Active marker found: $($child.FullName)" }
            if ($child.PSIsContainer) {
                $pending.Push($child.FullName)
            } else {
                $bytes += $child.Length
                $files++
                $records.Add(('F|{0}|{1}|{2}' -f $child.FullName.Substring($Path.Length), $child.Length, $child.LastWriteTimeUtc.Ticks))
            }
        }
    }
    $records.Sort([StringComparer]::Ordinal)
    $hash = [Security.Cryptography.SHA256]::Create()
    try {
        $signature = [BitConverter]::ToString($hash.ComputeHash([Text.Encoding]::UTF8.GetBytes(($records -join [char]10))))
    } finally { $hash.Dispose() }
    return [pscustomobject]@{ Bytes = $bytes; Files = $files; Signature = $signature }
}

function Assert-NoArchiveProcess {
    $processes = @(Get-CimInstance Win32_Process -ErrorAction Stop)
    foreach ($process in $processes) {
        if ($process.ProcessId -eq $PID) { continue }
        $command = ([string]$process.CommandLine).Replace('/', '\')
        $executable = ([string]$process.ExecutablePath).Replace('/', '\')
        if ($command.IndexOf($archiveRoot, $comparison) -ge 0 -or $executable.StartsWith($archiveRoot + '\', $comparison)) {
            throw "Archive is referenced by process $($process.ProcessId) ($($process.Name)); exit it and retry."
        }
    }
}

Assert-PlainPath $manifestPath
Assert-PlainPath $resultPath
if (Test-Path -LiteralPath $resultPath -PathType Container) { throw 'Cleanup report path is a directory.' }
$packagePath = Join-Path $clipRoot 'package.json'
Assert-PlainPath $packagePath
if (-not (Test-Path -LiteralPath (Join-Path $clipRoot '.git')) -or
    (Get-Content -LiteralPath $packagePath -Raw | ConvertFrom-Json).name -ne 'clip-desktop') {
    throw 'Run this script from the Clip repository scripts directory.'
}
$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
$entries = @($manifest.Archived)
if (-not $entries.Count -or $entries.Count -ne $manifest.ArchivedDirectories) {
    throw 'The archived profile manifest is empty or inconsistent.'
}
$patterns = @{
    'chat-ui' = '^profile-[A-Za-z0-9]{6}$'
    'verification' = '^(profile-|helper-|gaps-profile-)[A-Za-z0-9]{6}$'
    'development' = '^category-counts-[A-Za-z0-9]{6}$'
}
$seen = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
$targets = [Collections.Generic.List[object]]::new()
[int]$missing = 0
foreach ($entry in $entries) {
    $absolute = [IO.Path]::GetFullPath([string]$entry.ArchivePath)
    $group = Split-Path -Leaf (Split-Path -Parent $absolute)
    $name = Split-Path -Leaf $absolute
    if (-not $patterns.ContainsKey($group) -or $name -notmatch $patterns[$group]) {
        throw "Unexpected archive entry: $absolute"
    }
    $expected = Join-Path (Join-Path $archiveRoot $group) $name
    $original = Join-Path (Join-Path (Join-Path $clipRoot 'work') $group) $name
    if (-not $absolute.Equals($expected, $comparison) -or
        -not ([string]$entry.OriginalPath).Equals($original, $comparison) -or
        -not $seen.Add($absolute) -or [long]$entry.Bytes -lt 0 -or [int]$entry.Files -lt 0) {
        throw "Manifest path, duplicate, or metadata mismatch: $absolute"
    }
    Assert-PlainPath $absolute
    if (-not (Test-Path -LiteralPath $absolute)) { $missing++; continue }
    $snapshot = Get-ProfileSnapshot $absolute
    if ($snapshot.Bytes -ne [long]$entry.Bytes -or $snapshot.Files -ne [int]$entry.Files) {
        throw "Profile changed since archival; nothing has been deleted: $absolute"
    }
    $targets.Add([pscustomobject]@{
        Path = $absolute; Folder = "$group\$name"; Bytes = $snapshot.Bytes
        Files = $snapshot.Files; Signature = $snapshot.Signature
    })
}
Assert-NoArchiveProcess
[long]$totalBytes = 0
foreach ($target in $targets) { $totalBytes += $target.Bytes }
$targets | Select-Object Folder, Files, @{Name = 'MiB'; Expression = { [Math]::Round($_.Bytes / 1MB, 2) }} | Format-Table -AutoSize
Write-Host ("Verified: {0} directories, {1:N1} MiB; already absent: {2}." -f $targets.Count, ($totalBytes / 1MB), $missing)
if (-not $Apply) {
    Write-Host 'Preview only. Run again with -Apply to delete exactly these archived test profiles.'
    return
}
if (-not $targets.Count) { Write-Host 'Nothing to clean.'; return }

# Preflight checks finish for every entry before the first deletion.
$removed = [Collections.Generic.List[object]]::new()
$failure = $null
try {
    foreach ($target in $targets) {
        if (-not $PSCmdlet.ShouldProcess($target.Path, 'Permanently delete the verified archived test profile')) { continue }
        Assert-NoArchiveProcess
        $current = Get-ProfileSnapshot $target.Path
        if ($current.Signature -ne $target.Signature) { throw "Profile changed after preview: $($target.Path)" }
        Remove-Item -LiteralPath $target.Path -Recurse -Force -ErrorAction Stop
        if (Test-Path -LiteralPath $target.Path) { throw "Cleanup incomplete: $($target.Path)" }
        $removed.Add([pscustomobject]@{ Path = $target.Path; Bytes = $target.Bytes; Files = $target.Files })
    }
} catch {
    $failure = $_.Exception.Message
    throw
} finally {
    if (-not $WhatIfPreference) {
        Assert-PlainPath $resultPath
        [long]$freedBytes = 0
        foreach ($item in $removed) { $freedBytes += $item.Bytes }
        [ordered]@{
            CompletedAt = [DateTimeOffset]::Now.ToString('o')
            Manifest = $manifestPath; RemovedDirectories = $removed.Count
            FreedBytes = $freedBytes; Failure = $failure; Removed = $removed.ToArray()
        } | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $resultPath -Encoding UTF8
    }
}
if ($WhatIfPreference) { Write-Host 'WhatIf only; no files deleted and no cleanup report written.'; return }
Write-Host ("Deleted {0} verified test directories. Report: {1}" -f $removed.Count, $resultPath)
