param([ValidateRange(1,20)][int]$Samples=3,[ValidateRange(100,5000)][int]$IntervalMs=1000)
$ErrorActionPreference='Stop'
$clipperRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..')).TrimEnd('\')
if($clipperRoot -ne 'D:\Repositories\Clipper'){throw 'Run the measurement from the canonical Clipper repository.'}
$records=[Collections.Generic.List[object]]::new()
for($sample=0;$sample -lt $Samples;$sample++){
 $inventory=@(Get-CimInstance Win32_Process)
 $roots=@($inventory | Where-Object {
  $_.ExecutablePath -and $_.CommandLine -notmatch '\s--type=' -and (
   ($_.Name -eq 'One.exe' -and $_.ExecutablePath.StartsWith('D:\Repositories\One\release\',[StringComparison]::OrdinalIgnoreCase)) -or
   ($_.Name -eq 'Clipper.exe' -and $_.ExecutablePath.StartsWith($clipperRoot+'\release\',[StringComparison]::OrdinalIgnoreCase)) -or
   ($_.Name -eq 'electron.exe' -and $_.ExecutablePath -eq ($clipperRoot+'\node_modules\electron\dist\electron.exe'))
  )
 })
 $counters=@(Get-CimInstance Win32_PerfFormattedData_PerfProc_Process)
 foreach($root in $roots){
  $owned=[Collections.Generic.HashSet[uint32]]::new();$null=$owned.Add($root.ProcessId)
  do{$added=$false;foreach($process in $inventory){if($owned.Contains($process.ParentProcessId) -and $process.ExecutablePath -and ($process.ExecutablePath.StartsWith($clipperRoot+'\',[StringComparison]::OrdinalIgnoreCase) -or $process.ExecutablePath.StartsWith('D:\Repositories\One\',[StringComparison]::OrdinalIgnoreCase))){if($owned.Add($process.ProcessId)){$added=$true}}}}while($added)
  $members=@($inventory | Where-Object {$owned.Contains($_.ProcessId)} | ForEach-Object {
   $process=$_;$counter=$counters | Where-Object {$_.IDProcess -eq $process.ProcessId} | Select-Object -First 1
   $role=if($process.CommandLine -match '\s--type=([^\s]+)'){$Matches[1]}elseif($process.ProcessId -eq $root.ProcessId){'main'}else{$process.Name}
   [pscustomobject]@{Pid=$process.ProcessId;Role=$role;CounterAvailable=($null -ne $counter);PrivateWorkingBytes=$(if($counter){[long]$counter.WorkingSetPrivate}else{$null});WorkingBytes=$(if($counter){[long]$counter.WorkingSet}else{$null});PrivateCommittedBytes=$(if($counter){[long]$counter.PrivateBytes}else{$null})}
  })
  $complete=@($members | Where-Object {-not $_.CounterAvailable}).Count -eq 0
  $name=if($root.Name -eq 'One.exe'){'One release'}elseif($root.Name -eq 'Clipper.exe'){'Clipper release'}else{'Clipper development'}
  $records.Add([pscustomobject]@{Sample=$sample;At=[DateTime]::UtcNow.ToString('o');Application=$name;RootPid=$root.ProcessId;Executable=$root.ExecutablePath;Complete=$complete;PrivateWorkingBytes=$(if($complete){[long](($members | Measure-Object PrivateWorkingBytes -Sum).Sum)}else{$null});PrivateCommittedBytes=$(if($complete){[long](($members | Measure-Object PrivateCommittedBytes -Sum).Sum)}else{$null});Processes=$members})
 }
 if($sample -lt $Samples-1){Start-Sleep -Milliseconds $IntervalMs}
}
$report=[pscustomobject]@{CreatedAt=[DateTime]::UtcNow.ToString('o');RequestedSamples=$Samples;Scope='Read-only live process observation. Window visibility, uptime, content and workload are uncontrolled; values are not an equal-workload performance ranking.';Samples=@($records)}
$report | ConvertTo-Json -Depth 6
