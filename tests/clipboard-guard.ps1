Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class ClipperClipboardGuard {
  [DllImport("user32.dll", SetLastError = true)] public static extern int CountClipboardFormats();
  [DllImport("user32.dll")] public static extern uint GetClipboardSequenceNumber();
  [DllImport("kernel32.dll")] public static extern void SetLastError(uint error);
}
'@

function Assert-ClipboardUnchanged([uint32]$ExpectedSequence) {
  [ClipperClipboardGuard]::SetLastError(0)
  $formats = [ClipperClipboardGuard]::CountClipboardFormats()
  $errorCode = [System.Runtime.InteropServices.Marshal]::GetLastWin32Error()
  if (($formats -eq 0 -and $errorCode -ne 0) -or
      $formats -ne 0 -or
      [ClipperClipboardGuard]::GetClipboardSequenceNumber() -ne $ExpectedSequence) {
    throw 'System clipboard changed before the real-app test could copy'
  }
}
