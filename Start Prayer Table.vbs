' Start Prayer Table.vbs
' Launches the kiosk with no visible command prompt window.
' The bat file handles server startup and browser auto-restart.

Option Explicit

Dim objShell, objFSO, batPath

Set objShell = CreateObject("WScript.Shell")
Set objFSO   = CreateObject("Scripting.FileSystemObject")

batPath = objFSO.GetParentFolderName(WScript.ScriptFullName) & "\Start Prayer Table.bat"

' 0 = hidden window, False = don't wait (fire and forget)
objShell.Run "cmd /c """ & batPath & """", 0, False
