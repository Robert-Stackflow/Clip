param([switch]$Apply,[switch]$Caches)
$ErrorActionPreference='Stop'
$clipRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..')).TrimEnd('\')
if($clipRoot -ne 'D:\Repositories\Clip' -or -not (Test-Path -LiteralPath (Join-Path $clipRoot '.git'))){throw 'Run the script from D:\Repositories\Clip.'}
$releaseRoot=Join-Path $clipRoot 'release'
$targets=[Collections.Generic.List[object]]::new()
$active=@(Get-CimInstance Win32_Process | Where-Object {$_.Name -match '^(Clip|electron|node|cargo)\.exe$'})
function Measure-ClipTree([string]$target){
 $pending=[Collections.Generic.Stack[string]]::new();$pending.Push($target);[long]$bytes=0;$links=[Collections.Generic.List[string]]::new()
 while($pending.Count){$item=Get-Item -LiteralPath $pending.Pop() -Force;if($item.Attributes -band [IO.FileAttributes]::ReparsePoint){throw "Cleanup root cannot be a directory link: $($item.FullName)"};if(-not $item.PSIsContainer){$bytes+=$item.Length;continue};foreach($child in Get-ChildItem -LiteralPath $item.FullName -Force){if($child.Attributes -band [IO.FileAttributes]::ReparsePoint){$links.Add($child.FullName);continue};if($child.PSIsContainer){$pending.Push($child.FullName)}else{$bytes+=$child.Length}}};return [pscustomobject]@{Bytes=$bytes;Links=@($links)}
}
function Add-ClipTarget([string]$target,[string]$boundary,[string]$reason){
 if(-not(Test-Path -LiteralPath $target)){return};$absolute=[IO.Path]::GetFullPath($target);$prefix=[IO.Path]::GetFullPath($boundary).TrimEnd('\')+'\'
 if(-not $absolute.StartsWith($prefix,[StringComparison]::OrdinalIgnoreCase)){throw "Cleanup boundary mismatch: $absolute"}
 foreach($name in @('.git','src','native','assets','build','scripts','tests','docs','licenses','node_modules','dev-data')){$protected=Join-Path $clipRoot $name;if($absolute -eq $protected -or $absolute.StartsWith($protected+'\',[StringComparison]::OrdinalIgnoreCase) -or $protected.StartsWith($absolute+'\',[StringComparison]::OrdinalIgnoreCase)){throw "Protected source or dependency: $absolute"}}
 if($active | Where-Object {$_.ExecutablePath -and $_.ExecutablePath.StartsWith($absolute+'\',[StringComparison]::OrdinalIgnoreCase) -or $_.CommandLine -and $_.CommandLine.Contains($absolute)}){throw "Target is still used by a process: $absolute"}
 if($targets | Where-Object {$absolute.StartsWith($_.Path+'\',[StringComparison]::OrdinalIgnoreCase) -or $_.Path -eq $absolute}){return}
 $measured=Measure-ClipTree $absolute
 $targets.Add([pscustomobject]@{Path=$absolute;Boundary=$prefix;Reason=$reason;Bytes=$measured.Bytes;Links=$measured.Links})
}
$packages=@(if(Test-Path -LiteralPath $releaseRoot){Get-ChildItem -LiteralPath $releaseRoot -Directory | Where-Object {$_.Name -match '^\d+\.\d+\.\d+(?:-final)?$'} | ForEach-Object {[pscustomobject]@{Path=$_.FullName;Version=[version]($_.Name -replace '-final$','');Usable=((Test-Path -LiteralPath (Join-Path $_.FullName 'win-unpacked\Clip.exe')) -and (Test-Path -LiteralPath (Join-Path $_.FullName 'win-unpacked\resources\app.asar')))}}})
$retained=@($packages | Where-Object Usable | ForEach-Object {$_.Version} | Sort-Object -Descending -Unique | Select-Object -First 2)
if($retained.Count -lt 2 -and $packages.Count -gt 1){throw 'Two usable releases are required before pruning historical releases.'}
foreach($package in $packages){if($package.Version -notin $retained){Add-ClipTarget $package.Path $releaseRoot 'Keep the newest two usable versions'}}
$failedCandidate=Join-Path $releaseRoot '.building'
if(Test-Path -LiteralPath $failedCandidate){
 $candidateMeasure=Measure-ClipTree $failedCandidate
 $candidateMarker=Join-Path $failedCandidate '.clip-generated-release'
 if(Test-Path -LiteralPath $candidateMarker){if((Get-Content -LiteralPath $candidateMarker -Raw) -ne "Clip generated release staging`n"){throw 'Unexpected release candidate marker'}}
 else{
  if($candidateMeasure.Links.Count){throw 'Unexpected linked release candidate'}
  $remainingFiles=@(Get-ChildItem -LiteralPath $failedCandidate -File -Recurse -Force)
  $defaultArchive=Join-Path $failedCandidate 'win-unpacked\resources\default_app.asar'
  if($remainingFiles.Count -ne 1 -or $remainingFiles[0].FullName -ne $defaultArchive -or (Get-FileHash -LiteralPath $defaultArchive -Algorithm SHA256).Hash -ne (Get-FileHash -LiteralPath (Join-Path $clipRoot 'node_modules\electron\dist\resources\default_app.asar') -Algorithm SHA256).Hash){throw 'Unmarked release candidate has unexpected contents'}
 }
 Add-ClipTarget $failedCandidate $releaseRoot 'Failed generated package candidate; no running version is removed'
}
Add-ClipTarget (Join-Path $clipRoot 'work\obsolete-node_modules') (Join-Path $clipRoot 'work') 'Obsolete dependency tree, replaced by the current node_modules'
if($Caches){
 $usingWorkspace=$active | Where-Object {$_.ExecutablePath -and $_.ExecutablePath.StartsWith((Join-Path $clipRoot 'node_modules')+'\',[StringComparison]::OrdinalIgnoreCase) -or $_.CommandLine -and $_.CommandLine.Contains($clipRoot) -and $_.CommandLine -match 'scripts[\\/]|tests[\\/]'}
 foreach($lock in Get-ChildItem -LiteralPath (Join-Path $clipRoot 'work\current') -Filter '.active' -File -Recurse -ErrorAction SilentlyContinue){$testProcess=[int](Get-Content -LiteralPath $lock.FullName);if(Get-Process -Id $testProcess -ErrorAction SilentlyContinue){throw 'Verification is running; close it before clearing caches.'}}
 if($usingWorkspace){throw 'Close development and tests before clearing verification caches.'}
 $work=Join-Path $clipRoot 'work';$testText=(Get-ChildItem -LiteralPath (Join-Path $clipRoot 'tests') -File -Filter '*.cjs' | ForEach-Object {Get-Content -LiteralPath $_.FullName -Raw}) -join "`n"
 $prefixes=@([regex]::Matches($testText,'work/([A-Za-z0-9][A-Za-z0-9-]*-)') | ForEach-Object {$_.Groups[1].Value})+@('027-store-','027-files-','027-files-invalid-','027-sync-','027-sync-cancel-','027-record-')
 foreach($case in Get-ChildItem -LiteralPath $work -Directory){
  if($case.Name -in @('document-info-build','dev-profile','development','current','temp','obsolete-node_modules')){continue}
  $randomCase=@($prefixes | Where-Object {$case.Name -match ('^'+[regex]::Escape($_)+'[A-Za-z0-9]{6}$')}).Count -gt 0
  if($randomCase){Add-ClipTarget $case.FullName $work 'Obsolete private unit-test fixtures';continue}
  if($case.Name -eq 'temporary' -or $testText.Contains('work/'+$case.Name) -or $testText.Contains('work\'+$case.Name) -or $testText.Contains('work/current/'+$case.Name)){
   foreach($child in Get-ChildItem -LiteralPath $case.FullName -Directory){Add-ClipTarget $child.FullName $work 'Generated test profiles and fixtures; top-level reports remain'}
  }
 }
}
$reportRoot=Join-Path $clipRoot 'verification\storage';New-Item -ItemType Directory -Path $reportRoot -Force | Out-Null
$plan=@{Apply=[bool]$Apply;RetainedVersions=@($retained | ForEach-Object {$_.ToString()});Targets=$targets;PlannedBytes=[long](($targets | Measure-Object Bytes -Sum).Sum)}
$plan | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $reportRoot 'cleanup-plan.json') -Encoding utf8
$targets | Select-Object Path,Reason,@{Name='MiB';Expression={[Math]::Round($_.Bytes/1MB,1)}} | Format-Table -AutoSize
Write-Host ('Retained versions: '+($plan.RetainedVersions -join ', '))
if(-not $Apply){Write-Host 'Preview only. Add -Apply to remove the listed directories.';return}
$completed=[Collections.Generic.List[object]]::new();$failure=$null
try{foreach($target in $targets){$resolved=(Resolve-Path -LiteralPath $target.Path).Path;if($resolved -ne $target.Path -or -not $resolved.StartsWith($target.Boundary,[StringComparison]::OrdinalIgnoreCase)){throw 'Cleanup path changed.'};$measured=Measure-ClipTree $resolved;foreach($link in $measured.Links){if(-not $link.StartsWith($resolved+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'Link path changed.'};$linkedItem=Get-Item -LiteralPath $link -Force;if(-not($linkedItem.Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Link changed.'};if($linkedItem.PSIsContainer){[IO.Directory]::Delete($link)}else{[IO.File]::Delete($link)}};Remove-Item -LiteralPath $resolved -Recurse -Force -ErrorAction Stop;if(Test-Path -LiteralPath $resolved){throw 'Cleanup incomplete.'};$completed.Add($target)}}catch{$failure=$_.Exception.Message;throw}finally{@{Completed=$completed;FreedBytes=[long](($completed | Measure-Object Bytes -Sum).Sum);Failure=$failure} | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $reportRoot 'cleanup-result.json') -Encoding utf8}
