; Preserve the standard electron-builder install/uninstall implementation.
; The custom check asks the user to exit normally; it never kills a process.
!macro customHeader
  LangString ClipperCloseFirst 1033 "Clipper is running. Save unfinished work, choose Quit from the tray menu, then click Retry. Closing its window alone does not quit."
  LangString ClipperCloseFirst 2052 "Clipper 正在运行。请保存尚未完成的内容，从托盘菜单选择退出，再点击重试。仅关闭窗口不会退出程序。"
  LangString ClipperProcessCheckFailed 1033 "Unable to check whether Clipper is running. Installation or uninstallation has stopped without changing program files."
  LangString ClipperProcessCheckFailed 2052 "无法检查 Clipper 是否正在运行，已停止安装或卸载，未更改程序文件。"
  LangString ClipperUpgradeCopyFailed 1033 "Unable to preserve the previous program files. The upgrade has stopped; the previous installation and your history are retained."
  LangString ClipperUpgradeCopyFailed 2052 "无法保留旧版程序文件，已停止升级，旧版安装和历史数据保留。"
  LangString ClipperRemoveFailed 1033 "Some program files are in use or inaccessible. Close Clipper and retry; your history has not been removed."
  LangString ClipperRemoveFailed 2052 "部分程序文件正在使用或无法访问。请退出 Clipper 后重试，历史数据未被删除。"
!macroend

; The standard atomic upgrade uses Rename into $PLUGINSDIR, which fails when
; the installation and the temporary directory are on different volumes.
; Keep its same-volume path; on another volume copy the complete old program
; before deleting any original, and restore that copy if removal fails.
!macro customRemoveFiles
  ${If} ${isUpdated}
    CreateDirectory "$PLUGINSDIR\old-install"
    ${GetRoot} "$INSTDIR" $R1
    ${GetRoot} "$PLUGINSDIR" $R2
    ${If} $R1 == $R2
      Push ""
      Call un.atomicRMDir
      Pop $R0
      ${If} $R0 != 0
        Push ""
        Call un.restoreFiles
        Pop $R0
        SetErrorLevel 1603
        Abort "$(ClipperRemoveFailed)"
      ${EndIf}
    ${Else}
      ClearErrors
      CopyFiles /SILENT "$INSTDIR\*.*" "$PLUGINSDIR\old-install"
      ${If} ${Errors}
        SetErrorLevel 1603
        Abort "$(ClipperUpgradeCopyFailed)"
      ${EndIf}
    ${EndIf}
  ${EndIf}
  SetOutPath $TEMP
  ClearErrors
  RMDir /r "$INSTDIR"
  ${If} ${Errors}
    ${If} ${isUpdated}
      CopyFiles /SILENT "$PLUGINSDIR\old-install\*.*" "$INSTDIR"
    ${EndIf}
    SetErrorLevel 1603
    Abort "$(ClipperRemoveFailed)"
  ${EndIf}
!macroend

!macro customInstallMode
  StrCpy $isForceCurrentInstall "1"
!macroend

!macro customUnInstallCheck
  IfErrors 0 +2
  StrCpy $R0 1603
  ${If} $R0 != 0
    ${IfNot} ${Silent}
      MessageBox MB_OK|MB_ICONSTOP "$(ClipperRemoveFailed)"
    ${EndIf}
    SetErrorLevel $R0
    Quit
  ${EndIf}
!macroend

!macro customCheckAppRunning
  ${Do}
    ${nsProcess::FindProcess} "${APP_EXECUTABLE_FILENAME}" $R0
    ${nsProcess::Unload}
    ${If} $R0 == 603
      ${ExitDo}
    ${EndIf}
    ${If} $R0 != 0
      ${IfNot} ${Silent}
        MessageBox MB_OK|MB_ICONSTOP "$(ClipperProcessCheckFailed)"
      ${EndIf}
      SetErrorLevel 1603
      Quit
    ${EndIf}
    ${If} ${Silent}
      SetErrorLevel 1602
      Quit
    ${EndIf}
    MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "$(ClipperCloseFirst)" IDRETRY +3
    SetErrorLevel 1602
    Quit
  ${Loop}
!macroend
