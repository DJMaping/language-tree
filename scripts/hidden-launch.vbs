' Starts the Language Tree server invisibly (no console window). The server
' then opens its own app window (--open) and quits when that window closes
' (--auto-exit). Double-click start.bat rather than running this directly.
Dim fso, sh, root
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")
root = fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName))
sh.CurrentDirectory = root
sh.Run "cmd /c node server.js --open --auto-exit", 0, False
