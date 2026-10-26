param([string]$OutputDirectory = '')
$ErrorActionPreference = 'Stop'
$AppRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$Payload = Join-Path $AppRoot 'release/win-unpacked'
$Builds = [IO.Path]::GetFullPath((Join-Path $AppRoot '../builds'))
if ($OutputDirectory) { $Builds = [IO.Path]::GetFullPath($OutputDirectory) }
$Version = (Get-Content -LiteralPath (Join-Path $AppRoot 'package.json') -Raw | ConvertFrom-Json).version
$BuildId = [DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss')
$ZipPath = Join-Path $Builds "PhotoBooth-Folder-$Version-$BuildId.zip"
$Required = @('PhotoBooth.exe', 'edsdk-bridge.exe', 'EDSDK.dll', 'EdsImage.dll', 'resources/app.asar',
  'resources/bundled-config/ai-models/birefnet-lite.onnx',
  'resources/bundled-config/ai-models/u2net.onnx', 'resources/bundled-config/ai-models/yunet.onnx')
foreach ($Name in $Required) {
  if (-not (Test-Path -LiteralPath (Join-Path $Payload $Name))) { throw "Missing payload file: $Name" }
}
if (Get-Process PhotoBooth -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq (Join-Path $Payload 'PhotoBooth.exe') }) {
  throw 'Close the build being packaged first.'
}
New-Item -ItemType Directory -Force -Path $Builds | Out-Null
$Meta = [ordered]@{version=$Version; buildId=$BuildId; builtAt=[DateTime]::UtcNow.ToString('o'); channel='folder'; productName='PhotoBooth'}
$Meta | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $Payload 'version.json') -Encoding Ascii
# Use standard Deflate ZIP with stronger compression, retaining every model and asset.
$SevenZip = Join-Path $AppRoot 'node_modules/7zip-bin/win/x64/7za.exe'
if (-not (Test-Path -LiteralPath $SevenZip)) { throw 'Run npm install before packaging (7zip-bin is required).' }
Push-Location -LiteralPath $Payload
try {
  & $SevenZip a -tzip -mm=Deflate -mx=9 -mfb=258 -mpass=15 $ZipPath '*' | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'OTA ZIP compression failed.' }
} finally { Pop-Location }
if ((Get-Item -LiteralPath $ZipPath).Length -gt 600MB) { throw "Package exceeds Moments server's 600 MB limit: $ZipPath" }
Add-Type -AssemblyName System.IO.Compression.FileSystem
$Archive = [IO.Compression.ZipFile]::OpenRead($ZipPath)
try {
  $Names = @($Archive.Entries | ForEach-Object { $_.FullName.Replace('\','/') })
  foreach ($Name in ($Required + 'version.json')) {
    if ($Names -notcontains $Name) { throw "ZIP missing: $Name" }
  }
  if ($Names -match '(^|/)(capture|logs|data|updates)/|photobooth-config\.json$') { throw 'Unexpected runtime data in ZIP' }
  $EntryCount = $Archive.Entries.Count
} finally { $Archive.Dispose() }
$Sha = (Get-FileHash -LiteralPath $ZipPath -Algorithm SHA256).Hash.ToLowerInvariant()
"$Sha  $([IO.Path]::GetFileName($ZipPath))" | Set-Content -LiteralPath "$ZipPath.sha256" -Encoding Ascii
$Meta['bytes'] = (Get-Item -LiteralPath $ZipPath).Length
$Meta['sha256'] = $Sha
$Meta['entries'] = $EntryCount
$Meta | ConvertTo-Json | Set-Content -LiteralPath "$ZipPath.manifest.json" -Encoding Ascii
$Meta | ConvertTo-Json
Write-Output $ZipPath
