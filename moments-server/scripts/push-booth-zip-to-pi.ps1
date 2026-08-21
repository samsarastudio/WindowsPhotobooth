# Push a Folder-build zip to the Moments Pi and register it (bypasses Cloudflare).
# Usage:
#   .\scripts\push-booth-zip-to-pi.ps1 -ZipPath "..\builds\PhotoBooth-Folder-1.1.0-....zip" -PiHost "pi@192.168.1.10"
#   .\scripts\push-booth-zip-to-pi.ps1 -ZipPath "...." -PiHost "pi@moments-pi" -Rollout

param(
  [Parameter(Mandatory = $true)][string]$ZipPath,
  [Parameter(Mandatory = $true)][string]$PiHost,
  [string]$RemoteDir = "~/moments-server/incoming",
  [switch]$Rollout
)

$ErrorActionPreference = "Stop"
$zip = Resolve-Path $ZipPath
$name = Split-Path $zip -Leaf
if ($name -notmatch '\.zip$') { throw "Expected a .zip file" }

Write-Host "Creating remote dir $RemoteDir on $PiHost…"
ssh $PiHost "mkdir -p $RemoteDir"

Write-Host "scp $name → ${PiHost}:$RemoteDir/"
scp $zip "${PiHost}:$RemoteDir/$name"

$regArgs = "incoming/$name"
if ($Rollout) { $regArgs = "$regArgs --rollout" }

Write-Host "Registering on Pi…"
ssh $PiHost "cd ~/moments-server && node scripts/register-booth-zip.mjs $regArgs"

Write-Host "Done. Open https://moments.inmomentservices.com/admin → Booth updates → Refresh."
