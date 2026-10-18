$ErrorActionPreference = 'Stop'
$workspacePath = Split-Path -Parent $PSScriptRoot
$pluginPath = Join-Path $workspacePath 'scribe-flipbook'
$zipPath = Join-Path $workspacePath 'scribe-flipbook.zip'
Compress-Archive -LiteralPath $pluginPath -DestinationPath $zipPath -Force
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [System.IO.Compression.ZipFile]::OpenRead($zipPath)
try {
    $entries = @($archive.Entries | ForEach-Object { $_.FullName.Replace('\', '/') })
    foreach ($required in @('scribe-flipbook/scribe-flipbook.php', 'scribe-flipbook/templates/reader.php', 'scribe-flipbook/assets/viewer.js', 'scribe-flipbook/assets/viewer-runtime.js', 'scribe-flipbook/assets/library.js', 'scribe-flipbook/assets/vendor/pdf.worker.js')) {
        if ($required -notin $entries) { throw "Missing ZIP entry: $required" }
    }
    if ($entries | Where-Object { $_ -match 'node_modules|qa/|security-audit|wordfence' }) { throw 'Unexpected files in plugin ZIP.' }
    Write-Output "Verified $($entries.Count) plugin files in $zipPath"
} finally { $archive.Dispose() }
Get-Item -LiteralPath $zipPath | Select-Object FullName,Length
