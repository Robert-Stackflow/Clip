param(
    [string]$Payload,
    [string]$AppAsar,
    [string]$Output,
    [string]$VerificationProduct,
    [string]$VerificationDirectory
)
$ErrorActionPreference = 'Stop'
$taskRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$package = Get-Content -LiteralPath (Join-Path $taskRoot 'package.json') -Raw | ConvertFrom-Json
$version = $package.version
if (-not $Payload) { $Payload = Join-Path $taskRoot ('release\'+$version+'\Clipper-'+$version+'-Setup-x64.exe') }
if (-not $AppAsar) { $AppAsar = Join-Path $taskRoot ('release\'+$version+'\win-unpacked\resources\app.asar') }
$payloadFile = Get-Item -LiteralPath $Payload
$asarFile = Get-Item -LiteralPath $AppAsar
$fixture = [bool]$VerificationProduct
$product = 'Clipper'
$directory = ''
$nsisGuid = $package.build.nsis.guid
if (-not $nsisGuid) {
    # electron-builder's documented UUID-v5 identity, kept identical to its NSIS target.
    $namespaceHex = '50e065bc313411e69bab38c9862bdaf3'
    [byte[]]$namespaceBytes = @(for ($index=0; $index -lt 32; $index+=2) { [Convert]::ToByte($namespaceHex.Substring($index,2),16) })
    $taskIdentity = [Security.Cryptography.SHA1]::Create()
    try { $taskGuidBytes = $taskIdentity.ComputeHash($namespaceBytes + [Text.Encoding]::UTF8.GetBytes($package.build.appId))[0..15] }
    finally { $taskIdentity.Dispose() }
    $taskGuidBytes[6] = ($taskGuidBytes[6] -band 15) -bor 80
    $taskGuidBytes[8] = ($taskGuidBytes[8] -band 63) -bor 128
    $taskHex = [BitConverter]::ToString([byte[]]$taskGuidBytes).Replace('-','').ToLowerInvariant()
    $nsisGuid = $taskHex.Substring(0,8)+'-'+$taskHex.Substring(8,4)+'-'+$taskHex.Substring(12,4)+'-'+$taskHex.Substring(16,4)+'-'+$taskHex.Substring(20,12)
}
if ($fixture) {
    if ($VerificationProduct -notmatch '^ClipperVerification-[0-9a-f-]{36}$') { throw 'A unique verification identity is required.' }
    $product = $VerificationProduct
    $nsisGuid = $VerificationProduct.Substring('ClipperVerification-'.Length)
    $directory = [IO.Path]::GetFullPath($VerificationDirectory)
    $allowed = [IO.Path]::GetFullPath((Join-Path $taskRoot 'work\installer-lifecycle')) + '\'
    if (-not $directory.StartsWith($allowed, [StringComparison]::OrdinalIgnoreCase)) { throw 'Verification installation must stay within its own workspace.' }
}
$buildFolder = Join-Path $taskRoot ('work\custom-installer-build\' + $product)
New-Item -ItemType Directory -Path $buildFolder -Force | Out-Null
if (-not $Output) { $Output = Join-Path $buildFolder ('Clipper-' + $version + '-Setup-x64.exe') }
$Output = [IO.Path]::GetFullPath($Output)
if ($Output.Equals($payloadFile.FullName, [StringComparison]::OrdinalIgnoreCase)) { throw 'The graphical installer must not overwrite its engine input.' }
New-Item -ItemType Directory -Path (Split-Path -Parent $Output) -Force | Out-Null
function Get-InstallerHash([string]$File) {
    $taskHash = [Security.Cryptography.SHA256]::Create()
    $taskStream = [IO.File]::OpenRead($File)
    try { return [BitConverter]::ToString($taskHash.ComputeHash($taskStream)).Replace('-','').ToLowerInvariant() }
    finally { $taskStream.Dispose(); $taskHash.Dispose() }
}
$payloadHash = Get-InstallerHash $payloadFile.FullName
$asarHash = Get-InstallerHash $asarFile.FullName
$safeDirectory = $directory.Replace('\','\\').Replace('"','\"')
$fixtureLiteral = if ($fixture) { 'true' } else { 'false' }
$info = @"
[assembly: System.Reflection.AssemblyTitle("Clipper Setup")]
[assembly: System.Reflection.AssemblyDescription("Clipper graphical installer")]
[assembly: System.Reflection.AssemblyProduct("Clipper")]
[assembly: System.Reflection.AssemblyCompany("Clipper")]
[assembly: System.Reflection.AssemblyVersion("$version.0")]
[assembly: System.Reflection.AssemblyFileVersion("$version.0")]
namespace ClipperSetup {
    internal static class BuildInfo {
        public const string Version = "$version";
        public const string ProductName = "$product";
        public const string NsisGuid = "$nsisGuid";
        public const string InstallDirectory = "$safeDirectory";
        public const string PayloadSha256 = "$payloadHash";
        public const long PayloadLength = $($payloadFile.Length)L;
        public const string AsarSha256 = "$asarHash";
        public const bool Verification = $fixtureLiteral;
    }
}
"@
$infoFile = Join-Path $buildFolder 'BuildInfo.cs'
[IO.File]::WriteAllText($infoFile, $info, [Text.UTF8Encoding]::new($true))
$framework = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319'
$compiler = Join-Path $framework 'csc.exe'
$arguments = @('/nologo','/target:winexe','/platform:x64','/optimize+','/codepage:65001',('/out:' + $Output),
    ('/win32icon:' + (Join-Path $taskRoot 'assets\clipper.ico')),
    ('/win32manifest:' + (Join-Path $PSScriptRoot 'app.manifest')),
    ('/resource:' + $payloadFile.FullName + ',Clipper.Payload'),
    ('/resource:' + (Join-Path $PSScriptRoot 'MainView.xaml') + ',Clipper.View.xaml'),
    ('/resource:' + (Join-Path $taskRoot 'assets\clipper.png') + ',Clipper.Icon.png'))
foreach ($reference in @('System.dll','System.Core.dll','System.Xaml.dll','WPF\WindowsBase.dll','WPF\PresentationCore.dll','WPF\PresentationFramework.dll')) {
    $arguments += '/reference:' + (Join-Path $framework $reference)
}
$arguments += @( (Join-Path $PSScriptRoot 'InstallerCore.cs'), (Join-Path $PSScriptRoot 'InstallerApp.cs'), $infoFile )
& $compiler @arguments
if ($LASTEXITCODE -ne 0) { throw 'Custom installer compilation failed.' }
$metadata = [ordered]@{ version=$version; installer=$Output; bytes=(Get-Item -LiteralPath $Output).Length;
    sha256=(Get-InstallerHash $Output);
    embeddedPayloadSha256=$payloadHash; installedAsarSha256=$asarHash; nsisGuid=$nsisGuid; verification=$fixture;
    runtime='.NET Framework 4.8 / Windows 10 and 11'; signed=$false }
$metadata | ConvertTo-Json | Set-Content -LiteralPath ($Output + '.json') -Encoding UTF8
$metadata | ConvertTo-Json
