# CP1500 USB recovery: preserve working queues, jobs, drivers and Windows print policy.
param([ValidateSet('Probe','Repair','RegisterTask')][string]$Action = 'Probe')
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$TaskName = 'PhotoBoothSelphyUsbRepair'
function Test-Admin {
 $p = [Security.Principal.WindowsPrincipal]::new([Security.Principal.WindowsIdentity]::GetCurrent())
 return $p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}
function Get-Probe {
 $nodes = @(Get-PnpDevice -PresentOnly -ErrorAction Stop | Where-Object {
  $_.InstanceId -match '^USB\\VID_04A9&PID_3302' -or $_.InstanceId -match '^USBPRINT\\CANONSELPHY_CP1500'
 })
 $hardware = @($nodes | Where-Object { $_.InstanceId -match '^USB\\VID_04A9&PID_3302' })
 $usbPrint = @($hardware | Where-Object {
  $service = Get-PnpDeviceProperty -InstanceId $_.InstanceId -KeyName DEVPKEY_Device_Service -ErrorAction SilentlyContinue
  $_.Status -eq 'OK' -and $service.Data -eq 'usbprint'
 })
 $ports = @($nodes | ForEach-Object { if ($_.InstanceId -match '^USBPRINT\\CANONSELPHY_CP1500.*&(USB\d+)$') { $Matches[1] } } | Select-Object -Unique)
 $queues = @(Get-CimInstance Win32_Printer | Where-Object { $_.Name -match 'SELPHY.*CP1500' -and $_.PortName -match '^USB\d+$' })
 $queue = $queues | Where-Object { $ports -contains $_.PortName } | Select-Object -First 1
 $port = if ($ports.Count -eq 1) { $ports[0] } else { $null }
 $code28 = @($nodes | Where-Object { $_.Problem -match 'FAILED_INSTALL|CM_PROB_FAILED_INSTALL' }).Count -gt 0
 $spooler = Get-Service Spooler
 $offline = [bool]($queue -and ($queue.WorkOffline -or $queue.PrinterStatus -eq 7))
 $ready = [bool]($hardware.Count -gt 0 -and $usbPrint.Count -gt 0 -and $queue -and -not $offline -and $spooler.Status -eq 'Running')
 [pscustomobject]@{
  present=($hardware.Count -gt 0); usbPrintOk=($usbPrint.Count -gt 0); code28=$code28; otherDevices=$code28
  ready=$ready; needsRepair=(-not $ready); queueName=$(if($queue){$queue.Name}else{$null})
  queueDriver=$(if($queue){$queue.DriverName}else{$null}); queuePort=$(if($queue){$queue.PortName}else{$port})
  usesIppDriver=[bool]($queue -and $queue.DriverName -match 'IPP'); workOffline=$offline
  instanceIds=@($hardware | ForEach-Object { $_.InstanceId }); admin=(Test-Admin)
  reason=$(if($ready){'already-ok'}elseif(-not $hardware.Count){'printer-not-present'}elseif(-not $port -and -not $queue){'usb-port-unresolved'}elseif($offline){'queue-offline'}else{'connection-not-ready'})
 }
}
function Invoke-Repair {
 $before = Get-Probe
 if ($before.ready) { return @{ok=$true; repaired=$false; reason='already-ok'; needsReboot=$false; probe=$before; steps=@()} }
 if (-not (Test-Admin)) { return @{ok=$false; repaired=$false; reason='access-denied'; needsReboot=$false; probe=$before; steps=@()} }
 $steps = [Collections.Generic.List[string]]::new()
 if ((Get-Service Spooler).Status -ne 'Running') { Start-Service Spooler; $steps.Add('start-spooler') }
 & pnputil.exe /scan-devices | Out-Null
 if ($LASTEXITCODE -ne 0) { throw 'Windows device rescan failed.' }
 $steps.Add('rescan-devices')
 Start-Sleep -Seconds 3
 $probe = Get-Probe
 if ($probe.present -and $probe.queuePort) {
  if ($probe.queueName -and $probe.workOffline) {
   $q = Get-CimInstance Win32_Printer | Where-Object Name -eq $probe.queueName
   $q | Set-CimInstance -Property @{WorkOffline=$false} | Out-Null
   $steps.Add('clear-offline-on-connected-printer')
  } elseif (-not $probe.queueName) {
   # The port is derived from the CP1500's live USBPRINT node, never the first USB port.
   $name = 'Canon SELPHY CP1500'
   if (Get-Printer -Name $name -ErrorAction SilentlyContinue) { $name = 'Canon SELPHY CP1500 USB' }
   if (Get-Printer -Name $name -ErrorAction SilentlyContinue) { throw 'An existing CP1500 queue needs manual port review.' }
   Add-Printer -Name $name -DriverName 'Microsoft IPP Class Driver' -PortName $probe.queuePort
   $steps.Add('add-cp1500-on-detected-port')
  }
 }
 $after = Get-Probe
 return @{ok=$after.ready; repaired=($steps.Count -gt 0); reason=$after.reason; needsReboot=$false; probe=$after; steps=@($steps.ToArray())}
}
try {
 if ($Action -eq 'Probe') { $result = Get-Probe }
 elseif ($Action -eq 'Repair') { $result = Invoke-Repair }
 else {
  if (-not (Test-Admin)) { throw 'Administrator access is required to update the repair task.' }
  $destDir = Join-Path $env:ProgramData 'PhotoBooth'
  New-Item -ItemType Directory -Force -Path $destDir | Out-Null
  $dest = Join-Path $destDir 'selphy-usb-repair.ps1'
  if ([IO.Path]::GetFullPath($PSCommandPath) -ne [IO.Path]::GetFullPath($dest)) { Copy-Item -LiteralPath $PSCommandPath -Destination $dest -Force }
  $taskAction = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument ('-NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $dest + '" -Action Repair')
  $trigger = New-ScheduledTaskTrigger -AtStartup
  $trigger.Delay = 'PT30S'
  $settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit (New-TimeSpan -Minutes 2) -MultipleInstances IgnoreNew -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
  Register-ScheduledTask -TaskName $TaskName -Action $taskAction -Trigger $trigger -Settings $settings -User SYSTEM -RunLevel Highest -Force | Out-Null
  $result = Invoke-Repair
  $result.taskRegistered = $true
 }
 $result | ConvertTo-Json -Compress -Depth 8
} catch {
 @{ok=$false; repaired=$false; reason='repair-error'; error=$_.Exception.Message; needsReboot=$false} | ConvertTo-Json -Compress
 exit 1
}
