# Creates a pinnable "Andah Language Tree" shortcut on the Desktop and in the
# Start Menu. Windows won't pin a .bat to the taskbar, but it will pin a .lnk
# whose target is a real executable (wscript.exe) -- so the shortcut runs the
# exact same hidden launcher that start.bat does.
#
# Run: double-click make-app.bat (or run this file directly). Safe to re-run.

$ErrorActionPreference = 'Stop'

$root    = Split-Path -Parent $PSScriptRoot          # repo root (parent of scripts\)
$vbs     = Join-Path $root 'scripts\hidden-launch.vbs'
$wscript = Join-Path $env:WINDIR 'System32\wscript.exe'
$icon    = Join-Path $root 'assets\icon.ico'          # optional; used only if present

$targets = @(
    [Environment]::GetFolderPath('Desktop'),
    (Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs')
)

$shell = New-Object -ComObject WScript.Shell

foreach ($dir in $targets) {
    if (-not (Test-Path $dir)) { continue }
    $lnkPath = Join-Path $dir 'Andah Language Tree.lnk'

    $lnk = $shell.CreateShortcut($lnkPath)
    $lnk.TargetPath       = $wscript
    $lnk.Arguments        = '"' + $vbs + '"'
    $lnk.WorkingDirectory = $root
    $lnk.Description       = 'Andah Language Tree'
    if (Test-Path $icon) { $lnk.IconLocation = $icon }
    $lnk.Save()

    Write-Host "Created: $lnkPath"
}

Write-Host ''
Write-Host 'Done. To pin: right-click the new "Andah Language Tree" shortcut ->'
Write-Host 'Show more options -> Pin to taskbar.'
if (-not (Test-Path $icon)) {
    Write-Host ''
    Write-Host 'No icon yet. Drop an icon at assets\icon.ico and re-run this to set it.'
}
